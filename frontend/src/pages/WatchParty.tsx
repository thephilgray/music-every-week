import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWatchPartySync } from '../hooks/useWatchPartySync';
import { WatchPartyChat } from '../components/WatchPartyChat';
import { WatchPartyAdmin } from '../components/WatchPartyAdmin';
import { Waveform } from '../components/ui/Waveform';
import { SongDetailsModal } from '../components/SongDetailsModal';
import { CollaboratorList } from '../components/ui/CollaboratorList';
import { ArrowLeft, Loader2, Play, AlertCircle, RefreshCcw, Info } from 'lucide-react';
import { fixUrl } from '../lib/url';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp, collection, query, onSnapshot, runTransaction, where, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Submission, UserProfile } from '../types';
import { usePlayer } from '../contexts/PlayerContext';
import { Users } from 'lucide-react';

export function WatchParty() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { party, loading, error, calculateOffset, status, currentIndex } = useWatchPartySync(id);
    const { pause: pauseGlobalPlayer, isPlaying: isGlobalPlaying } = usePlayer();
    const { user, isAdmin, profile } = useAuth();

    const [currentTrack, setCurrentTrack] = useState<Submission | null>(null);
    const [audioError, setAudioError] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [localProgress, setLocalProgress] = useState(0);
    const [presenceMap, setPresenceMap] = useState<Record<string, any>>({});
    const [showViewers, setShowViewers] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [showLyrics, setShowLyrics] = useState(false);
    const [hasInteracted, setHasInteracted] = useState(false);
    const hasJoinedRef = useRef(false);
    const playingIndexRef = useRef(currentIndex);
    const [isStageCollapsed, setIsStageCollapsed] = useState(false);

    // Dynamic Request Sync: Auto-append new submissions if the party was created from a request
    useEffect(() => {
        if (!party?.id || !party?.requestId) return;

        const isHostOrAdmin = user && (user.uid === party.hostPub || isAdmin);
        
        // Only run sync if:
        // 1. User is the Host/Admin (always sync)
        // 2. OR it's a Radio Mode party (anyone can keep it fresh)
        if (!isHostOrAdmin && !party.isRadioMode) return;

        console.log("[WatchParty] Dynamic Sync active for Request:", party.requestId);

        const q = query(
            collection(db, 'submissions'),
            where('requestId', '==', party.requestId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newTrackIds: string[] = [];
            snapshot.forEach((doc) => {
                if (!party.playlist.includes(doc.id)) {
                    newTrackIds.push(doc.id);
                }
            });

            if (newTrackIds.length > 0) {
                console.log("[WatchParty] Found new submissions, auto-adding:", newTrackIds);
                updateDoc(doc(db, 'watchParties', party.id!), {
                    playlist: arrayUnion(...newTrackIds)
                }).catch(err => console.error("Error auto-syncing submissions:", err));
            }
        });

        return () => unsubscribe();
    }, [party?.id, party?.requestId, party?.playlist, party?.isRadioMode, user, isAdmin]);


    // Fetch the current track details when the index or party changes
    useEffect(() => {
        const fetchCurrentTrack = async () => {
            if (!party || !party.playlist || party.playlist.length === 0) return;
            const trackId = party.playlist[currentIndex];
            if (!trackId) {
                setCurrentTrack(null);
                return;
            }

            try {
                const docRef = doc(db, 'submissions', trackId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setCurrentTrack({ id: docSnap.id, ...docSnap.data() } as Submission);
                } else {
                    console.error("Track not found in DB");
                    setCurrentTrack(null);
                }
            } catch (err) {
                console.error("Error fetching track:", err);
            }
        };

        fetchCurrentTrack();
    }, [party?.playlist, currentIndex]);

    // Reset UI states when track changes
    useEffect(() => {
        setShowLyrics(false);
    }, [currentTrack?.id]);

    // Radio Mode Auto-Start: If we are in radio mode and it's not yet live, anyone can start it.
    useEffect(() => {
        if (!party || !party.isRadioMode || status !== 'scheduled' || !hasInteracted || party.playlist.length === 0) return;
        
        console.log("[WatchParty] Auto-starting Radio Mode session...");
        const partyRef = doc(db, 'watchParties', party.id!);
        updateDoc(partyRef, {
            status: 'live',
            trackStartTime: serverTimestamp(),
            pausedOffset: 0
        }).catch(err => console.error("Error auto-starting Radio Mode:", err));
    }, [party?.isRadioMode, status, hasInteracted, party?.id, party?.playlist]);

    // Manage Sync playback
    useEffect(() => {
        // Pause the global persistent player so we don't have overlapping audio
        if (isGlobalPlaying) {
            pauseGlobalPlayer();
        }

        const audio = audioRef.current;
        if (!audio || !currentTrack) return;

        if (status === 'live') {
            const url = fixUrl(currentTrack.audioUrl);
            if (url && audio.src !== url) {
                audio.src = url;
                playingIndexRef.current = currentIndex;
            }

            // Apply Volume Normalization
            if (currentTrack.volumeAdjustmentDb !== undefined) {
                const multiplier = Math.pow(10, currentTrack.volumeAdjustmentDb / 20);
                audio.volume = Math.max(0, Math.min(1, multiplier));
            } else {
                audio.volume = 1;
            }

            // Sync Time
            const offset = calculateOffset();
            
            // Allow a small buffer before forcing a hard seek to prevent stuttering
            const driftMs = Math.abs(audio.currentTime - offset) * 1000;
            if (driftMs > 1000) { 
                // BUG FIX: Prevent seeking to 0 if the track has naturally ended and the next track 
                // index/timestamp update is still propagating.
                const isAtEnd = audio.currentTime > 0 && Math.abs(audio.currentTime - audio.duration) < 0.5;
                if (offset === 0 && isAtEnd) {
                    console.log("[WatchParty] Skipping seek to 0 because track is at end and update might be pending.");
                } else {
                    audio.currentTime = offset;
                }
            }

            if (audio.paused && hasInteracted) {
                // Only call play if we are not at the end of the current track 
                // or if the offset is clearly not 0 (meaning we are mid-track)
                const isAtEnd = audio.currentTime > 0 && Math.abs(audio.currentTime - audio.duration) < 0.1;
                if (!(isAtEnd && offset === 0)) {
                    audio.play().catch(e => {
                        console.error("Autoplay prevented:", e);
                        setAudioError(true);
                    });
                }
            }
        } else if (status === 'paused' || status === 'scheduled' || status === 'ended') {
            if (!audio.paused) {
                audio.pause();
            }
        }
    }, [currentTrack, status, calculateOffset, isGlobalPlaying, pauseGlobalPlayer, currentIndex]);

    // Local progress for smooth waveform updates without React state lag
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        
        let reqId: number;
        const updateProgress = () => {
            if (audio.duration) {
                setLocalProgress(audio.currentTime / audio.duration);
            }
            reqId = requestAnimationFrame(updateProgress);
        };
        reqId = requestAnimationFrame(updateProgress);
        return () => cancelAnimationFrame(reqId);
    }, [currentTrack]);

    // Handle Media Session
    useEffect(() => {
        if (!currentTrack || !('mediaSession' in navigator) || !party) return;

        let isMounted = true;
        
        const updateMediaSession = async () => {
             const artworkUrl = currentTrack.artworkUrl || '/mewlogo.png';
             let artistName = currentTrack.byline;

             // Resolve actual name if byline is missing, just like CollaboratorList does
             if (!artistName) {
                 const uid = currentTrack.uploaderUid || currentTrack.originalUploaderPub;
                 if (uid) {
                     try {
                         const docRef = doc(db, 'profiles', uid);
                         const docSnap = await getDoc(docRef);
                         if (docSnap.exists() && isMounted) {
                             const data = docSnap.data() as UserProfile;
                             artistName = data.displayName || data.alias || uid.substring(0, 8);
                         } else {
                             artistName = uid.substring(0, 8);
                         }
                     } catch (e) {
                         artistName = uid.substring(0, 8);
                     }
                 } else if (currentTrack.uploaderEmail) {
                     artistName = currentTrack.uploaderEmail.split('@')[0];
                 } else {
                     artistName = 'Unknown Artist';
                 }
             }

             if (!isMounted) return;

             navigator.mediaSession.metadata = new MediaMetadata({
                 title: currentTrack.title,
                 artist: artistName,
                 artwork: [{ src: fixUrl(artworkUrl), sizes: '512x512', type: 'image/jpeg' }]
             });

             const isHostOrAdmin = user && (user.uid === party.hostPub || isAdmin);
             
             // Only bind action handlers if they have permission to actually change the state
             if (isHostOrAdmin) {
                 const partyRef = doc(db, 'watchParties', party.id!);
                 
                 navigator.mediaSession.setActionHandler('play', () => {
                     updateDoc(partyRef, { status: 'live', trackStartTime: serverTimestamp() });
                 });
                 
                 navigator.mediaSession.setActionHandler('pause', () => {
                     const currentOffsetSeconds = calculateOffset();
                     updateDoc(partyRef, { status: 'paused', pausedOffset: Math.floor(currentOffsetSeconds * 1000) });
                 });
                 
                 navigator.mediaSession.setActionHandler('nexttrack', () => {
                     if (currentIndex < party.playlist.length - 1) {
                         updateDoc(partyRef, { status: 'live', currentIndex: currentIndex + 1, trackStartTime: serverTimestamp(), pausedOffset: 0 });
                     }
                 });
                 
                 navigator.mediaSession.setActionHandler('previoustrack', () => {
                     if (currentIndex > 0) {
                         updateDoc(partyRef, { status: 'live', currentIndex: currentIndex - 1, trackStartTime: serverTimestamp(), pausedOffset: 0 });
                     } else if (audioRef.current) {
                         // Restart track
                         updateDoc(partyRef, { status: 'live', trackStartTime: serverTimestamp(), pausedOffset: 0 });
                     }
                 });
             } else {
                 // Clear handlers for listeners so lock screen buttons don't do anything
                 navigator.mediaSession.setActionHandler('play', null);
                 navigator.mediaSession.setActionHandler('pause', null);
                 navigator.mediaSession.setActionHandler('nexttrack', null);
                 navigator.mediaSession.setActionHandler('previoustrack', null);
             }
        };

        updateMediaSession();

        return () => { isMounted = false; };
    }, [currentTrack, party?.id, party?.hostPub, currentIndex, user?.uid, isAdmin, calculateOffset]);

    // Update Playback State for Media Session
    useEffect(() => {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.playbackState = status === 'live' ? 'playing' : 'paused';
    }, [status]);

    const handleTrackEnded = async () => {
        console.log("Track ended in player");
        if (!party || !user) return;
        
        const finishedIndex = playingIndexRef.current;

        // Hostless Radio Mode logic
        if (party.isRadioMode) {
            console.log("Radio Mode active. Attempting distributed client-side advancement...");
            const partyRef = doc(db, 'watchParties', party.id!);
            
            try {
                await runTransaction(db, async (trans) => {
                    const partyDoc = await trans.get(partyRef);
                    if (!partyDoc.exists()) return;
                    
                    const currentData = partyDoc.data() as import('../types').WatchParty;
                    
                    // Critical section: If the index has already been updated by another viewer 
                    // who finished milliseconds before us, abort our update.
                    if (currentData.currentIndex !== finishedIndex) {
                         console.log("Another viewer already advanced the track. Aborting.");
                         return; // Let the onSnapshot listener naturally catch us up
                    }
                    
                    let nextIndex = currentData.currentIndex + 1;
                    
                    // Loop back to beginning if we reach the end
                    if (nextIndex >= currentData.playlist.length) {
                         nextIndex = 0;
                    }
                    
                    trans.update(partyRef, {
                        status: 'live',
                        currentIndex: nextIndex,
                        trackStartTime: serverTimestamp(),
                        pausedOffset: 0
                    });
                });
                console.log("Successfully ran Radio Mode advancement transaction.");
            } catch (err) {
                console.error("Radio mode transaction failed:", err);
            }
            return;
        }

        // Standard Host-only Logic
        if (user.uid !== party.hostPub && !isAdmin) {
            console.log("Waiting for server sync from host");
            return;
        }

        console.log("Host advancing track...");
        const nextIndex = finishedIndex + 1;
        const partyRef = doc(db, 'watchParties', party.id!);

        if (nextIndex >= party.playlist.length) {
            // End of playlist
            await updateDoc(partyRef, {
                status: 'ended',
                currentIndex: nextIndex,
            });
        } else {
            // Advance to next track
            await updateDoc(partyRef, {
                status: 'live',
                currentIndex: nextIndex,
                trackStartTime: serverTimestamp(),
                pausedOffset: 0
            });
        }
    };

    // Presence & Join/Leave logic
    useEffect(() => {
        if (!id || !user || !profile) return;
        
        // Prevent duplicate joins on strict mode React re-renders if needed, 
        // though useEffect cleanup handles most
        const presenceRef = doc(db, 'watchParties', id, 'presence', user.uid);
        
        // isMounted not strictly needed since we use hasJoinedRef and cleanup

        const joinSequence = async () => {
            if (hasJoinedRef.current) return;
            hasJoinedRef.current = true;

            const name = profile.displayName || profile.alias || 'Anonymous';
            
            await setDoc(presenceRef, {
                uid: user.uid,
                displayName: name,
                avatarUrl: profile.avatarUrl || null,
                lastActive: serverTimestamp(),
                active: true
            });

            // System Join Message
            const msgRef = doc(collection(db, 'watchParties', id, 'messages'));
            await setDoc(msgRef, {
                uid: user.uid,
                displayName: name,
                text: 'joined the party',
                createdAt: serverTimestamp(),
                isSystem: true,
                systemType: 'join'
            });
        };

        joinSequence();

        return () => {
            hasJoinedRef.current = false;
            deleteDoc(presenceRef).catch(console.error);

            // System Leave Message
            const name = profile.displayName || profile.alias || 'Anonymous';
            const leaveRef = doc(collection(db, 'watchParties', id, 'messages'));
            setDoc(leaveRef, {
                uid: user.uid,
                displayName: name,
                text: 'left the party',
                createdAt: serverTimestamp(),
                isSystem: true,
                systemType: 'leave'
            }).catch(console.error);
        };
    }, [id, user, profile?.displayName, profile?.alias, profile?.avatarUrl]);

    // Presence Listener
    useEffect(() => {
        if (!id) return;
        const q = query(collection(db, 'watchParties', id, 'presence'));
        const unsub = onSnapshot(q, (snap) => {
            const temp: Record<string, any> = {};
            snap.forEach(d => { temp[d.id] = d.data(); });
            setPresenceMap(temp);
        });
        return () => unsub();
    }, [id]);

    const activeUsers = Object.values(presenceMap).filter((p: any) => p.active);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center bg-black">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    if (error || !party) {
        return (
            <div className="flex flex-col h-full items-center justify-center text-center p-4">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Watch Party Not Found</h2>
                <p className="text-gray-400 mb-6">The party you are looking for does not exist or has been removed.</p>
            <button
                onClick={() => navigate('/')}
                className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition"
            >
                Return Home
            </button>
        </div>
    );
}



if (!hasInteracted) {
    return (
        <div className="flex flex-col h-full bg-black items-center justify-center p-4">
            <div className="w-24 h-24 mb-6 relative">
                 <div className="absolute inset-0 bg-blue-500/20 blur-[30px] rounded-full animate-pulse" />
                 <img src="/mewlogo.png" className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 text-center">Watch Party</h1>
            <p className="text-gray-400 mb-8 max-w-md text-center">
                 Join the room to chat and listen in real-time with other creators.
            </p>
            <button
                onClick={() => setHasInteracted(true)}
                className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-3 transform hover:scale-105 active:scale-95"
            >
                <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                Join the Party
            </button>
        </div>
    );
}

return (
        <div className="flex flex-col md:flex-row h-full w-full bg-black overflow-hidden md:overflow-visible">
            {/* Audio Element Hidden */}
            <audio 
                ref={audioRef} 
                controls={false}
                onEnded={handleTrackEnded}
                onError={() => setAudioError(true)}
            />

            {/* Top Stage / Player Area */}
            <div className={`flex flex-col sticky top-0 md:relative ${isStageCollapsed ? 'h-[72px]' : 'h-[55dvh] md:h-full'} overflow-visible shrink-0 z-30 bg-black shadow-xl transition-all duration-300 border-b md:border-b-0 border-gray-800 md:flex-1`}>
                
                {/* Header Overlay (Shared between full and mini) */}
                <div className="absolute top-0 inset-x-0 p-4 z-20 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-4 pointer-events-auto">
                        <button 
                            onClick={() => navigate(-1)}
                            className="p-2 bg-black/50 hover:bg-black/80 rounded-full text-white backdrop-blur-sm transition-all"
                            title="Back"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        
                        {isStageCollapsed && currentTrack && (
                            <div className="animate-in fade-in slide-in-from-left-4 max-w-[150px] sm:max-w-xs">
                                <p className="text-sm font-bold text-white leading-tight truncate">{currentTrack.title}</p>
                                <p className="text-[10px] text-gray-400 leading-tight truncate">{currentTrack.byline || currentTrack.uploaderEmail?.split('@')[0]}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 pointer-events-auto">

                        <div className="relative">
                            <button 
                                onClick={() => setShowViewers(!showViewers)}
                                className="p-2 bg-black/50 hover:bg-black/80 rounded-full text-white backdrop-blur-sm transition-all flex items-center gap-2 px-3"
                            >
                                <Users className="w-4 h-4" />
                                <span className="text-xs font-bold">{activeUsers.length}</span>
                            </button>

                            {/* Viewers Popover */}
                            {showViewers && (
                                <div className="absolute top-full right-0 mt-3 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden transform origin-top-right transition-all">
                                    <div className="p-3 border-b border-gray-800 font-semibold text-white">
                                        Viewers ({activeUsers.length})
                                    </div>
                                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                        {activeUsers.map((u: any) => (
                                            <div key={u.uid} className="flex items-center gap-3 p-3 hover:bg-gray-800 transition">
                                                <img 
                                                    src={fixUrl(u.avatarUrl) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} 
                                                    className="w-8 h-8 rounded-full object-cover shrink-0" 
                                                />
                                                <span className="text-gray-300 text-sm truncate">{u.displayName}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Visualizer Stage content - only truly visible when expanded */}
                <div className={`flex-1 flex flex-col items-center relative overflow-y-auto custom-scrollbar pt-16 md:pt-24 transition-opacity duration-300 ${isStageCollapsed ? 'md:opacity-100 opacity-0 pointer-events-none md:pointer-events-auto' : 'opacity-100'}`}>
                    <div className="max-w-2xl w-full mx-auto flex flex-col items-center p-4">
                        {currentTrack ? (
                            <>
                                {currentTrack.artworkUrl ? (
                                    <div 
                                        className="w-40 h-40 md:w-64 md:h-64 rounded-xl overflow-hidden shadow-2xl mb-6 md:mb-8 relative group cursor-pointer border border-gray-800/50 hover:border-blue-500/50 transition-colors shrink-0"
                                        onClick={() => setShowDetails(true)}
                                    >
                                        <img src={fixUrl(currentTrack.artworkUrl)} alt={currentTrack.title} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                            <Info className="w-10 h-10 text-white" />
                                            <span className="text-white text-sm">View Details</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div 
                                        className="w-40 h-40 md:w-64 md:h-64 rounded-xl bg-gray-900 flex items-center justify-center shadow-2xl mb-6 md:mb-8 relative group cursor-pointer border border-gray-800 shrink-0"
                                        onClick={() => setShowDetails(true)}
                                    >
                                        <img src="/mewlogo.png" className="w-24 h-24 opacity-80" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                            <Info className="w-10 h-10 text-white" />
                                            <span className="text-white text-sm">View Details</span>
                                        </div>
                                    </div>
                                )}

                                <div className="text-center w-full flex flex-col items-center gap-1">
                                    <div className="w-full">
                                        <CollaboratorList 
                                            uploaderPub={currentTrack.originalUploaderPub}
                                            uploaderEmail={currentTrack.uploaderEmail}
                                            byline={currentTrack.byline}
                                            collaborators={currentTrack.collaborators as any}
                                            proxyFor={currentTrack.proxyFor}
                                            linkProfile={true}
                                            className="text-3xl md:text-5xl font-extrabold text-white text-center w-full block leading-none"
                                        />
                                    </div>
                                    <h2 className="text-lg md:text-xl font-medium text-gray-500 uppercase tracking-widest mt-2">{currentTrack.title}</h2>
                                </div>

                                 {/* Waveform Visualizer */}
                                <div className="w-full h-24 bg-gray-900/40 rounded-xl flex items-center justify-center p-4">
                                     {currentTrack.waveform ? (
                                         <Waveform data={currentTrack.waveform} progress={localProgress} interactive={false} height="h-16" />
                                     ) : (
                                         <div className="text-gray-600 animate-pulse text-sm">Generating visualization...</div>
                                     )}
                                </div>

                                {/* Feedback & Lyrics */}
                                <div className="w-full max-w-xl mx-auto mt-6 space-y-6">
                                    {/* Feedback Tags */}
                                    {(currentTrack.stage || currentTrack.usesAI || (currentTrack.feedbackFocus && currentTrack.feedbackFocus.length > 0)) && (
                                        <div className="flex flex-wrap gap-2 justify-center">
                                            {currentTrack.usesAI && (
                                                <span className="px-3 py-1 rounded-full bg-purple-900/30 border border-purple-800 text-purple-300 text-[10px] font-bold uppercase tracking-wider">
                                                    Uses AI
                                                </span>
                                            )}
                                            {currentTrack.stage && (
                                                <span className="px-3 py-1 rounded-full bg-blue-900/30 border border-blue-800 text-blue-300 text-[10px] font-bold uppercase tracking-wider">
                                                    {currentTrack.stage}
                                                </span>
                                            )}
                                            {currentTrack.feedbackFocus?.map((focus, i) => (
                                                <span key={i} className="px-3 py-1 rounded-full bg-gray-800 border border-gray-700 text-gray-300 text-[10px] font-medium uppercase tracking-wider">
                                                    {focus}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Lyrics Toggle */}
                                    {currentTrack.lyrics && (
                                        <div className="flex flex-col items-center">
                                            <button 
                                                onClick={() => setShowLyrics(!showLyrics)}
                                                className="text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-colors py-2 group"
                                            >
                                                <div className={`w-1.5 h-1.5 rounded-full bg-blue-500 transition-transform ${showLyrics ? 'scale-110' : 'scale-0'}`} />
                                                {showLyrics ? 'Hide Lyrics & Notes' : 'Show Lyrics & Notes'}
                                            </button>
                                            {showLyrics && (
                                                <div className="w-full bg-gray-950/50 backdrop-blur-sm p-4 rounded-xl border border-gray-800 text-gray-300 whitespace-pre-wrap break-words font-mono text-xs max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-300">
                                                    {currentTrack.lyrics}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="text-center text-gray-500">
                                <Play className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>Waiting for the host to play a track...</p>
                            </div>
                        )}

                        {/* DJ Controls Area */}
                        {party && (
                            <div className="w-full mt-12 pb-12">
                                <WatchPartyAdmin party={party} calculateOffset={calculateOffset} />
                            </div>
                        )}

                        {audioError && (
                            <div className="fixed bottom-24 left-4 right-4 md:relative md:bottom-0 md:left-0 md:right-0 mt-8 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-500 z-50 cursor-pointer hover:bg-red-500/20 transition-colors" onClick={() => { setAudioError(false); audioRef.current?.play().catch(e => console.error(e)); }}>
                                <RefreshCcw className="w-5 h-5 shrink-0" />
                                <p className="text-sm font-medium">Autoplay blocked. Tap to sync audio.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Chat Column / Bottom area */}
            <div className="md:w-80 lg:w-96 flex-1 md:flex-none border-t md:border-t-0 md:border-l border-gray-800 bg-gray-950 flex flex-col min-h-0">
                <WatchPartyChat 
                    partyId={id || ''} 
                    currentTrackId={currentTrack?.id} 
                    requestId={currentTrack?.requestId}
                    currentTrackTitle={currentTrack?.title}
                    currentTrackArtist={currentTrack?.byline || currentTrack?.uploaderEmail?.split('@')[0] || 'Unknown Artist'}
                    currentTrackTime={calculateOffset()}
                    isStageCollapsed={isStageCollapsed}
                    onToggleStage={() => setIsStageCollapsed(!isStageCollapsed)}
                    className="flex-1"
                />
            </div>

            {/* Modals */}
            {showDetails && currentTrack && (
                <SongDetailsModal
                    currentTrack={currentTrack as any}
                    onClose={() => setShowDetails(false)}
                    currentUserEmail={user?.email}
                />
            )}
        </div>
    );
}

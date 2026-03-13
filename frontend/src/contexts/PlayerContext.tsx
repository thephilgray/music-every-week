import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Submission, UserProfile } from '../types';
import { fixUrl } from '../lib/url';
import { useListenedTracks } from '../hooks/useListenedTracks';

interface PlayerContextType {
  currentTrack: Submission | null;
  isPlaying: boolean;
  queue: Submission[];
  context?: { type: 'request' | 'playlist' | 'profile', id: string, name: string, link: string, artworkUrl?: string };
  play: (track: Submission, newQueue?: Submission[], context?: { type: 'request' | 'playlist' | 'profile', id: string, name: string, link: string, artworkUrl?: string }) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Submission | null>(() => {
    try {
      const saved = localStorage.getItem('player_currentTrack');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [queue, setQueue] = useState<Submission[]>(() => {
    try {
      const saved = localStorage.getItem('player_queue');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [context, setContext] = useState<PlayerContextType['context']>(() => {
    try {
      const saved = localStorage.getItem('player_context');
      return saved ? JSON.parse(saved) : undefined;
    } catch { return undefined; }
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => {
    try {
      const saved = localStorage.getItem('player_currentTime');
      return saved ? parseFloat(saved) : 0;
    } catch { return 0; }
  });
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isNormalizationEnabled, setIsNormalizationEnabled] = useState(true);
  const [resolvedArtist, setResolvedArtist] = useState<string>('');
  const resolvedArtistRef = useRef<string>('');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Submission[]>(queue);
  const currentTrackRef = useRef<Submission | null>(currentTrack);
  const contextRef = useRef<PlayerContextType['context']>(context);
  const initialTimeLoadedRef = useRef(false);
  const lastSavedTimeRef = useRef(currentTime);

  const { markAsListened } = useListenedTracks();
  const markAsListenedRef = useRef(markAsListened);

  // Load Global Config for Normalization
  useEffect(() => {
    const configRef = doc(db, 'config', 'global');
    const unsub = onSnapshot(configRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setIsNormalizationEnabled(data.playerNormalization ?? true);
        }
    });
    return () => unsub();
  }, []);

  // Sync resolvedArtist with its ref
  useEffect(() => {
    resolvedArtistRef.current = resolvedArtist;
  }, [resolvedArtist]);

  // Playback Functions
  const pause = () => setIsPlaying(false);
  
  const resume = () => {
      initialTimeLoadedRef.current = true;
      setIsPlaying(true);
  };

  const toggleMute = () => setMuted(prev => !prev);

  const seek = (time: number) => {
      if (audioRef.current) {
          audioRef.current.currentTime = time;
          setCurrentTime(time);
          localStorage.setItem('player_currentTime', time.toString());
          lastSavedTimeRef.current = time;
      }
  };

  const play = (track: Submission, newQueue?: Submission[], newContext?: PlayerContextType['context']) => {
    if (newQueue) setQueue(newQueue);
    if (newContext) setContext(newContext);
    initialTimeLoadedRef.current = true;
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const next = () => {
      initialTimeLoadedRef.current = true;
      if (!currentTrack || queue.length === 0) return;
      const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
      if (currentIndex < queue.length - 1) {
          setCurrentTrack(queue[currentIndex + 1]);
          setIsPlaying(true);
      } else {
          setIsPlaying(false);
      }
  };

  const prev = () => {
    initialTimeLoadedRef.current = true;
    if (!currentTrack || queue.length === 0) return;
    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    if (currentIndex > 0) {
        setCurrentTrack(queue[currentIndex - 1]);
        setIsPlaying(true);
    } else {
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            setIsPlaying(true);
        }
    }
  };

  // Keep refs in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { markAsListenedRef.current = markAsListened; }, [markAsListened]);

  // Persist state
  useEffect(() => {
    const stripLargeFields = (track: Submission | null): Submission | null => {
        if (!track) return null;
        const { waveform, ...rest } = track;
        return rest as Submission;
    };
    
    const stripLargeFieldsFromQueue = (q: Submission[]): Submission[] => {
        return q.map(t => {
            const { waveform, ...rest } = t;
            return rest as Submission;
        });
    };

    try {
        localStorage.setItem('player_currentTrack', JSON.stringify(stripLargeFields(currentTrack)));
        localStorage.setItem('player_queue', JSON.stringify(stripLargeFieldsFromQueue(queue)));
        localStorage.setItem('player_context', JSON.stringify(context));
    } catch (e) {
        console.error("Failed to save player state to localStorage:", e);
        // If it still fails, we might need to clear or further reduce
    }
  }, [currentTrack, queue, context]);

  // Initialize Audio Element
  useEffect(() => {
    audioRef.current = new Audio();
    (window as any).mewAudio = audioRef.current; // Expose for console debugging
    audioRef.current.preload = "metadata"; // Ensure metadata loads for duration
    
    // Initial volume application
    const adjustmentDb = (isNormalizationEnabled && currentTrackRef.current?.volumeAdjustmentDb) || 0;
    const multiplier = Math.pow(10, adjustmentDb / 20);
    audioRef.current.volume = Math.min(1.0, Math.max(0, volume * multiplier));
    audioRef.current.muted = muted;
    
    const audio = audioRef.current;

    const handleEnded = () => {
        const q = queueRef.current;
        const c = currentTrackRef.current;
        
        if (c && q.length > 0) {
             const currentIndex = q.findIndex(t => t.id === c.id);
             if (currentIndex < q.length - 1) {
                 setCurrentTrack(q[currentIndex + 1]);
                 return;
             }
        }
        setIsPlaying(false);
    };

    const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
        // Save time occasionally to avoid spamming localStorage
        if (Math.abs(audio.currentTime - lastSavedTimeRef.current) > 2) {
             localStorage.setItem('player_currentTime', audio.currentTime.toString());
             lastSavedTimeRef.current = audio.currentTime;
        }

        // Mark as listened if > 80% played
        if (audio.duration > 0 && (audio.currentTime / audio.duration) >= 0.8) {
             const trackId = currentTrackRef.current?.id;
             if (trackId) {
                  markAsListenedRef.current(trackId);
             }
        }
    };

    const handleLoadedMetadata = () => {
        setDuration(audio.duration);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.pause();
    };
  }, []);

  // Update Media Session Metadata & Handlers
  const updateMediaSession = () => {
      if (!currentTrack || !('mediaSession' in navigator)) return;
      
      const artworkUrl = currentTrack.artworkUrl || contextRef.current?.artworkUrl || '/mewlogo.png';

      navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: resolvedArtistRef.current || 'Unknown Artist',
          artwork: [{ src: fixUrl(artworkUrl), sizes: '512x512', type: 'image/jpeg' }]
      });

      navigator.mediaSession.setActionHandler('play', () => resume());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
              seek(details.seekTime);
          }
      });
  };

  const updateMediaSessionState = () => {
      if (!('mediaSession' in navigator)) return;
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  };

  // Trigger update whenever relevant state changes
  useEffect(() => {
    if (isPlaying && currentTrack) {
        updateMediaSession();
    }
  }, [currentTrack, resolvedArtist, isPlaying]);

  useEffect(() => {
    if (!currentTrack) {
        setResolvedArtist('');
        return;
    }

    if (currentTrack.byline) {
        setResolvedArtist(currentTrack.byline);
        return;
    }

    // Default to a temporary name while resolving
    const tempName = currentTrack.uploaderUid ? currentTrack.uploaderUid.substring(0, 8) : (currentTrack.uploaderEmail ? currentTrack.uploaderEmail.split('@')[0] : 'Unknown Artist');
    setResolvedArtist(tempName);

    let isMounted = true;
    const resolveName = async () => {
        const uid = currentTrack.uploaderUid || currentTrack.originalUploaderPub;
        if (uid) {
            try {
                const docRef = doc(db, 'profiles', uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists() && isMounted) {
                    const data = docSnap.data() as UserProfile;
                    setResolvedArtist(data.displayName || data.alias || uid.substring(0, 8));
                    return;
                }
            } catch (e) {
                // Ignore
            }
        } else if (currentTrack.uploaderEmail) {
            try {
                const q = query(collection(db, 'profiles'), where('email', '==', currentTrack.uploaderEmail));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty && isMounted) {
                    const data = querySnapshot.docs[0].data() as UserProfile;
                    setResolvedArtist(data.displayName || data.alias || currentTrack.uploaderEmail.split('@')[0]);
                    return;
                }
            } catch (e) {
                // Ignore
            }
        }
    };

    resolveName();
    return () => { isMounted = false; };
  }, [currentTrack]);

  // Handle Playback Logic when currentTrack changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrack) {
        const url = fixUrl(currentTrack.audioUrl);
        if (url) {
            if (audio.src !== url) {
                audio.src = url;
                
                // Logging for normalization debugging
                const hasMetadata = typeof currentTrack.volumeAdjustmentDb === 'number';
                const volDb = (isNormalizationEnabled && hasMetadata ? (currentTrack.volumeAdjustmentDb || 0) : 0);
                const multiplier = Math.pow(10, volDb / 20);
                const finalVolume = Math.min(1.0, Math.max(0, volume * multiplier));
                
                console.log(`[Player] Playing: "${currentTrack.title}" | Normalization: ${isNormalizationEnabled ? 'ON' : 'OFF'} | Metadata: ${hasMetadata ? 'YES' : 'NO'} | Adjustment: ${volDb}dB | Final Volume: ${(finalVolume * 100).toFixed(1)}%`);

                if (!initialTimeLoadedRef.current) {
                    const savedTime = localStorage.getItem('player_currentTime');
                    if (savedTime) {
                        const parsedTime = parseFloat(savedTime);
                        audio.currentTime = parsedTime;
                        setCurrentTime(parsedTime);
                        lastSavedTimeRef.current = parsedTime;
                    }
                    initialTimeLoadedRef.current = true;
                } else {
                    audio.currentTime = 0;
                    localStorage.setItem('player_currentTime', '0');
                    lastSavedTimeRef.current = 0;
                }

                if (isPlaying) {
                    audio.play().catch(e => console.error("Playback failed", e));
                }
            } else if (isPlaying && audio.paused) {
                audio.play().catch(e => console.error("Playback failed", e));
            }
        } else {
            console.warn("Track has no valid audio URL:", currentTrack);
            setIsPlaying(false);
        }
    } else {
        audio.pause();
        if (isPlaying) setIsPlaying(false);
    }
  }, [currentTrack, markAsListened]);

  // Handle Play/Pause Toggle separate from track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying && audio.paused && currentTrack && audio.src === fixUrl(currentTrack.audioUrl)) {
        audio.play().catch(e => console.error(e));
    } else if (!isPlaying && !audio.paused) {
        audio.pause();
        localStorage.setItem('player_currentTime', audio.currentTime.toString()); // Save exact time on pause
        lastSavedTimeRef.current = audio.currentTime;
    }
    updateMediaSessionState();
  }, [isPlaying, currentTrack]);

  // Handle Volume/Mute changes
  useEffect(() => {
      if (audioRef.current) {
          // Calculate gain adjustment multiplier
          // Formula: Multiplier = 10 ^ (dB / 20)
          const adjustmentDb = (isNormalizationEnabled && currentTrack?.volumeAdjustmentDb) || 0;
          const multiplier = Math.pow(10, adjustmentDb / 20);
          
          // Clamp final volume between 0 and 1 (HTML5 Audio limitation)
          const finalVolume = Math.min(1.0, Math.max(0, volume * multiplier));
          
          audioRef.current.volume = finalVolume;
          audioRef.current.muted = muted;
      }
  }, [volume, muted, currentTrack?.id, currentTrack?.volumeAdjustmentDb, isNormalizationEnabled]);

  return (
    <PlayerContext.Provider value={{ 
        currentTrack, 
        isPlaying, 
        queue, 
        context,
        play, 
        pause, 
        resume, 
        next, 
        prev,
        seek,
        currentTime,
        duration,
        volume,
        muted,
        setVolume,
        toggleMute
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}

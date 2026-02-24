import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useGun } from '../contexts/GunContext';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type { Playlist, Submission, FileRequest } from '../types';
import { Play, Trash2, ListMusic, Loader2, Edit, X, Globe, Pause, Lock, Shuffle, Filter, FileText, FileAudio } from 'lucide-react';
import { RequestCard } from '../components/RequestCard';
import { ArtworkDisplay } from '../components/ui/ArtworkDisplay';
import { Waveform } from '../components/ui/Waveform';
import { seededRandom } from '../lib/utils';
import { FilterPopover } from '../components/ui/FilterPopover';
import { fixUrl } from '../lib/url';

export function Playlists() {
  const { id } = useParams<{ id: string }>();

  if (id) {
    return <PlaylistDetail id={id} />;
  }

  return <PlaylistList />;
}

// ==========================================
// EXISTING GunDB LIST VIEW
// ==========================================
function PlaylistList() {
  const { user, gun } = useGun();
  const { play } = usePlayer();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  const [publicPlaylists, setPublicPlaylists] = useState<FileRequest[]>([]);
  const processedRequests = useRef<Set<string>>(new Set());

  useEffect(() => {
     setPlaylists([]);
     if (!user) return; // Guard
     user.get('playlists').map().on((data: any, key: string) => {
         if (data && data.title) {
             let tracks = [];
             if (typeof data.tracks === 'string') {
                 try { tracks = JSON.parse(data.tracks); } catch (e) {}
             } else if (Array.isArray(data.tracks)) {
                 tracks = data.tracks;
             }

             const pl: Playlist = { ...data, id: key, tracks };
             
             setPlaylists(prev => {
                 const exists = prev.find(p => p.id === key);
                 if (exists && JSON.stringify(exists.tracks) === JSON.stringify(pl.tracks) && exists.title === pl.title) {
                     return prev;
                 }
                 if (exists) return prev.map(p => p.id === key ? pl : p);
                 return [...prev, pl];
             });
             
             // Update selected playlist if open
             if (selectedPlaylist && selectedPlaylist.id === key) {
                 setSelectedPlaylist({ ...pl, id: key, tracks });
             }
         } else if (data === null) {
             setPlaylists(prev => prev.filter(p => p.id !== key));
             if (selectedPlaylist && selectedPlaylist.id === key) setSelectedPlaylist(null);
         }
     });
  }, [user, selectedPlaylist?.id]);

  useEffect(() => {
      if (!user) return;
      
      // Fetch user's submissions to find participated requests
      user.get('submissions').map().on((submission: any) => {
          if (submission && submission.requestId) {
              const reqId = submission.requestId;
              if (processedRequests.current.has(reqId)) return;
              
              processedRequests.current.add(reqId);
              
              gun.get('file_requests').get(reqId).once((req: any) => {
                  if (req && req.title) {
                      const now = Date.now();
                      const deadline = req.deadline ? new Date(req.deadline).getTime() : Infinity;
                      const liveDate = req.playlistLiveDate ? new Date(req.playlistLiveDate).getTime() : Infinity;
                      
                      const isClosed = now > deadline;
                      const isPastLiveDate = now > liveDate;

                      // Only show if closed or past live date
                      if (isClosed || isPastLiveDate) {
                           setPublicPlaylists(prev => {
                               if (prev.find(p => p.id === reqId)) return prev;
                               return [...prev, { ...req, id: reqId }];
                           });
                      }
                  }
              });
          }
      });
      
      return () => {
          processedRequests.current.clear();
          setPublicPlaylists([]);
      };
  }, [user, gun]);

  const handlePlay = async (playlist: Playlist, startIndex = 0) => {
      console.log("handlePlay initiated for playlist:", playlist.id);
      if (!playlist.tracks || playlist.tracks.length === 0) return;
      setLoadingId(playlist.id);
      
      // Fetch audioUrl for each track with timeout
      const promises = playlist.tracks.map(track => {
          return Promise.race([
              new Promise<Submission | null>((resolve) => {
                  gun.get('request_submissions')
                     .get(track.requestId)
                     .get(track.submissionId)
                     .once((data: any) => {
                         if (data && data.audioUrl) {
                            let parsedWaveform = data.waveform;
                            if (typeof data.waveform === 'string') {
                                try { parsedWaveform = JSON.parse(data.waveform); } catch (e) { parsedWaveform = []; }
                            }
                            resolve({ ...data, id: track.submissionId, waveform: parsedWaveform });
                         } else {
                            resolve(null);
                         }
                     });
              }),
              new Promise<Submission | null>((resolve) => setTimeout(() => resolve(null), 2000))
          ]);
      });
      
      const results = await Promise.all(promises);
      const validTracks = results.filter(t => t !== null) as Submission[];
      console.log(`Loaded ${validTracks.length} valid tracks out of ${playlist.tracks.length}`);
      
      if (validTracks.length > 0) {
          play(validTracks[startIndex < validTracks.length ? startIndex : 0], validTracks, {
              type: 'playlist',
              id: playlist.id,
              name: playlist.title,
              link: '/playlists'
          });
      } else {
          alert('Could not load tracks (they might have been deleted).');
      }
      
      setLoadingId(null);
  };

  const deletePlaylist = (id: string) => {
      if(confirm('Delete this playlist?')) {
          user.get('playlists').get(id).put(null);
      }
  };

  const removeTrack = (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      if (!selectedPlaylist) return;
      
      const newTracks = [...selectedPlaylist.tracks];
      newTracks.splice(index, 1);
      
      user.get('playlists').get(selectedPlaylist.id).put({
          tracks: JSON.stringify(newTracks)
      });
  };

  return (
    <div className="max-w-5xl mx-auto p-2 pb-4 sm:p-8 sm:pb-32">
        <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
            <ListMusic className="w-8 h-8 text-blue-500" />
            My Playlists
        </h1>
        
        {playlists.length === 0 ? (
            <div className="text-center py-20 text-gray-500 border border-gray-800 border-dashed rounded-lg">
                <p>No playlists yet.</p>
                <p className="text-sm mt-2">Create one from a track's menu.</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {playlists.map(pl => (
                    <div key={pl.id} className="bg-gray-900 border border-gray-800 rounded-lg p-6 group hover:border-gray-700 transition">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-white">{pl.title}</h3>
                                <p className="text-sm text-gray-500">{pl.tracks?.length || 0} tracks</p>
                            </div>
                            <div className="flex gap-1">
                                <button 
                                    onClick={() => setSelectedPlaylist(pl)}
                                    className="p-1 text-gray-600 hover:text-white transition"
                                    title="Edit Playlist"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => deletePlaylist(pl.id)}
                                    className="p-1 text-gray-600 hover:text-red-500 transition"
                                    title="Delete Playlist"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex gap-2">
                             <button 
                                onClick={() => handlePlay(pl)}
                                disabled={loadingId === pl.id || !pl.tracks?.length}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                             >
                                {loadingId === pl.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                                Play
                             </button>
                        </div>
                        
                        <div 
                            className="mt-4 space-y-1 cursor-pointer hover:bg-gray-800/50 p-2 rounded -mx-2 transition"
                            onClick={() => setSelectedPlaylist(pl)}
                        >
                            {pl.tracks?.slice(0, 3).map((t, i) => (
                                <div key={i} className="text-xs text-gray-400 truncate flex justify-between">
                                    <span>{i+1}. {t.title}</span>
                                    <span className="text-gray-600 max-w-[80px] truncate">{t.artist}</span>
                                </div>
                            ))}
                            {(pl.tracks?.length || 0) > 3 && (
                                <div className="text-xs text-gray-600 pt-1">
                                    + {(pl.tracks?.length || 0) - 3} more
                                </div>
                            )}
                            {(pl.tracks?.length || 0) === 0 && <span className="text-xs text-gray-600">Empty</span>}
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* Edit Modal (Existing GunDB Implementation) */}
        {selectedPlaylist && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative max-h-[80vh] flex flex-col">
                    <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                        <h2 className="text-xl font-bold text-white">{selectedPlaylist.title}</h2>
                        <button onClick={() => setSelectedPlaylist(null)} className="text-gray-500 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                         {selectedPlaylist.tracks?.length === 0 && (
                             <p className="text-gray-500 text-center py-8">No tracks in this playlist.</p>
                         )}
                         {selectedPlaylist.tracks?.map((track, i) => (
                             <div key={i} className="flex items-center justify-between p-3 bg-gray-800/50 rounded hover:bg-gray-800 transition group">
                                 <div className="flex items-center gap-3 overflow-hidden">
                                     <span className="text-gray-500 text-sm font-mono w-6 text-right">{i+1}</span>
                                     <div className="min-w-0">
                                         <p className="text-white text-sm font-medium truncate">{track.title}</p>
                                         <p className="text-gray-500 text-xs truncate">{track.artist}</p>
                                     </div>
                                 </div>
                                 <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                                     <button 
                                        onClick={() => handlePlay(selectedPlaylist, i)}
                                        className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded"
                                        title="Play from here"
                                     >
                                         <Play className="w-3 h-3 fill-current" />
                                     </button>
                                     <button 
                                        onClick={(e) => removeTrack(e, i)}
                                        className="p-1.5 text-red-400 hover:bg-red-900/30 rounded"
                                        title="Remove Track"
                                     >
                                         <Trash2 className="w-3 h-3" />
                                     </button>
                                 </div>
                             </div>
                         ))}
                    </div>

                    <div className="p-4 border-t border-gray-800 flex justify-end">
                        <button 
                            onClick={() => setSelectedPlaylist(null)}
                            className="text-gray-400 hover:text-white px-4 py-2"
                        >
                            Close
                        </button>
                        <button 
                            onClick={() => handlePlay(selectedPlaylist)}
                            disabled={!selectedPlaylist.tracks?.length}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-semibold flex items-center gap-2 ml-2 disabled:opacity-50"
                        >
                            <Play className="w-4 h-4 fill-current" /> Play All
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Public Playlists (Past Requests) */}
        {publicPlaylists.length > 0 && (
            <div className="mt-12 pt-8 border-t border-gray-800">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                    <Globe className="w-6 h-6 text-purple-500" />
                    Public Playlists
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {publicPlaylists.map(req => {
                         const isClosed = req.deadline ? Date.now() > new Date(req.deadline).getTime() : false;
                         return (
                            <RequestCard key={req.id} request={req} isClosed={isClosed} />
                         );
                    })}
                </div>
            </div>
        )}
    </div>
  );
}

// ==========================================
// NEW Firestore DETAIL VIEW
// ==========================================
function PlaylistDetail({ id }: { id: string }) {
    const { participantEmail, isAdmin } = useAuth();
    const { play, currentTrack, isPlaying, pause } = usePlayer(); // removed unused 'resume'
    
    const [loading, setLoading] = useState(true);
    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [request, setRequest] = useState<FileRequest | null>(null);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [hostName, setHostName] = useState<string>('');
    
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    // removed unused expandedSubmissionId/setExpandedSubmissionId
    const [expandedLyricsMap, setExpandedLyricsMap] = useState<Record<string, boolean>>({});
    
    // Filters State
    const [showFilterPopover, setShowFilterPopover] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'mostComments' | 'fewestComments' | 'alpha'>('newest');
    const [filterByAI, setFilterByAI] = useState(false);
    const [filterByFragile, setFilterByFragile] = useState(false);
    const [filterByFeedbackFocus, setFilterByFeedbackFocus] = useState<string[]>([]);

    const areFiltersActive = useMemo(() => {
        return searchTerm !== '' || sortBy !== 'newest' || filterByAI || filterByFragile || filterByFeedbackFocus.length > 0;
    }, [searchTerm, sortBy, filterByAI, filterByFragile, filterByFeedbackFocus]);

    // Fetch Data
    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                // Fetch Playlist
                const plDoc = await getDoc(doc(db, 'playlists', id));
                if (!plDoc.exists()) {
                    setError('Playlist not found');
                    setLoading(false);
                    return;
                }
                const plData = { id: plDoc.id, ...plDoc.data() } as Playlist;
                setPlaylist(plData);
                
                // Fetch Related Request (for locking logic, host name, etc.)
                const qReq = query(collection(db, 'requests'), where('playlistId', '==', id));
                const reqSnap = await getDocs(qReq);
                if (!reqSnap.empty) {
                    const r = reqSnap.docs[0].data() as FileRequest;
                    setRequest({ id: reqSnap.docs[0].id, ...r });
                    
                    if (r.hostEmail) {
                        setHostName(r.hostEmail.split('@')[0]); // Fallback
                    }
                }
                
                // Fetch Submissions
                const qSub = query(collection(db, 'submissions'), where('playlistId', '==', id));
                const subSnap = await getDocs(qSub);
                const loadedSubs: Submission[] = [];
                subSnap.forEach(d => loadedSubs.push({ id: d.id, ...d.data() } as Submission));
                setSubmissions(loadedSubs);

            } catch (e) {
                console.error(e);
                setError('Failed to load playlist');
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [id]);

    const handleClearAllFilters = useCallback(() => {
        setSearchTerm('');
        setSortBy('newest');
        setFilterByAI(false);
        setFilterByFragile(false);
        setFilterByFeedbackFocus([]);
    }, []);

    // Filter Logic
    const computedVisibleSubmissions = useMemo(() => {
        let filtered = submissions;
        
        // Search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(s => 
                s.title.toLowerCase().includes(term) || 
                s.byline?.toLowerCase().includes(term) ||
                s.uploaderEmail?.toLowerCase().includes(term)
            );
        }

        if (filterByAI) filtered = filtered.filter(s => !s.usesAI);
        if (filterByFragile) filtered = filtered.filter(s => s.fragile);
        if (filterByFeedbackFocus.length > 0) {
            filtered = filtered.filter(s => filterByFeedbackFocus.some(f => s.feedbackFocus?.includes(f)));
        }

        // Sort
        filtered.sort((a, b) => {
            if (sortBy === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
            if (sortBy === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
            if (sortBy === 'alpha') return a.title.localeCompare(b.title);
            // Comment sort is mocked as 0 diff for now since we don't have comments loaded here easily without extra fetch
            return 0; 
        });

        // Lock Logic (Preview)
        let lockMessage = "";
        const isHost = request?.hostEmail?.toLowerCase() === participantEmail?.toLowerCase() || isAdmin;
        const hasSubmitted = submissions.some(s => s.uploaderEmail?.toLowerCase() === participantEmail?.toLowerCase());
        
        if (!isHost && request?.playlistLiveDate) {
            const liveDate = new Date(request.playlistLiveDate).getTime();
            if (Date.now() < liveDate) {
                if (hasSubmitted) {
                    // Preview Mode: Show own track + random others
                    const seed = `${id}-${participantEmail}`;
                    const random = seededRandom(seed);
                    const myTrack = filtered.find(s => s.uploaderEmail?.toLowerCase() === participantEmail?.toLowerCase());
                    const others = filtered.filter(s => s.uploaderEmail?.toLowerCase() !== participantEmail?.toLowerCase());
                    const shuffledOthers = [...others].sort(() => random() - 0.5).slice(0, 2);
                    
                    filtered = myTrack ? [myTrack, ...shuffledOthers] : shuffledOthers;
                    lockMessage = `Playlist is not live yet. Preview mode active.`;
                } else {
                    filtered = [];
                    lockMessage = "Playlist is locked until the live date.";
                }
            }
        }

        return { filtered, lockMessage, isHost };
    }, [submissions, searchTerm, sortBy, filterByAI, filterByFragile, filterByFeedbackFocus, request, participantEmail, id, isAdmin]);

    const { filtered: visibleSubmissions, lockMessage, isHost } = computedVisibleSubmissions;

    const handlePlayAll = () => {
        if (visibleSubmissions.length > 0) {
            if (isPlaying && visibleSubmissions.some(s => s.id === currentTrack?.id)) {
                pause();
            } else {
                play(visibleSubmissions[0], visibleSubmissions, {
                    type: 'playlist',
                    id: id,
                    name: playlist?.title || 'Playlist',
                    link: `/playlists/${id}`
                });
            }
        }
    };

    const handleShufflePlay = () => {
        if (visibleSubmissions.length > 0) {
            const seed = `${id}-${Date.now()}`;
            const random = seededRandom(seed);
            const shuffled = [...visibleSubmissions].sort(() => random() - 0.5);
            play(shuffled[0], shuffled, {
                type: 'playlist',
                id: id,
                name: playlist?.title || 'Playlist',
                link: `/playlists/${id}`
            });
        }
    };

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500" /></div>;
    if (error || !playlist) return <div className="text-center p-20 text-red-500">{error || "Not Found"}</div>;

    // Access Check using isAllowed properly
    const isAllowed = isHost || playlist.accessList?.some((e: string) => e.toLowerCase() === participantEmail?.toLowerCase()) || (playlist as any).accessMode === 'public';
    
    if (!isAllowed) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center">
                 <Lock className="w-12 h-12 text-red-500 mb-4" />
                 <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                 <p className="text-gray-500">You do not have permission to view this playlist.</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8">
            <div className="bg-gradient-to-b from-purple-900/20 to-black p-8 rounded-xl mb-8 border border-gray-800">
                <div className="flex flex-col md:flex-row gap-8 items-start">
                    <div className="w-48 h-48 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 border border-gray-700 mx-auto">
                        <ArtworkDisplay src={fixUrl(playlist.artworkUrl)} alt="Art" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 w-full">
                        <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">{playlist.title}</h1>
                        <p className="text-gray-400 text-sm mb-4">Hosted by {hostName || 'Unknown'}</p>
                        <p className={`text-gray-300 whitespace-pre-wrap ${isDescriptionExpanded ? '' : 'line-clamp-3'}`}>
                            {playlist.description}
                        </p>
                         {playlist.description && playlist.description.length > 150 && (
                            <button onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)} className="text-blue-400 text-sm mt-2">
                                {isDescriptionExpanded ? 'Show Less' : 'Show More'}
                            </button>
                        )}
                        
                        {lockMessage && (
                            <div className="mt-4 inline-flex items-center gap-2 bg-yellow-900/30 text-yellow-200 px-3 py-1 rounded-full text-xs font-bold border border-yellow-700/50">
                                <Lock className="w-3 h-3" /> {lockMessage}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex justify-between items-center mb-6 relative">
                 <div className="flex gap-2">
                     <button onClick={handlePlayAll} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold transition">
                         {isPlaying && visibleSubmissions.some(s => s.id === currentTrack?.id) ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                         Play All
                     </button>
                     <button onClick={handleShufflePlay} className="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition" title="Shuffle">
                         <Shuffle className="w-5 h-5" />
                     </button>
                 </div>
                 
                 <div className="flex gap-2 relative">
                     <button 
                         onClick={() => setShowFilterPopover(!showFilterPopover)} 
                         className={`p-2 rounded-lg transition ${areFiltersActive ? 'bg-blue-900/50 text-blue-400 border border-blue-500/50' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                     >
                         <Filter className="w-5 h-5" />
                     </button>
                     
                     {showFilterPopover && (
                         <FilterPopover
                             searchTerm={searchTerm}
                             setSearchTerm={setSearchTerm}
                             sortBy={sortBy}
                             setSortBy={setSortBy}
                             filterByAI={filterByAI}
                             setFilterByAI={setFilterByAI}
                             filterByFragile={filterByFragile}
                             setFilterByFragile={setFilterByFragile}
                             filterByFeedbackFocus={filterByFeedbackFocus}
                             setFilterByFeedbackFocus={setFilterByFeedbackFocus}
                             onClose={() => setShowFilterPopover(false)}
                         />
                     )}
                 </div>
            </div>
            
            {visibleSubmissions.length === 0 ? (
                <div className="text-center py-20 text-gray-500 border border-gray-800 border-dashed rounded-lg">
                    {areFiltersActive ? (
                        <>
                            <p>No tracks match your filters.</p>
                            <button onClick={handleClearAllFilters} className="text-blue-400 mt-2 hover:underline">Clear Filters</button>
                        </>
                    ) : (
                        <p>{lockMessage || "No tracks yet."}</p>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {visibleSubmissions.map((sub) => (
                        <div key={sub.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-4 hover:border-gray-700 transition">
                             <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 bg-gray-800 rounded overflow-hidden flex-shrink-0 relative">
                                     <ArtworkDisplay src={fixUrl(sub.artworkUrl)} alt="Art" className="w-full h-full object-cover" FallbackIcon={FileAudio} />
                                 </div>
                                 <div className="flex-1 min-w-0">
                                     <h4 className="text-white font-medium truncate">{sub.title}</h4>
                                     <p className="text-gray-400 text-sm truncate">{sub.byline || 'Anonymous'}</p>
                                 </div>
                                 <div className="flex items-center gap-2">
                                     {sub.lyrics && (
                                         <button onClick={() => setExpandedLyricsMap(p => ({...p, [sub.id!]: !p[sub.id!]}))} className={`p-2 rounded-full ${expandedLyricsMap[sub.id!] ? 'text-blue-400 bg-gray-800' : 'text-gray-500 hover:text-white'}`}>
                                             <FileText className="w-4 h-4" />
                                         </button>
                                     )}
                                     <button 
                                         onClick={() => {
                                             if (isPlaying && currentTrack?.id === sub.id) pause();
                                             else play(sub, visibleSubmissions, { type: 'playlist', id: id, name: playlist.title, link: `/playlists/${id}` });
                                         }}
                                         className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition"
                                     >
                                         {isPlaying && currentTrack?.id === sub.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                                     </button>
                                 </div>
                             </div>
                             
                             {sub.waveform && <div className="hidden md:block opacity-50 hover:opacity-100 transition"><Waveform data={sub.waveform} /></div>}
                             
                             {expandedLyricsMap[sub.id!] && (
                                 <div className="bg-gray-950 p-4 rounded text-sm text-gray-300 font-mono whitespace-pre-wrap border border-gray-800">
                                     {sub.lyrics}
                                 </div>
                             )}
                        </div>
                    ))}
                </div>
            )}
            
            <div className="h-32" />
        </div>
    );
}

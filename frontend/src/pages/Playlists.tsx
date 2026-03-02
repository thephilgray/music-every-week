import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, serverTimestamp, onSnapshot, orderBy, documentId } from 'firebase/firestore';
import type { Playlist, Submission, FileRequest } from '../types';
import { getTimestampAsNumber, seededRandom } from '../lib/utils';
import { Play, Trash2, ListMusic, Loader2, Edit, X, Pause, Lock, Shuffle, Filter, FileText, FileAudio, GripVertical, Check } from 'lucide-react';
import { RequestCard } from '../components/RequestCard';
import { ArtworkDisplay } from '../components/ui/ArtworkDisplay';
import { Waveform } from '../components/ui/Waveform';
import { FilterPopover } from '../components/ui/FilterPopover';
import { Skeleton } from '../components/ui/Skeleton';
import { useListenedTracks } from '../hooks/useListenedTracks';
import { fixUrl } from '../lib/url';

export function Playlists() {
  const { id } = useParams<{ id: string }>();

  if (id) {
    return <PlaylistDetail id={id} />;
  }

  return <PlaylistList />;
}

// ==========================================
// EXISTING GunDB LIST VIEW -> Refactored for Firestore & Migration
// ==========================================
function PlaylistList() {
  const { user, participantEmail } = useAuth(); // Added participantEmail
  const { play } = usePlayer();
  
  // State for different playlist sources
  const [myPlaylists, setMyPlaylists] = useState<Playlist[]>([]);
  const [hostedRequests, setHostedRequests] = useState<FileRequest[]>([]); // Merged state for requests
  
  const [loadingMy, setLoadingMy] = useState(true);
  const [loadingHosted, setLoadingHosted] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // 1. My Playlists (Created by Me) - Kept as Playlists
  useEffect(() => {
     if (!user || !user.uid) {
         setMyPlaylists([]);
         setLoadingMy(false);
         return;
     }
     setLoadingMy(true);
     
     const playlistsQuery = query(
        collection(db, 'playlists'),
        where('ownerPub', '==', user.uid),
        orderBy('createdAt', 'desc')
     );

     const unsubscribe = onSnapshot(playlistsQuery, (snapshot) => {
        const fetchedPlaylists: Playlist[] = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            fetchedPlaylists.push({ 
                id: docSnap.id, 
                ...data,
                createdAt: getTimestampAsNumber(data.createdAt)
            } as Playlist);
        });
        setMyPlaylists(fetchedPlaylists);
        setLoadingMy(false);
     });
     return () => unsubscribe();
  }, [user]);

  // Keep selectedPlaylist in sync with realtime updates from myPlaylists
  useEffect(() => {
      if (selectedPlaylist) {
          const updatedPlaylist = myPlaylists.find(pl => pl.id === selectedPlaylist.id);
          if (updatedPlaylist && JSON.stringify(updatedPlaylist.tracks) !== JSON.stringify(selectedPlaylist.tracks)) {
              // Only sync if tracks actually changed from the DB to avoid interfering with active dragging
              // If we are currently dragging, DON'T sync from DB until drag is done
              if (draggedIndex === null) {
                  setSelectedPlaylist(updatedPlaylist);
              }
          }
      }
  }, [myPlaylists, selectedPlaylist?.id, draggedIndex]);

  // 2. Fetch Hosted/Public/Contributed Requests
  useEffect(() => {
      const email = user?.email || participantEmail;
      const uid = user?.uid;
      
      const fetchRequests = async () => {
          setLoadingHosted(true);
          try {
            // A. Public Requests (Only Volunteer mode is truly public without invitation)
            const qPublic = query(
                collection(db, 'requests'), 
                where('accessMode', '==', 'volunteer'), 
                orderBy('createdAt', 'desc')
            );

            // B. Shared Requests (Invite/Volunteer where I'm added)
            let qShared = null;
            if (email) {
                qShared = query(
                    collection(db, 'requests'), 
                    where('accessList', 'array-contains', email), 
                    orderBy('createdAt', 'desc')
                );
            }

            // C. Contributed Requests (Where I submitted)
            let contributedIds: string[] = [];
            
            if (email || uid) {
                let migratedPub: string | null = null;
                if (uid) {
                    const profileDoc = await getDoc(doc(db, 'profiles', uid));
                    if (profileDoc.exists()) migratedPub = profileDoc.data().migratedFromGunPub;
                } else if (email) {
                    const qP = query(collection(db, 'profiles'), where('email', '==', email));
                    const pSnap = await getDocs(qP);
                    if (!pSnap.empty) migratedPub = pSnap.docs[0].data().migratedFromGunPub;
                }

                const subQueries = [];
                if (email) subQueries.push(query(collection(db, 'submissions'), where('uploaderEmail', '==', email)));
                if (migratedPub) subQueries.push(query(collection(db, 'submissions'), where('originalUploaderPub', '==', migratedPub)));
                
                if (subQueries.length > 0) {
                    const subSnaps = await Promise.all(subQueries.map(q => getDocs(q)));
                    const requestIds = new Set<string>();
                    subSnaps.forEach(snap => {
                        snap.forEach(doc => {
                            const data = doc.data();
                            if (data.requestId) requestIds.add(data.requestId);
                        });
                    });
                    contributedIds = Array.from(requestIds);
                }
            }

            // Execute Queries
            const promises = [getDocs(qPublic)];
            if (qShared) promises.push(getDocs(qShared));
            
            // Batch fetch contributed requests by ID
            if (contributedIds.length > 0) {
                for (let i = 0; i < contributedIds.length; i += 10) {
                    const batch = contributedIds.slice(i, i + 10);
                    promises.push(getDocs(query(collection(db, 'requests'), where(documentId(), 'in', batch))));
                }
            }

            const snapshots = await Promise.all(promises);
            
            // Merge and Deduplicate
            const uniqueRequests = new Map<string, FileRequest>();
            snapshots.forEach(snap => {
                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.deleted) return;
                    
                    uniqueRequests.set(doc.id, { 
                        id: doc.id, 
                        ...data,
                        createdAt: getTimestampAsNumber(data.createdAt)
                    } as FileRequest);
                });
            });

            // Sort by createdAt desc
            const sorted = Array.from(uniqueRequests.values()).sort((a, b) => 
                (b.createdAt as number) - (a.createdAt as number)
            );
            
            setHostedRequests(sorted);
          } catch(e) {
              console.error("Error fetching hosted requests:", e);
          } finally {
              setLoadingHosted(false);
          }
      };

      fetchRequests();
  }, [user, participantEmail]);


  const handlePlay = async (playlist: Playlist, startIndex = 0) => {
      // ... (Existing handlePlay logic) ...
      console.log("handlePlay initiated for playlist:", playlist.id);
      if (!playlist.tracks || playlist.tracks.length === 0) return;
      setLoadingId(playlist.id);
      
      // Fetch audioUrl for each track with timeout
      const promises = playlist.tracks.map(track => {
          return Promise.race([
              new Promise<Submission | null>(async (resolve) => { // Added async
                  try {
                      const subDoc = await getDoc(doc(db, 'submissions', track.submissionId)); // Firebase getDoc
                      if (subDoc.exists()) {
                          const data = subDoc.data();
                          let parsedWaveform = data.waveform;
                          if (typeof data.waveform === 'string') {
                              try { parsedWaveform = JSON.parse(data.waveform); } catch (e) { parsedWaveform = []; }
                          }
                          resolve({ ...data, id: track.submissionId, waveform: parsedWaveform } as Submission); // Cast to Submission
                      } else {
                          resolve(null);
                      }
                  } catch (e) {
                      console.error("Error fetching submission for playlist playback:", e);
                      resolve(null);
                  }
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
              link: '/playlists',
              artworkUrl: playlist.artworkUrl
          });
      } else {
          alert('Could not load tracks (they might have been deleted).');
      }
      
      setLoadingId(null);
  };

  const deletePlaylist = async (id: string) => { // Added async
      if(confirm('Delete this playlist?')) {
          try {
              await deleteDoc(doc(db, 'playlists', id)); // Firebase deleteDoc
          } catch (e) {
              console.error("Error deleting playlist:", e);
              alert("Failed to delete playlist.");
          }
      }
  };

  const removeTrack = async (e: React.MouseEvent, index: number) => { // Added async
      e.stopPropagation();
      if (!selectedPlaylist || !selectedPlaylist.id) return;
      
      const newTracks = [...selectedPlaylist.tracks];
      newTracks.splice(index, 1);
      
      try {
          await updateDoc(doc(db, 'playlists', selectedPlaylist.id), { // Firebase updateDoc
              tracks: newTracks,
              updatedAt: serverTimestamp() // Add updatedAt
          });
          // Update local state for immediate UI feedback if selectedPlaylist is still open
          setSelectedPlaylist(prev => prev ? { ...prev, tracks: newTracks } : null);
      } catch (e) {
          console.error("Error removing track from playlist:", e);
          alert("Failed to remove track.");
      }
  };

  const handleRename = async (id: string, newTitle: string) => {
      if (!newTitle.trim()) {
          setEditingTitleId(null);
          return;
      }
      try {
          await updateDoc(doc(db, 'playlists', id), { title: newTitle });
          setEditingTitleId(null);
          if (selectedPlaylist?.id === id) {
              setSelectedPlaylist(prev => prev ? { ...prev, title: newTitle } : null);
          }
      } catch (e) {
          console.error("Error renaming playlist:", e);
          alert("Failed to rename playlist.");
      }
  };

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
      dragItem.current = index;
      setDraggedIndex(index);
  };

  const handleDragEnter = (index: number) => {
      dragOverItem.current = index;
  };

  const handleDragEnd = async () => {
      setDraggedIndex(null);
      if (dragItem.current === null || dragOverItem.current === null || !selectedPlaylist || !selectedPlaylist.id) {
          dragItem.current = null;
          dragOverItem.current = null;
          return;
      }
      
      const newTracks = [...selectedPlaylist.tracks];
      const draggedItemContent = newTracks.splice(dragItem.current, 1)[0];
      newTracks.splice(dragOverItem.current, 0, draggedItemContent);
      
      dragItem.current = null;
      dragOverItem.current = null;
      
      // Optimistically update UI
      setSelectedPlaylist({ ...selectedPlaylist, tracks: newTracks });
      
      try {
          await updateDoc(doc(db, 'playlists', selectedPlaylist.id), {
              tracks: newTracks,
              updatedAt: serverTimestamp()
          });
      } catch (e) {
          console.error("Failed to save reordered tracks", e);
      }
  };

  const PlaylistGrid = ({ list, isOwner }: { list: Playlist[], isOwner: boolean }) => (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {list.map(pl => (
              <div key={pl.id} className="bg-gray-900 border border-gray-800 rounded-lg p-6 group hover:border-gray-700 transition">
                  <div className="flex justify-between items-start mb-4">
                      <div className="min-w-0 flex-1 pr-2">
                          <h3 className="text-xl font-bold text-white truncate" title={pl.title}>{pl.title}</h3>
                          <p className="text-sm text-gray-500">{pl.tracks?.length || 0} tracks</p>
                      </div>
                      {isOwner && (
                          <div className="flex gap-1 flex-shrink-0">
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
                      )}
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
                      onClick={() => handlePlay(pl)} // Play on click anywhere on track list preview
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
  );

  return (
    <div className="max-w-6xl mx-auto p-2 pb-4 sm:p-8 sm:pb-32 space-y-12">
        {/* Hosted Playlists Section (Now displaying Requests) */}
        <section>
            <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                <ListMusic className="w-8 h-8 text-blue-500" />
                Hosted Playlists
            </h2>
            {loadingHosted ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Skeleton className="h-80 w-full rounded-xl" />
                    <Skeleton className="h-80 w-full rounded-xl" />
                    <Skeleton className="h-80 w-full rounded-xl" />
                </div>
            ) : hostedRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-500 border border-gray-800 border-dashed rounded-lg bg-gray-900/30">
                    <p>No hosted playlists found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {hostedRequests.map(req => (
                        <RequestCard 
                            key={req.id} 
                            request={req} 
                            isClosed={false} 
                            hideStatus={true} // New prop to hide CLOSED tag
                        />
                    ))}
                </div>
            )}
        </section>

        {/* My Playlists Section */}
        {user && (
            <section>
                <h2 className="text-2xl font-bold text-white mb-6 border-t border-gray-800 pt-8">
                    My Playlists
                </h2>
                {loadingMy ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <Skeleton className="h-48 w-full rounded-xl" />
                        <Skeleton className="h-48 w-full rounded-xl" />
                        <Skeleton className="h-48 w-full rounded-xl" />
                    </div>
                ) : myPlaylists.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 border border-gray-800 border-dashed rounded-lg bg-gray-900/30">
                        <p>No playlists yet.</p>
                        <p className="text-sm mt-2">Create one from a track's menu.</p>
                    </div>
                ) : (
                    <PlaylistGrid list={myPlaylists} isOwner={true} />
                )}
            </section>
        )}

        {/* Edit Modal (Existing GunDB Implementation) */}
        {selectedPlaylist && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative max-h-[80vh] flex flex-col">
                    <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                        {editingTitleId === selectedPlaylist.id ? (
                            <div className="flex gap-2 w-full mr-4">
                                <input 
                                    autoFocus
                                    value={editTitleValue}
                                    onChange={e => setEditTitleValue(e.target.value)}
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1 text-white outline-none focus:border-blue-500"
                                    onKeyDown={e => e.key === 'Enter' && handleRename(selectedPlaylist.id, editTitleValue)}
                                />
                                <button onClick={() => handleRename(selectedPlaylist.id, editTitleValue)} className="text-green-400 hover:text-green-300 transition">
                                    <Check className="w-5 h-5" />
                                </button>
                                <button onClick={() => setEditingTitleId(null)} className="text-gray-400 hover:text-white transition">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-white">{selectedPlaylist.title}</h2>
                                <button 
                                    onClick={() => { setEditingTitleId(selectedPlaylist.id); setEditTitleValue(selectedPlaylist.title); }} 
                                    className="text-gray-500 hover:text-white transition"
                                    title="Rename Playlist"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        {editingTitleId !== selectedPlaylist.id && (
                            <button onClick={() => setSelectedPlaylist(null)} className="text-gray-500 hover:text-white transition">
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                         {selectedPlaylist.tracks?.length === 0 && (
                             <p className="text-gray-500 text-center py-8">No tracks in this playlist.</p>
                         )}
                         {selectedPlaylist.tracks?.map((track, i) => (
                             <div 
                                key={track.submissionId + i} 
                                draggable
                                onDragStart={() => handleDragStart(i)}
                                onDragEnter={() => handleDragEnter(i)}
                                onDragEnd={handleDragEnd}
                                className={`flex items-center justify-between p-3 bg-gray-800/50 rounded hover:bg-gray-800 transition group cursor-grab active:cursor-grabbing ${draggedIndex === i ? 'opacity-50 border border-blue-500/50' : 'border border-transparent'}`}
                             >
                                 <div className="flex items-center gap-3 overflow-hidden">
                                     <div className="text-gray-600 hover:text-gray-400 cursor-grab opacity-50 group-hover:opacity-100 transition" title="Drag to reorder">
                                         <GripVertical className="w-4 h-4" />
                                     </div>
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
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'mostComments' | 'fewestComments' | 'alpha' | 'unlistenedFirst'>('newest');
    const [filterByAI, setFilterByAI] = useState(false);
    const [filterByFragile, setFilterByFragile] = useState(false);
    const [filterByUnlistened, setFilterByUnlistened] = useState(false);
    const { listenedTracks } = useListenedTracks();
    const [filterByFeedbackFocus, setFilterByFeedbackFocus] = useState<string[]>([]);

    const areFiltersActive = useMemo(() => {
        return searchTerm !== '' || sortBy !== 'newest' || filterByAI || filterByFragile || filterByUnlistened || filterByFeedbackFocus.length > 0;
    }, [searchTerm, sortBy, filterByAI, filterByFragile, filterByUnlistened, filterByFeedbackFocus]);

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
        setFilterByUnlistened(false);
        setFilterByFeedbackFocus([]);
    }, []);

    const scrolledRef = useRef(false);

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
        if (filterByUnlistened) filtered = filtered.filter(s => s.id && !listenedTracks.has(s.id));
        if (filterByFeedbackFocus.length > 0) {
            filtered = filtered.filter(s => filterByFeedbackFocus.some(f => s.feedbackFocus?.includes(f)));
        }

        // Sort
        filtered.sort((a, b) => {
            if (sortBy === 'newest') return getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt);
            if (sortBy === 'oldest') return getTimestampAsNumber(a.createdAt) - getTimestampAsNumber(b.createdAt);
            if (sortBy === 'alpha') return a.title.localeCompare(b.title);
            if (sortBy === 'unlistenedFirst') {
                const aListened = a.id && listenedTracks.has(a.id) ? 1 : 0;
                const bListened = b.id && listenedTracks.has(b.id) ? 1 : 0;
                if (aListened !== bListened) return aListened - bListened;
                return getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt);
            }
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

    // Scroll to current track on load
    useEffect(() => {
        if (!scrolledRef.current && currentTrack && visibleSubmissions.length > 0) {
            const trackIsVisible = visibleSubmissions.some(s => s.id === currentTrack.id);
            if (trackIsVisible) {
                setTimeout(() => {
                    const el = document.getElementById(`track-${currentTrack.id}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        scrolledRef.current = true;
                    }
                }, 500);
            }
        }
    }, [visibleSubmissions, currentTrack]);

    const handlePlayAll = () => {
        if (visibleSubmissions.length > 0) {
            if (isPlaying && visibleSubmissions.some(s => s.id === currentTrack?.id)) {
                pause();
            } else {
                play(visibleSubmissions[0], visibleSubmissions, {
                    type: 'playlist',
                    id: id,
                    name: playlist?.title || 'Playlist',
                    link: `/playlists/${id}`,
                    artworkUrl: playlist?.artworkUrl
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
                link: `/playlists/${id}`,
                artworkUrl: playlist?.artworkUrl
            });
        }
    };

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500" /></div>;
    if (error || !playlist) return <div className="text-center p-20 text-red-500">{error || "Not Found"}</div>;

    // Access Check using isAllowed properly
    // isHost is already destructured from computedVisibleSubmissions
    const hasSubmitted = submissions.some(s => s.uploaderEmail?.toLowerCase() === participantEmail?.toLowerCase());
    
    // 1. Strict Playlist Access List Check
    // If playlist has an explicit access list, user MUST be on it (or be Host/Admin)
    const hasPlaylistAccessList = playlist.accessList && playlist.accessList.length > 0;
    const isOnPlaylistAccessList = playlist.accessList?.some(e => e.toLowerCase() === participantEmail?.toLowerCase());
    
    if (hasPlaylistAccessList && !isOnPlaylistAccessList && !isHost) {
         return (
            <div className="flex flex-col items-center justify-center p-20 text-center">
                 <Lock className="w-12 h-12 text-red-500 mb-4" />
                 <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                 <p className="text-gray-500">You do not have permission to view this playlist.</p>
            </div>
        );
    }

    // 2. Request-based Logic (Submission & Deadline enforcement)
    // If on Request Access List + No Submission + Past Due -> Content Locked (but page visible)
    const isOnRequestAccessList = request?.accessList?.some(e => e.toLowerCase() === participantEmail?.toLowerCase());
    const isPastDeadline = request?.deadline && Date.now() > new Date(request.deadline).getTime();
    
    let contentLocked = false;
    let lockReason = "";

    if (isOnRequestAccessList && !isHost && !hasSubmitted && isPastDeadline) {
        contentLocked = true;
        lockReason = "You did not submit a track in time. Content is locked.";
    }

    // 3. Existing Preview/Live Logic (Refined)
    if (!isHost && request?.playlistLiveDate) {
        const liveDate = new Date(request.playlistLiveDate).getTime();
        if (Date.now() < liveDate) {
            if (hasSubmitted) {
                // Preview Mode: Handled in computedVisibleSubmissions or here? 
                // computedVisibleSubmissions handles the filtering/shuffling.
                // We just need to ensure we don't override it with a full lock unless necessary.
                lockReason = `Playlist is not live yet. Preview mode active.`;
            } else {
                contentLocked = true;
                lockReason = "Playlist is locked until the live date.";
            }
        }
    }

    // Basic Public/Fallback Check if not caught above
    // If no specific blocking, we check generic visibility
    const isAllowed = isHost || isOnPlaylistAccessList || playlist.accessMode === 'public' || isOnRequestAccessList;
    
    if (!isAllowed && !contentLocked) { // If contentLocked is true, we allow view (metadata) but lock tracks
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
                        
                        {(lockReason || lockMessage) && (
                            <div className="mt-4 inline-flex items-center gap-2 bg-yellow-900/30 text-yellow-200 px-3 py-1 rounded-full text-xs font-bold border border-yellow-700/50">
                                <Lock className="w-3 h-3" /> {lockReason || lockMessage}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {contentLocked ? (
                <div className="text-center py-20 text-gray-500 border border-gray-800 border-dashed rounded-lg bg-gray-900/30">
                    <Lock className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                    <h3 className="text-xl font-bold text-white mb-2">Content Locked</h3>
                    <p>{lockReason}</p>
                </div>
            ) : (
                <>
                    {/* Controls */}
                    <div className="flex flex-wrap justify-between items-center gap-y-4 mb-6 relative">
                    <div className="flex gap-2 flex-shrink-0">
                     <button onClick={handlePlayAll} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap">
                         {isPlaying && visibleSubmissions.some(s => s.id === currentTrack?.id) ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                         Play All
                     </button>
                     <button onClick={handleShufflePlay} className="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition flex-shrink-0" title="Shuffle">
                         <Shuffle className="w-5 h-5" />
                     </button>
                    </div>

                    <div className="flex gap-2 relative flex-shrink-0">
                     <button
                         onClick={() => setShowFilterPopover(!showFilterPopover)}                         className={`p-2 rounded-lg transition ${areFiltersActive ? 'bg-blue-900/50 text-blue-400 border border-blue-500/50' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
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
                             filterByUnlistened={filterByUnlistened}
                             setFilterByUnlistened={setFilterByUnlistened}
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
                        <div key={sub.id} id={`track-${sub.id}`} className={`bg-gray-900 border ${currentTrack?.id === sub.id ? 'border-green-500/50 border-l-4 border-l-green-500' : 'border-gray-800'} rounded-lg p-4 flex flex-col gap-4 hover:border-gray-700 transition`}>
                             <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 bg-gray-800 rounded overflow-hidden flex-shrink-0 relative">
                                     <ArtworkDisplay src={fixUrl(sub.artworkUrl)} alt="Art" className="w-full h-full object-cover" FallbackIcon={FileAudio} />
                                 </div>
                                 <div className="flex-1 min-w-0">
                                     <h4 className="text-white font-bold truncate">{sub.byline || 'Anonymous'}</h4>
                                     <p className="text-gray-400 text-sm truncate">{sub.title}</p>
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
                                             else play(sub, visibleSubmissions, { type: 'playlist', id: id, name: playlist.title, link: `/playlists/${id}`, artworkUrl: playlist.artworkUrl });
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
            </>
            )}
        </div>
    );
}


import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, orderBy, onSnapshot, getCountFromServer, deleteDoc, doc } from 'firebase/firestore';
import { Loader2, Plus, ListMusic, Play, Settings, FolderOpen, Trash2 } from 'lucide-react';
import type { Playlist, WatchParty, FileRequest } from '../types';

export function PartyHub() {
    const { user, isAdmin } = useAuth();
    const navigate = useNavigate();

    const [adminPlaylists, setAdminPlaylists] = useState<Playlist[]>([]);
    const [adminRequests, setAdminRequests] = useState<(FileRequest & { trackCount?: number })[]>([]);
    const [watchParties, setWatchParties] = useState<WatchParty[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    
    // Form state
    const [sourceType, setSourceType] = useState<'playlist' | 'request'>('playlist');
    const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
    const [selectedRequestId, setSelectedRequestId] = useState<string>('');
    const [isRadioMode, setIsRadioMode] = useState<boolean>(false);

    useEffect(() => {
        if (!user || (!isAdmin && user.uid)) {
            navigate('/');
            return;
        }

        const fetchOptions = async () => {
            try {
                // Fetch Playlists
                const plQuery = query(
                    collection(db, 'playlists'),
                    where('ownerPub', '==', user.uid),
                    orderBy('createdAt', 'desc')
                );
                const plSnap = await getDocs(plQuery);
                const pl: Playlist[] = [];
                plSnap.forEach(doc => {
                    pl.push({ id: doc.id, ...doc.data() } as Playlist);
                });
                setAdminPlaylists(pl);
                if (pl.length > 0) setSelectedPlaylistId(pl[0].id);

                // Fetch Requests
                const reqQuery = isAdmin 
                    ? query(collection(db, 'requests'), orderBy('createdAt', 'desc'))
                    : query(collection(db, 'requests'), where('ownerPub', '==', user.uid), orderBy('createdAt', 'desc'));

                const reqSnap = await getDocs(reqQuery);
                const reqs: (FileRequest & { trackCount?: number })[] = [];
                const countPromises: Promise<void>[] = [];
                
                reqSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    if (!data.deleted) {
                        const reqData = { id: docSnap.id, ...data } as FileRequest;
                        reqs.push(reqData);
                        
                        // Fetch count for this request
                        const countQ = query(collection(db, 'submissions'), where('requestId', '==', docSnap.id));
                        countPromises.push(
                            getCountFromServer(countQ).then(snap => {
                                const index = reqs.findIndex(r => r.id === docSnap.id);
                                if (index !== -1) {
                                    reqs[index].trackCount = snap.data().count;
                                }
                            }).catch(err => console.error("Error fetching count:", err))
                        );
                    }
                });
                
                await Promise.all(countPromises);
                setAdminRequests(reqs);
                if (reqs.length > 0) setSelectedRequestId(reqs[0].id!);

            } catch (e) {
                console.error("Error fetching creator options:", e);
            }
        };

        fetchOptions();

        // Listen for active watch parties created by this host
        const wq = query(
            collection(db, 'watchParties'),
            where('hostPub', '==', user.uid),
            // We can't strictly order by trackStartTime if it can be a serverTimestamp that hasn't resolved
            // so we handle sorting client-side or just listen
        );
        
        const unsub = onSnapshot(wq, (snap) => {
            const parties: WatchParty[] = [];
            snap.forEach(doc => {
                 parties.push({ id: doc.id, ...doc.data() } as WatchParty);
            });
            // Sort client side, treating 'live' differently if we want to
            setWatchParties(parties);
            setLoading(false);
        });

        return () => unsub();

    }, [user, isAdmin, navigate]);

    const handleCreateParty = async () => {
        setCreating(true);

        try {
            let trackIds: string[] = [];

            let partyName = "Watch Party";

            if (sourceType === 'playlist') {
                if (!selectedPlaylistId) {
                    alert("Please select a playlist.");
                    setCreating(false);
                    return;
                }
                const pl = adminPlaylists.find(p => p.id === selectedPlaylistId);
                if (!pl || !pl.tracks || pl.tracks.length === 0) {
                    alert("Selected playlist has no tracks.");
                    setCreating(false);
                    return;
                }
                trackIds = pl.tracks.map(t => t.submissionId);
                partyName = pl.title;
                
            } else if (sourceType === 'request') {
                if (!selectedRequestId) {
                    alert("Please select a request.");
                    setCreating(false);
                    return;
                }
                const subQuery = query(collection(db, 'submissions'), where('requestId', '==', selectedRequestId));
                const subSnap = await getDocs(subQuery);
                if (subSnap.empty) {
                    alert("No submissions found for this request.");
                    setCreating(false);
                    return;
                }
                
                const req = adminRequests.find(r => r.id === selectedRequestId);
                if (req) partyName = req.title;

                // Collect and sort by creation time
                const subs = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                // Simple sort by time if possible, otherwise rely on order
                subs.sort((a: any, b: any) => {
                    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
                    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
                    return aTime - bTime;
                });
                
                trackIds = subs.map(s => s.id);
            }

            if (trackIds.length === 0) {
                 alert("Failed to gather tracks.");
                 setCreating(false);
                 return;
            }

            // Create the watch party document
            const partyPayload: Partial<WatchParty> = {
                status: 'scheduled',
                playlist: trackIds,
                currentIndex: 0,
                trackStartTime: 0,
                hostPub: user!.uid,
                isRadioMode: isRadioMode,
                name: partyName
            };
            
            if (sourceType === 'request' && selectedRequestId) {
                partyPayload.requestId = selectedRequestId;
            } else if (sourceType === 'playlist' && selectedPlaylistId) {
                partyPayload.playlistId = selectedPlaylistId;
            }

            const docRef = await addDoc(collection(db, 'watchParties'), partyPayload);
            
            // Redirect straight to it
            navigate(`/party/${docRef.id}`);

        } catch (e) {
            console.error("Failed to create watch party:", e);
            alert("Failed to create the watch party.");
            setCreating(false);
        }
    };

    const handleDeleteParty = async (e: React.MouseEvent, partyId: string) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (confirm("Are you sure you want to delete this watch party? It will end the session for anyone currently watching.")) {
            try {
                await deleteDoc(doc(db, 'watchParties', partyId));
            } catch (err) {
                console.error("Failed to delete watch party:", err);
                alert("Failed to delete the watch party.");
            }
        }
    };

    if (loading) {
         return (
             <div className="flex justify-center items-center py-20">
                 <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
             </div>
         );
    }

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-8">
             <div className="mb-8 flex items-center gap-3 border-b border-gray-800 pb-4">
                 <div className="p-3 bg-blue-500/20 rounded-xl">
                     <Settings className="w-6 h-6 text-blue-400" />
                 </div>
                 <div>
                     <h1 className="text-3xl font-bold text-white">Watch Party Hub</h1>
                     <p className="text-gray-400 mt-1">Create and manage your synchronized listening events.</p>
                 </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  
                  {/* Create New Party Section */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-fit">
                      <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                          <Plus className="w-5 h-5 text-green-400" /> New Watch Party
                      </h2>
                      <p className="text-sm text-gray-400 mb-6">
                          Select a source to act as the blueprint for the watch party.
                      </p>

                      <div className="flex gap-2 mb-6">
                          <button 
                              onClick={() => setSourceType('playlist')}
                              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors border ${sourceType === 'playlist' ? 'bg-blue-600/20 text-blue-400 border-blue-500/50' : 'bg-transparent text-gray-500 border-gray-800 hover:bg-gray-800'}`}
                          >
                              <ListMusic className="w-4 h-4 inline-block mr-2" /> From Playlist
                          </button>
                          <button 
                              onClick={() => setSourceType('request')}
                              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors border ${sourceType === 'request' ? 'bg-blue-600/20 text-blue-400 border-blue-500/50' : 'bg-transparent text-gray-500 border-gray-800 hover:bg-gray-800'}`}
                          >
                              <FolderOpen className="w-4 h-4 inline-block mr-2" /> From Request
                          </button>
                      </div>

                      <div className="space-y-4">
                          {sourceType === 'playlist' ? (
                              <div>
                                  <label className="block text-sm font-medium text-gray-300 mb-2">Base Playlist</label>
                                  {adminPlaylists.length > 0 ? (
                                      <select 
                                          value={selectedPlaylistId}
                                          onChange={(e) => setSelectedPlaylistId(e.target.value)}
                                          className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-blue-500 transition"
                                          disabled={creating}
                                      >
                                          {adminPlaylists.map(pl => (
                                              <option key={pl.id} value={pl.id}>
                                                  {pl.title} ({pl.tracks?.length || 0} tracks)
                                              </option>
                                          ))}
                                      </select>
                                  ) : (
                                      <div className="bg-gray-800 p-3 rounded-lg text-sm text-gray-400 border border-gray-700">
                                          You don't have any playlists yet. <Link to="/playlists" className="text-blue-400 hover:underline">Create one first.</Link>
                                      </div>
                                  )}
                              </div>
                          ) : (
                              <div>
                                  <label className="block text-sm font-medium text-gray-300 mb-2">Base Request</label>
                                  {adminRequests.length > 0 ? (
                                      <select 
                                          value={selectedRequestId}
                                          onChange={(e) => setSelectedRequestId(e.target.value)}
                                          className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-blue-500 transition"
                                          disabled={creating}
                                      >
                                          {adminRequests.map(req => (
                                              <option key={req.id} value={req.id} disabled={req.trackCount === 0}>
                                                  {req.title} ({req.trackCount !== undefined ? `${req.trackCount} track${req.trackCount === 1 ? '' : 's'}` : '...'})
                                              </option>
                                          ))}
                                      </select>
                                  ) : (
                                      <div className="bg-gray-800 p-3 rounded-lg text-sm text-gray-400 border border-gray-700">
                                          You don't have any requests yet. <Link to="/creator" className="text-blue-400 hover:underline">Create one first.</Link>
                                      </div>
                                  )}
                              </div>
                          )}

                          <label className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg cursor-pointer hover:bg-gray-800 transition">
                              <input 
                                  type="checkbox" 
                                  checked={isRadioMode}
                                  onChange={(e) => setIsRadioMode(e.target.checked)}
                                  className="w-5 h-5 rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                              />
                              <div>
                                  <span className="block text-sm font-medium text-white">Enable Radio Mode</span>
                                  <span className="block text-xs text-gray-400 mt-0.5">Playlist will loop automatically. No host required.</span>
                              </div>
                          </label>

                          <button
                              onClick={handleCreateParty}
                              disabled={creating || (sourceType === 'playlist' ? adminPlaylists.length === 0 : adminRequests.length === 0)}
                              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                              Start Watch Party
                          </button>
                      </div>
                  </div>

                  {/* Existing Parties Section */}
                  <div>
                      <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                          <ListMusic className="w-5 h-5 text-gray-400" /> Your Watch Parties
                      </h2>
                      
                      {watchParties.length === 0 ? (
                          <div className="text-center py-12 bg-gray-900/50 border border-gray-800 border-dashed rounded-xl">
                              <p className="text-gray-500">No active watch parties found.</p>
                          </div>
                      ) : (
                          <div className="space-y-3">
                              {watchParties.map(party => (
                                  <Link 
                                      key={party.id} 
                                      to={`/party/${party.id}`}
                                      className="block bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-blue-500 transition group"
                                  >
                                      <div className="flex justify-between items-start">
                                          <div>
                                              <p className="font-medium text-white group-hover:text-blue-400 transition truncate pr-4">
                                                  {party.name || `Party #${party.id?.substring(0,6)}`}
                                              </p>
                                              <p className="text-xs text-gray-500 mt-1">
                                                  {party.playlist.length} tracks
                                              </p>
                                          </div>
                                          <span className={`text-xs px-2 py-1 rounded-full uppercase tracking-wider font-bold ${
                                              party.status === 'live' ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
                                              party.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' :
                                              'bg-gray-800 text-gray-400 border border-gray-700'
                                          }`}>
                                              {party.status}
                                          </span>
                                      </div>
                                      {party.isRadioMode && (
                                          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold">
                                              Radio Mode Active
                                          </div>
                                      )}
                                      <div className="mt-3 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button 
                                              onClick={(e) => handleDeleteParty(e, party.id!)}
                                              className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                                              title="Delete Watch Party"
                                          >
                                              <Trash2 className="w-4 h-4" />
                                          </button>
                                      </div>
                                  </Link>
                              ))}
                          </div>
                      )}
                  </div>
             </div>
        </div>
    );
}

import { useEffect, useState } from 'react';
import { useGun } from '../contexts/GunContext';
import { usePlayer } from '../contexts/PlayerContext';
import type { Playlist, Submission } from '../types';
import { Play, Trash2, ListMusic, Loader2, Edit, X } from 'lucide-react';

export function Playlists() {
  const { user, gun } = useGun();
  const { play } = usePlayer();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  useEffect(() => {
     setPlaylists([]);
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

  const handlePlay = async (playlist: Playlist, startIndex = 0) => {
      if (!playlist.tracks || playlist.tracks.length === 0) return;
      setLoadingId(playlist.id);
      
      // Fetch audioUrl for each track
      const promises = playlist.tracks.map(track => {
          return new Promise<Submission | null>((resolve) => {
              gun.get('file_requests')
                 .get(track.requestId)
                 .get('submissions')
                 .get(track.submissionId)
                 .once((data: any) => {
                     if (data && data.audioUrl) {
                        resolve({ ...data, id: track.submissionId });
                     } else {
                        resolve(null);
                     }
                 });
          });
      });
      
      const results = await Promise.all(promises);
      const validTracks = results.filter(t => t !== null) as Submission[];
      
      if (validTracks.length > 0) {
          // Adjust validTracks start index based on original playlist index if valid
          // This is tricky if some tracks failed. We'll play from 0 relative to valid list.
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
      // State updates automatically via listener
  };

  return (
    <div className="max-w-5xl mx-auto p-8 pb-32">
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
                        
                        {/* Mini Track List Preview */}
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

        {/* Edit Modal */}
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
    </div>
  );
}


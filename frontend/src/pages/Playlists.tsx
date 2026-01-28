import { useEffect, useState } from 'react';
import { useGun } from '../contexts/GunContext';
import { usePlayer } from '../contexts/PlayerContext';
import type { Playlist, Submission } from '../types';
import { Play, Trash2, ListMusic, Loader2 } from 'lucide-react';

export function Playlists() {
  const { user, gun } = useGun();
  const { play } = usePlayer();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

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
                 // Simple equality check to prevent loops if reference changes
                 if (exists && JSON.stringify(exists.tracks) === JSON.stringify(pl.tracks) && exists.title === pl.title) {
                     return prev;
                 }
                 if (exists) return prev.map(p => p.id === key ? pl : p);
                 return [...prev, pl];
             });
         } else if (data === null) {
             // Deleted
             setPlaylists(prev => prev.filter(p => p.id !== key));
         }
     });
  }, [user]);

  const handlePlay = async (playlist: Playlist) => {
      if (!playlist.tracks || playlist.tracks.length === 0) return;
      setLoadingId(playlist.id);
      
      // We need to fetch audioUrl for each track
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
          play(validTracks[0], validTracks, {
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
                            <button 
                                onClick={() => deletePlaylist(pl.id)}
                                className="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
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
                        <div className="mt-4 space-y-1">
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
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useGun } from '../contexts/GunContext';
import type { Playlist, Submission } from '../types';
import { X, Plus, ListMusic, Check, Save } from 'lucide-react';

interface AddToPlaylistProps {
  submission: Submission;
  onClose: () => void;
}

export function AddToPlaylist({ submission, onClose }: AddToPlaylistProps) {
  const { user, pubKey } = useGun();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
     setPlaylists([]); // Clear on mount
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
                 if (exists) return prev.map(p => p.id === key ? pl : p);
                 return [...prev, pl];
             });
         }
     });
  }, [user]);

  const createPlaylist = () => {
      if (!newPlaylistTitle.trim()) return;
      const id = crypto.randomUUID();
      const playlist = {
          id,
          title: newPlaylistTitle,
          ownerPub: pubKey,
          createdAt: Date.now(),
          tracks: JSON.stringify([]) 
      };
      
      user.get('playlists').get(id).put(playlist);
      setNewPlaylistTitle('');
      setIsCreating(false);
  };

  const addToPlaylist = (playlist: Playlist) => {
      // Get current tracks
      const currentTracks = playlist.tracks || [];
      
      // Check duplicate
      if (currentTracks.find((t: any) => t.submissionId === submission.id)) {
          alert('Track already in playlist');
          return;
      }
      
      const newTrack = {
          submissionId: submission.id,
          requestId: submission.requestId,
          addedAt: Date.now(),
          title: submission.title,
          artist: submission.byline || 'Unknown'
      };
      
      const updatedTracks = [...currentTracks, newTrack];
      
      user.get('playlists').get(playlist.id).get('tracks').put(JSON.stringify(updatedTracks));
      
      onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-sm shadow-2xl relative">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-gray-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ListMusic className="w-5 h-5 text-blue-500" />
                Add to Playlist
            </h2>
            <p className="text-gray-400 text-sm mt-1 truncate">
                {submission.title}
            </p>
        </div>

        <div className="p-4 max-h-60 overflow-y-auto space-y-2">
            {playlists.length === 0 && !isCreating && (
                <p className="text-center text-gray-500 text-sm py-4">No playlists yet.</p>
            )}
            
            {playlists.map(pl => {
                const count = pl.tracks ? pl.tracks.length : 0;
                const hasTrack = pl.tracks?.some(t => t.submissionId === submission.id);
                
                return (
                    <button
                        key={pl.id}
                        onClick={() => addToPlaylist(pl)}
                        disabled={hasTrack}
                        className={`w-full text-left p-3 rounded flex items-center justify-between group ${hasTrack ? 'bg-gray-800/50 opacity-50 cursor-not-allowed' : 'bg-gray-800 hover:bg-gray-700'}`}
                    >
                        <div>
                            <div className="text-white font-medium">{pl.title}</div>
                            <div className="text-xs text-gray-500">{count} tracks</div>
                        </div>
                        {hasTrack && <Check className="w-4 h-4 text-green-500" />}
                    </button>
                );
            })}
        </div>

        <div className="p-4 border-t border-gray-800">
            {isCreating ? (
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={newPlaylistTitle}
                        onChange={e => setNewPlaylistTitle(e.target.value)}
                        placeholder="Playlist Name"
                        className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
                        autoFocus
                    />
                    <button 
                        onClick={createPlaylist}
                        className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded"
                    >
                        <Save className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <button 
                    onClick={() => setIsCreating(true)}
                    className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded flex items-center justify-center gap-2 text-sm font-medium transition"
                >
                    <Plus className="w-4 h-4" /> Create New Playlist
                </button>
            )}
        </div>
      </div>
    </div>
  );
}

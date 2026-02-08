import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Music, Check, Loader2 } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { useToast } from '../contexts/ToastContext';
import type { Playlist, Submission } from '../types';

interface AddToPlaylistProps {
  submission: Submission;
  onClose: () => void;
}

export function AddToPlaylist({ submission, onClose }: AddToPlaylistProps) {
  const { user, pubKey } = useGun();
  const { success, error } = useToast();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    const plMap = new Map<string, Playlist>();
    
    user.get('playlists').map().on((data: any, key: string) => {
        if (data && data.title) {
            let tracks = [];
            if (typeof data.tracks === 'string') {
                try { tracks = JSON.parse(data.tracks); } catch (e) {}
            } else if (Array.isArray(data.tracks)) {
                tracks = data.tracks;
            }
            
            plMap.set(key, { ...data, id: key, tracks });
            setPlaylists(Array.from(plMap.values()).sort((a, b) => b.createdAt - a.createdAt));
            setLoading(false);
        }
    });
    
    // Timeout fallback
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, [user]);

  const handleCreate = async () => {
      if (!newPlaylistTitle.trim()) return;
      setIsCreating(true);
      
      const id = crypto.randomUUID();
      const playlist: Playlist = {
          id,
          title: newPlaylistTitle,
          ownerPub: pubKey as string,
          createdAt: Date.now(),
          tracks: []
      };
      
      // 1. Save New Playlist
      await new Promise<void>(resolve => {
          user.get('playlists').get(id).put({
              ...playlist,
              tracks: JSON.stringify([])
          }, () => resolve());
      });
      
      setNewPlaylistTitle('');
      setIsCreating(false);
      success("Playlist created");

      // 2. Auto-add current track
      handleAdd(playlist);
  };

  const handleAdd = async (playlist: Playlist) => {
      if (!playlist.id || !submission.id || !submission.requestId) return;
      
      // Check if already in playlist
      if (playlist.tracks.some(t => t.submissionId === submission.id)) {
          error("Track already in playlist");
          return;
      }
      
      const trackEntry = {
          submissionId: submission.id,
          requestId: submission.requestId,
          addedAt: Date.now(),
          title: submission.title,
          artist: submission.byline || 'Unknown'
      };
      
      const updatedTracks = [...playlist.tracks, trackEntry];
      
      // Update
      user.get('playlists').get(playlist.id).get('tracks').put(JSON.stringify(updatedTracks));
      
      success(`Added to "${playlist.title}"`);
      onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950/50">
            <h3 className="font-bold text-white flex items-center gap-2">
                <Music className="w-4 h-4 text-blue-500" />
                Add to Playlist
            </h3>
            <button onClick={onClose} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
            </button>
        </div>
        
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
            <div className="flex gap-2 mb-4">
                <input 
                    type="text" 
                    value={newPlaylistTitle}
                    onChange={(e) => setNewPlaylistTitle(e.target.value)}
                    placeholder="New Playlist Name"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500 transition"
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <button 
                    onClick={handleCreate}
                    disabled={isCreating || !newPlaylistTitle.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition disabled:opacity-50"
                >
                    {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                </button>
            </div>

            {loading && playlists.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
            ) : playlists.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">No playlists yet. Create one above!</div>
            ) : (
                playlists.map(pl => {
                    const exists = pl.tracks.some(t => t.submissionId === submission.id);
                    return (
                        <button
                            key={pl.id}
                            onClick={() => handleAdd(pl)}
                            disabled={exists}
                            className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition ${exists ? 'bg-green-900/20 opacity-70 cursor-default' : 'bg-gray-800 hover:bg-gray-700'}`}
                        >
                            <span className={`text-sm font-medium ${exists ? 'text-green-400' : 'text-white'}`}>{pl.title}</span>
                            {exists ? <Check className="w-4 h-4 text-green-500" /> : <span className="text-xs text-gray-500">{pl.tracks.length} tracks</span>}
                        </button>
                    );
                })
            )}
        </div>
      </div>
    </div>,
    document.body
  );
}
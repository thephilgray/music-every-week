import { useEffect, useState } from 'react';
import { db } from '../../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { X, Music2, Loader2, ExternalLink } from 'lucide-react';

interface MyPlaylistsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail: string;
}

interface PlaylistSummary {
  id: string;
  title: string;
  description?: string;
  createdAt: any;
}

export function MyPlaylistsModal({ isOpen, onClose, currentUserEmail }: MyPlaylistsModalProps) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !currentUserEmail) return;

    async function loadPlaylists() {
      setLoading(true);
      try {
        // Query playlists where accessList contains the email
        const q = query(
          collection(db, 'playlists'), 
          where('accessList', 'array-contains', currentUserEmail)
        );
        
        const snapshot = await getDocs(q);
        const loaded = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as PlaylistSummary));
        
        // Client-side sort if index is missing for array-contains + orderBy
        loaded.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        
        setPlaylists(loaded);
      } catch (err) {
        console.error("Error loading playlists:", err);
      } finally {
        setLoading(false);
      }
    }
    loadPlaylists();
  }, [isOpen, currentUserEmail]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Music2 className="w-5 h-5 text-purple-500" />
                My Playlists
            </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading ? (
                <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin text-gray-500" />
                </div>
            ) : playlists.length === 0 ? (
                <div className="text-center py-10 text-gray-500 italic">
                    No playlists found.
                </div>
            ) : (
                playlists.map(pl => (
                    <a 
                        key={pl.id} 
                        href={`/p/${pl.id}`} 
                        className="block bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-lg p-4 transition group"
                    >
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors">{pl.title}</h3>
                            <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-white" />
                        </div>
                        {pl.description && <p className="text-xs text-gray-400 mt-1 truncate">{pl.description}</p>}
                    </a>
                ))
            )}
        </div>
      </div>
    </div>
  );
}

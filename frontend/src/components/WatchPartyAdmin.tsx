import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Play, Pause, SkipForward, GripVertical } from 'lucide-react';
import { CollaboratorList } from './ui/CollaboratorList';
import type { WatchParty, Submission } from '../types';

interface WatchPartyAdminProps {
  party: WatchParty;
  calculateOffset: () => number;
}

export function WatchPartyAdmin({ party, calculateOffset }: WatchPartyAdminProps) {
  const { user, isAdmin } = useAuth();
  const [tracks, setTracks] = useState<(Submission | null)[]>([]);
  const isHostOrAdmin = user && (user.uid === party.hostPub || isAdmin);

  // Fetch track details for playlist
  useEffect(() => {
    const fetchTracks = async () => {
      if (!party.playlist || party.playlist.length === 0) return;
      const results = await Promise.all(
        party.playlist.map(async (trackId) => {
          try {
            const trackDoc = await getDoc(doc(db, 'submissions', trackId));
            if (trackDoc.exists()) {
              return { id: trackDoc.id, ...trackDoc.data() } as Submission;
            }
            return null;
          } catch (e) {
            console.error("Error fetching track", e);
            return null;
          }
        })
      );
      setTracks(results);
    };
    fetchTracks();
  }, [party.playlist]);



  const handlePlay = async () => {
    if (!party.id) return;
    await updateDoc(doc(db, 'watchParties', party.id), {
      status: 'live',
      trackStartTime: serverTimestamp(),
    });
  };

  const handlePause = async () => {
    if (!party.id) return;
    const currentOffsetSeconds = calculateOffset();
    await updateDoc(doc(db, 'watchParties', party.id), {
      status: 'paused',
      pausedOffset: Math.floor(currentOffsetSeconds * 1000)
    });
  };

  const handleNext = async () => {
    if (!party.id) return;
    const nextIndex = party.currentIndex + 1;
    if (nextIndex >= party.playlist.length) {
      await updateDoc(doc(db, 'watchParties', party.id), {
        status: 'ended',
        currentIndex: nextIndex,
      });
      return;
    }
    
    await updateDoc(doc(db, 'watchParties', party.id), {
      status: 'live',
      currentIndex: nextIndex,
      trackStartTime: serverTimestamp(),
      pausedOffset: 0
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('trackIndex', index.toString());
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const draggedText = e.dataTransfer.getData('trackIndex');
    if (!draggedText) return;
    
    const dragIndex = parseInt(draggedText, 10);
    if (dragIndex === dropIndex || isNaN(dragIndex)) return;

    if (!party.id) return;

    const newPlaylist = [...party.playlist];
    const [movedItem] = newPlaylist.splice(dragIndex, 1);
    newPlaylist.splice(dropIndex, 0, movedItem);

    // Update currentIndex to keep the currently playing track in sync if it moved or shifted
    let newIndex = party.currentIndex;
    if (dragIndex === party.currentIndex) {
      newIndex = dropIndex;
    } else if (dragIndex < party.currentIndex && dropIndex >= party.currentIndex) {
      newIndex--;
    } else if (dragIndex > party.currentIndex && dropIndex <= party.currentIndex) {
      newIndex++;
    }

    await updateDoc(doc(db, 'watchParties', party.id), {
      playlist: newPlaylist,
      currentIndex: newIndex,
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handlePlayTrack = async (index: number) => {
    if (!party.id) return;
    if (index === party.currentIndex) return;

    await updateDoc(doc(db, 'watchParties', party.id), {
      status: 'live',
      currentIndex: index,
      trackStartTime: serverTimestamp(),
      pausedOffset: 0
    });
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-8 bg-gray-900 border border-gray-800 rounded-xl p-6">
      {isHostOrAdmin && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-white">DJ Controls</h3>
            {party.requestId && (
                <div className="flex items-center gap-1.5 text-[10px] text-blue-400/80 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    SYNCED TO REQUEST
                </div>
            )}
          </div>
          <div className="flex gap-3">
             {party.status !== 'live' ? (
               <button onClick={handlePlay} className="p-3 bg-blue-600 hover:bg-blue-500 rounded-full text-white transition shadow-lg">
                 <Play className="w-6 h-6 fill-current" />
               </button>
             ) : (
               <button onClick={handlePause} className="p-3 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition">
                 <Pause className="w-6 h-6 fill-current" />
               </button>
             )}
             <button 
               onClick={handleNext} 
               disabled={party.currentIndex >= party.playlist.length - 1} 
               className="p-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-white transition"
             >
               <SkipForward className="w-6 h-6 fill-current" />
             </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Watch Party Playlist</h4>
        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
          {party.playlist.map((trackId, index) => {
            const track = tracks.find(t => t?.id === trackId);
            const isPlaying = index === party.currentIndex;
            const isPlayed = index < party.currentIndex;
            
            return (
              <div 
                key={trackId + '-' + index}
                draggable={isHostOrAdmin ? true : false}
                onDragStart={(e) => isHostOrAdmin && handleDragStart(e, index)}
                onDragOver={handleDragOver}
                onDrop={(e) => isHostOrAdmin && handleDrop(e, index)}
                onDoubleClick={() => isHostOrAdmin && handlePlayTrack(index)}
                className={`flex items-center justify-between p-3 rounded-lg border ${isPlaying ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-gray-800 border-gray-700'} ${isPlayed ? 'opacity-60' : ''} ${isHostOrAdmin ? 'cursor-grab active:cursor-grabbing hover:bg-gray-750' : ''} transition`}
                title={isHostOrAdmin ? "Drag to reorder, double-click to play from here" : undefined}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  {isHostOrAdmin && <GripVertical className="w-5 h-5 text-gray-500 shrink-0" />}
                  <div className={`flex w-8 h-8 rounded shrink-0 items-center justify-center text-xs font-bold ${isPlaying ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                    {index + 1}
                  </div>
                  <div className="truncate">
                    <p className={`font-medium truncate ${isPlaying ? 'text-blue-400' : 'text-white'}`}>
                      {track ? track.title : 'Loading...'}
                    </p>
                    <div className="text-xs text-gray-400 truncate">
                      {track ? (
                        <CollaboratorList 
                            uploaderPub={track.originalUploaderPub}
                            uploaderEmail={track.uploaderEmail}
                            byline={track.byline}
                            collaborators={track.collaborators as any}
                            proxyFor={track.proxyFor}
                            linkProfile={true}
                        />
                      ) : (
                        trackId
                      )}
                    </div>
                  </div>
                </div>
                {isPlaying && (
                  <div className="flex gap-1 shrink-0 px-2 py-1 bg-black/30 rounded-full">
                    <div className="w-1 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1 h-4 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {isHostOrAdmin && (
          <p className="text-xs text-gray-500 mt-2 text-center">Drag to reorder • Double-click a track to skip to it</p>
        )}
      </div>
    </div>
  );
}

import { X, Play, Music } from 'lucide-react';
import type { Submission } from '../../types';

interface QueueModalProps {
    queue: Submission[];
    currentTrack: Submission | null;
    onPlay: (track: Submission) => void;
    onClose: () => void;
}

export function QueueModal({ queue, currentTrack, onPlay, onClose }: QueueModalProps) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
           <div className="bg-gray-900 border border-gray-700 rounded-lg w-11/12 md:max-w-xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
               <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                   <h3 className="text-lg font-bold text-white">Current Queue</h3>
                   <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
                       <X className="w-5 h-5" />
                   </button>
               </div>
               
               <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                   {queue.length === 0 ? (
                       <div className="text-center text-gray-500 py-8">
                           Queue is empty
                       </div>
                   ) : (
                       <div className="space-y-1">
                           {queue.map((track, index) => {
                               const isCurrent = currentTrack?.id === track.id;
                               return (
                                   <div 
                                       key={`${track.id}-${index}`}
                                       className={`flex items-center gap-3 p-2 rounded-md hover:bg-gray-800 group transition cursor-pointer ${isCurrent ? 'bg-gray-800 ring-1 ring-blue-500/50' : ''}`}
                                       onClick={() => {
                                           onPlay(track);
                                           // Optional: Close on play? I think keeping it open is better for exploring.
                                       }}
                                   >
                                       <div className="w-10 h-10 bg-gray-800 rounded overflow-hidden flex-shrink-0 relative">
                                            {track.artworkUrl ? (
                                                <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-700">
                                                    <Music className="w-4 h-4 text-gray-500" />
                                                </div>
                                            )}
                                            {/* Hover Play Overlay */}
                                            <div className={`absolute inset-0 bg-black/40 flex items-center justify-center ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition`}>
                                                {isCurrent ? (
                                                     <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                                                ) : (
                                                     <Play className="w-4 h-4 text-white fill-white" />
                                                )}
                                            </div>
                                       </div>
                                       
                                       <div className="min-w-0 flex-1">
                                           <div className={`text-sm font-medium truncate ${isCurrent ? 'text-blue-400' : 'text-gray-200'}`}>
                                               {track.title}
                                           </div>
                                           <div className="text-xs text-gray-500 truncate">
                                               {track.byline || (track.uploaderPub ? `${track.uploaderPub.substring(0, 8)}...` : 'Unknown')}
                                           </div>
                                       </div>
                                   </div>
                               );
                           })}
                       </div>
                   )}
               </div>
           </div>
        </div>
    );
}

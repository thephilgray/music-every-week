import React, { useState } from 'react';
import { X, Music, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CommentSection } from './CommentSection'; // Import CommentSection

interface Track {
    id: string; // Submission ID
    requestId: string;
    title: string;
    byline?: string;
    lyrics?: string;
    artworkUrl?: string;
    uploaderPub?: string;
    context?: {
        name: string;
        link: string;
    }
}

interface SongDetailsModalProps {
    currentTrack: Track;
    onClose: () => void;
}

export function SongDetailsModal({ currentTrack, onClose }: SongDetailsModalProps) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
           <div className="bg-gray-900 border border-gray-700 rounded-lg w-11/12 md:max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
               <div className="p-6 border-b border-gray-800 flex justify-between items-start">
                   <div className="flex items-center gap-4">
                       <div className="w-16 h-16 bg-gray-800 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
                           {currentTrack.artworkUrl ? (
                               <img src={currentTrack.artworkUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
                           ) : (
                               <Music className="text-gray-600 w-8 h-8" />
                           )}
                       </div>
                       <div className="flex-1">
                           <h3 className="text-xl font-bold text-white leading-tight">{currentTrack.title}</h3>
                           <p className="text-gray-400 text-sm leading-tight">
                               {currentTrack.uploaderPub ? (
                                   <Link to={`/profile/${currentTrack.uploaderPub}`} className="text-blue-400 hover:underline" onClick={onClose}>
                                       {currentTrack.byline || `by ${currentTrack.uploaderPub.substring(0, 6)}...`}
                                   </Link>
                               ) : (
                                   currentTrack.byline || 'by Unknown'
                               )}
                           </p>
                           {currentTrack.context && (
                               <Link to={currentTrack.context.link} className="text-blue-500 hover:underline text-xs flex items-center gap-1 mt-1">
                                   <span className="truncate">From: {currentTrack.context.name}</span>
                                   <ExternalLink className="w-3 h-3" />
                               </Link>
                           )}
                       </div>
                   </div>
                   <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -mr-2">
                       <X className="w-5 h-5" />
                   </button>
               </div>
               
               <div className="flex-1 overflow-y-auto custom-scrollbar">
                   <div className="p-6">
                       <h4 className="text-lg font-semibold text-white mb-2">Lyrics / Notes</h4>
                       <div className="bg-gray-950 p-4 rounded text-gray-300 whitespace-pre-wrap font-mono text-sm border border-gray-800">
                           {currentTrack.lyrics || "No notes or lyrics available for this track."}
                       </div>
                   </div>

                   {/* Comment Section Integration */}
                   {currentTrack.requestId && currentTrack.id && (
                       <div className="px-6 py-4 border-t border-gray-800">
                           <CommentSection requestId={currentTrack.requestId} submissionId={currentTrack.id} />
                       </div>
                   )}
               </div>
           </div>
        </div>
    );
}

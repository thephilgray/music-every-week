import { useState } from 'react';
import { X, Music, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthlessComments as CommentSection } from '../pages/authless/components/AuthlessComments'; // Corrected import path and alias
import { fixUrl } from '../lib/url';

// Define a basic UserProfile type for consistency
interface UserProfile {
    displayName?: string;
    avatarUrl?: string;
}

interface Track {
    id?: string; // Submission ID
    requestId: string;
    title: string;
    byline?: string;
    lyrics?: string;
    artworkUrl?: string;
    uploaderPub?: string; // This would typically be an ID in Firestore, not a GunDB pub key
    linkProfile?: boolean;
    stage?: string;
    feedbackFocus?: string[];
    context?: {
        name: string;
        link: string;
    }
}

interface SongDetailsModalProps {
    currentTrack: Track;
    onClose: () => void;
    currentUserEmail: string; // Add currentUserEmail prop
    userProfile?: UserProfile; // Optional userProfile prop
}

export function SongDetailsModal({ currentTrack, onClose, currentUserEmail, userProfile }: SongDetailsModalProps) {
    const [imgError, setImgError] = useState(false);
    const draftKey = `comment_draft_${currentTrack.requestId}_${currentTrack.id || 'request'}`;
    const hasDraft = localStorage.getItem(draftKey) !== null;


    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
           <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
               <div className="flex-1 overflow-y-auto custom-scrollbar">
                   {/* Header / Artwork Section */}
                   <div className="relative w-full aspect-video bg-gray-800 flex-shrink-0">
                       {currentTrack.artworkUrl && !imgError ? (
                           <img 
                                src={fixUrl(currentTrack.artworkUrl)} 
                                alt={currentTrack.title} 
                                className="w-full h-full object-cover" 
                                onError={() => setImgError(true)}
                           />
                       ) : (
                           <div className="w-full h-full flex items-center justify-center text-gray-600">
                               <Music className="w-16 h-16" />
                           </div>
                       )}
                       <button 
                           onClick={onClose} 
                           className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition backdrop-blur-sm"
                       >
                           <X className="w-5 h-5" />
                       </button>
                       
                       <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900 to-transparent p-6 pt-20">
                           <h3 className="text-2xl md:text-3xl font-bold text-white mb-1 shadow-black drop-shadow-md">{currentTrack.title}</h3>
                           <p className="text-gray-200 text-sm md:text-base font-medium drop-shadow-md">
                               {currentTrack.uploaderPub && currentTrack.linkProfile !== false ? (
                                   <Link to={`/profile/${currentTrack.uploaderPub}`} className="hover:text-blue-300 hover:underline" onClick={onClose}>
                                       {currentTrack.byline || `by ${currentTrack.uploaderPub.substring(0, 6)}...`}
                                   </Link>
                               ) : (
                                   currentTrack.byline || 'by Unknown'
                               )}
                           </p>
                           {currentTrack.context && (
                               <Link to={currentTrack.context.link} className="text-blue-400 hover:text-blue-300 hover:underline text-xs flex items-center gap-1 mt-2 w-fit">
                                   <span className="truncate">From: {currentTrack.context.name}</span>
                                   <ExternalLink className="w-3 h-3" />
                               </Link>
                           )}
                       </div>
                   </div>

                                      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
                                          {(currentTrack.stage || (currentTrack.feedbackFocus && currentTrack.feedbackFocus.length > 0)) && (
                                              <div className="flex flex-wrap gap-2">
                                                   {currentTrack.stage && (
                                                       <span className="px-3 py-1 rounded-full bg-blue-900/30 border border-blue-800 text-blue-300 text-xs font-medium">
                                                           Stage: {currentTrack.stage}
                                                       </span>
                                                   )}
                                                   {currentTrack.feedbackFocus?.map((focus, i) => (
                                                       <span key={i} className="px-3 py-1 rounded-full bg-gray-800 border border-gray-700 text-gray-300 text-xs">
                                                           {focus}
                                                       </span>
                                                   ))}
                                              </div>
                                          )}
                   
                                          <div>
                                              <h4 className="text-sm font-bold text-gray-500 uppercase mb-3">Lyrics / Notes</h4>
                                              <div className="bg-gray-950 p-2 md:p-4 rounded-lg text-gray-300 whitespace-pre-wrap break-words font-mono text-sm border border-gray-800">
                                                  {currentTrack.lyrics || "No notes or lyrics available for this track."}
                                              </div>
                                          </div>
                   
                                          {/* Comment Section Integration */}
                                          {currentTrack.requestId && currentTrack.id && (
                                              <div className="pt-6 border-t border-gray-800">
                                                  <h4 className="text-sm font-bold text-gray-500 uppercase mb-4 flex items-center gap-2">
                                                      Discussion
                                                      {hasDraft && (
                                                          <span className="relative flex h-3 w-3">
                                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                                          </span>
                                                      )}
                                                  </h4>
                                                  <CommentSection
                                                      key={currentTrack.id}
                                                      requestId={currentTrack.requestId}
                                                      submissionId={currentTrack.id}
                                                      currentUserEmail={currentUserEmail}
                                                      userProfile={userProfile}
                                                  />
                                              </div>
                                          )}
                                      </div>               </div>
           </div>
        </div>
    );
}

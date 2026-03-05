import { X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CommentSection } from './CommentSection';
import { ArtworkDisplay } from './ui/ArtworkDisplay';

interface Track {
    id?: string; // Submission ID
    requestId: string;
    title: string;
    byline?: string;
    lyrics?: string;
    artworkUrl?: string;
    uploaderPub?: string; // This would typically be an ID in Firestore, not a GunDB pub key
    uploaderEmail?: string; // Added for email notifications
    uploaderUid?: string; // Firebase UID
    linkProfile?: boolean;
    stage?: string;
    feedbackFocus?: string[];
    usesAI?: boolean;
    context?: {
        name: string;
        link: string;
        artworkUrl?: string;
    }
}

interface SongDetailsModalProps {
    currentTrack: Track;
    onClose: () => void;
    currentUserEmail?: string | null; // Add currentUserEmail prop
}

export function SongDetailsModal({ currentTrack, onClose, currentUserEmail }: SongDetailsModalProps) {
    const draftKey = `comment_draft_${currentTrack.requestId}_${currentTrack.id || 'request'}`;
    const hasDraft = localStorage.getItem(draftKey) !== null;


    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
           <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
               <div className="flex-1 overflow-y-auto custom-scrollbar">
                   {/* Header / Artwork Section */}
                   <div className="relative w-full aspect-video bg-gray-800 flex-shrink-0 flex items-center justify-center">
                       <ArtworkDisplay 
                            src={currentTrack.artworkUrl || currentTrack.context?.artworkUrl || '/mewlogo.png'} 
                            alt={currentTrack.title}
                            className="w-full h-full object-cover"
                            iconClassName="w-16 h-16 text-gray-600"
                       />
                       <button 
                           onClick={onClose} 
                           className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition backdrop-blur-sm"
                       >
                           <X className="w-5 h-5" />
                       </button>
                       
                       <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900 to-transparent p-6 pt-20">
                           <h3 className="text-2xl md:text-3xl font-bold text-white mb-1 shadow-black drop-shadow-md">{currentTrack.title}</h3>
                           <p className="text-gray-200 text-sm md:text-base font-medium drop-shadow-md">
                               By {currentTrack.uploaderPub && currentTrack.linkProfile !== false ? (
                                   <Link to={`/profile/${currentTrack.uploaderPub}`} className="hover:text-blue-300 hover:underline" onClick={onClose}>
                                       {currentTrack.byline || `${currentTrack.uploaderPub.substring(0, 6)}...`}
                                   </Link>
                               ) : (
                                   currentTrack.byline || 'Unknown'
                               )}
                           </p>
                           {currentTrack.context && (
                               <Link to={currentTrack.context.link} className="text-blue-400 hover:text-blue-300 hover:underline text-xs flex items-center gap-1 mt-2 w-fit" onClick={onClose}>
                                   <span className="truncate">From: {currentTrack.context.name}</span>
                                   <ExternalLink className="w-3 h-3" />
                               </Link>
                           )}
                       </div>
                   </div>

                                      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
                                          {(currentTrack.stage || currentTrack.usesAI || (currentTrack.feedbackFocus && currentTrack.feedbackFocus.length > 0)) && (
                                              <div className="flex flex-wrap gap-2">
                                                   {currentTrack.usesAI && (
                                                       <span className="px-3 py-1 rounded-full bg-purple-900/30 border border-purple-800 text-purple-300 text-xs font-bold">
                                                           Uses AI
                                                       </span>
                                                   )}
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
                                                      submissionId={currentTrack.id!}
                                                      submissionOwnerUid={currentTrack.uploaderUid || currentTrack.uploaderPub}
                                                      submissionOwnerEmail={currentTrack.uploaderEmail}
                                                      currentUserEmail={currentUserEmail}
                                                      usesAI={currentTrack.usesAI}
                                                  />
                                              </div>
                                          )}
                                      </div>               </div>
           </div>
        </div>
    );
}

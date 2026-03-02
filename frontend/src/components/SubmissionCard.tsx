import { useState } from 'react';
import { Play, Pause, Lock, FileText, MessageSquare, ListPlus, FileAudio, Heart, CheckCircle2 } from 'lucide-react';
import { ArtworkDisplay } from './ui/ArtworkDisplay';
import { Waveform } from './ui/Waveform';
import { CollaboratorList } from './ui/CollaboratorList';
import { CommentSection } from './CommentSection';
import { AddToPlaylist } from './AddToPlaylist';
import type { Submission } from '../types';

interface SubmissionCardProps {
    submission: Submission;
    isLocked: boolean;
    isPlaying: boolean;
    isCurrent: boolean;
    onPlay: () => void;
    onPause: () => void;
    commentCount?: number;
    isExpanded: boolean;
    onToggleExpand: () => void;
    currentUserEmail?: string | null;
    requestId?: string;
    isMySubmission?: boolean;
    highlightCommentId?: string;
    index?: number;
    isListened?: boolean;
}

export function SubmissionCard({ 
    submission, 
    isLocked, 
    isPlaying, 
    isCurrent, 
    onPlay, 
    onPause, 
    commentCount = 0,
    isExpanded,
    onToggleExpand,
    currentUserEmail,
    requestId,
    isMySubmission = false,
    highlightCommentId,
    index,
    isListened = false
}: SubmissionCardProps) {
    const [showLyrics, setShowLyrics] = useState(false);
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);

    const handlePlayClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (locked) return;
        if (isCurrent && isPlaying) {
            onPause();
        } else {
            onPlay();
        }
    };

    const locked = isLocked;

    return (
        <div 
            id={`submission-${submission.id}`} 
            className={`bg-gray-900 border ${locked ? 'border-gray-800/50 opacity-75' : 'border-gray-800'} rounded-lg p-4 transition group ${!locked ? 'cursor-pointer hover:border-gray-700' : ''} relative overflow-hidden`}
            onClick={(e) => {
                if (locked) return;
                // Don't toggle if clicking buttons
                if ((e.target as HTMLElement).closest('button')) return;
                onToggleExpand();
            }}
        >
            {/* Watermark Track Number */}
            {typeof index === 'number' && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-800 text-9xl font-black opacity-5 select-none pointer-events-none z-0">
                    {index + 1}.
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center gap-4 relative z-10">
                {/* Artwork and Info Group */}
                <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
                    <div className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center flex-shrink-0 relative">
                        <ArtworkDisplay 
                            src={!locked ? submission.artworkUrl : null}
                            alt="Art"
                            className="w-full h-full object-cover rounded"
                            FallbackIcon={FileAudio}
                        />
                        {locked && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded">
                                <Lock className="w-4 h-4 text-gray-400" />
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <h4 className={`text-white font-medium truncate flex items-center gap-2 ${locked ? 'blur-sm select-none' : ''}`}>
                            {locked ? 'Hidden Track' : submission.title}
                            {isListened && !locked && <span title="Listened"><CheckCircle2 className="w-4 h-4 text-green-500/70" /></span>}
                        </h4>
                        <div className="flex items-center gap-2">
                            <CollaboratorList 
                                uploaderPub={submission.uploaderUid || submission.originalUploaderPub} 
                                uploaderEmail={submission.uploaderEmail} 
                                byline={submission.byline} 
                                collaborators={submission.collaborators} 
                                linkProfile={submission.linkProfile}
                                proxyFor={submission.proxyFor}
                                className="text-sm text-gray-400 truncate"
                            />
                            {isMySubmission && <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-800">You</span>}
                        </div>

                         {/* Tags Section - Restored from Gun App */}
                        {!locked && (submission.fragile || submission.usesAI || (submission.feedbackFocus && submission.feedbackFocus.length > 0)) && (
                            <div className="flex flex-wrap gap-2 mt-1.5">
                                {submission.usesAI && (
                                    <span className="bg-purple-900/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-purple-800/30 flex items-center gap-1">
                                        AI
                                    </span>
                                )}
                                {submission.fragile && (
                                    <span className="bg-pink-900/20 text-pink-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-pink-800/30 flex items-center gap-1">
                                        <Heart className="w-3 h-3 fill-current animate-pulse" /> Fragile
                                    </span>
                                )}
                                {submission.feedbackFocus?.map((focus, i) => (
                                    <span key={i} className="bg-blue-900/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium border border-blue-800/30">
                                        {focus}
                                    </span>
                                ))}
                            </div>
                        )}

                        {submission.waveform && submission.waveform.length > 0 && !locked && (
                            <div className="mt-2 w-full max-w-md opacity-70 hover:opacity-100 transition hidden md:block">
                                <Waveform data={Array.isArray(submission.waveform) ? submission.waveform : []} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Buttons Row */}
                <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-gray-800 md:border-none">
                    <div className="flex items-center gap-2">
                        
                        {submission.lyrics && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShowLyrics(!showLyrics); }}
                                disabled={locked}
                                className={`p-2 rounded-full transition ${showLyrics ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white'} ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title="Lyrics / Notes"
                            >
                                <FileText className="w-4 h-4" />
                            </button>
                        )}

                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleExpand();
                            }}
                            className={`relative p-2 rounded-full transition ${isExpanded ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white'} ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="View Comments"
                            disabled={locked}
                        >
                            <MessageSquare className="w-4 h-4" />
                            {commentCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                                    {commentCount}
                                </span>
                            )}
                        </button>
                        
                        <button                                      
                            onClick={(e) => { e.stopPropagation(); setShowPlaylistModal(true); }}
                            disabled={locked}
                            className={`p-2 rounded-full transition text-gray-400 hover:text-white ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Add to Playlist"
                        >
                            <ListPlus className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <button 
                        onClick={handlePlayClick}
                        disabled={locked}
                        className={`w-10 h-10 md:w-8 md:h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition ml-2 ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {locked ? (
                            <Lock className="w-3 h-3 text-gray-500" />
                        ) : isCurrent && isPlaying ? (
                            <Pause className="w-4 h-4" />
                        ) : (
                            <Play className="w-4 h-4 ml-0.5" />
                        )}
                    </button>
                </div>
            </div>
            
            {/* Mobile Waveform */}
            {submission.waveform && submission.waveform.length > 0 && !locked && (
                <div className="mt-2 w-full opacity-70 block md:hidden">
                    <Waveform data={Array.isArray(submission.waveform) ? submission.waveform : []} />
                </div>
            )}
            
            {(showLyrics && !locked) && (
                <div className="mt-4 px-2 md:px-4 pb-2">
                    <h5 className="text-xs font-bold text-gray-500 uppercase mb-2">Lyrics / Notes</h5>
                    <div className="bg-gray-950 p-2 md:p-3 rounded border border-gray-800 text-sm text-gray-300 whitespace-pre-wrap break-words font-mono">
                        {submission.lyrics}
                    </div>
                </div>
            )}
            
            {isExpanded && requestId && submission.id && !locked && (
                <div className="mt-4 cursor-default" onClick={(e) => e.stopPropagation()}>
                    <CommentSection 
                        requestId={requestId} 
                        submissionId={submission.id} 
                        submissionOwnerUid={submission.uploaderUid || submission.originalUploaderPub}
                        submissionOwnerEmail={submission.uploaderEmail}
                        highlightCommentId={highlightCommentId}
                        currentUserEmail={currentUserEmail}
                    />
                </div>
            )}

            {showPlaylistModal && (
                <AddToPlaylist 
                    submission={submission} 
                    onClose={() => setShowPlaylistModal(false)} 
                />
            )}
        </div>
    );
}

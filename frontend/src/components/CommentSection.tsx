import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, Square, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { uploadFile } from '../lib/upload';
import { CommentItemUI } from './ui/CommentItemUI';
import { MiniPlayer } from './ui/MiniPlayer';
import { ConfirmModal } from './ui/ConfirmModal';
import { fixUrl } from '../lib/url';
import type { Comment, Notification, UserProfile } from '../types';

interface CommentSectionProps {
  requestId: string;
  submissionId: string;
  highlightCommentId?: string;
  accessMode?: string;
  requestTitle?: string;
  onCommentsLoaded?: (submissionId: string, count: number) => void; // Updated prop signature
}

export function CommentSection({ requestId, submissionId, highlightCommentId, accessMode, requestTitle, onCommentsLoaded }: CommentSectionProps) {
  const { participantEmail, user, isAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`draft_comment_${submissionId}`) || '';
    }
    return '';
  });
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive current user's profile for comments
  const currentUserProfile = user ? {
    displayName: user.displayName || user.email || 'Admin',
    avatarUrl: user.photoURL || undefined
  } : (participantEmail ? {
    displayName: participantEmail.split('@')[0], // Default name from email
    avatarUrl: undefined
  } : undefined);

  const isAuthorized = !!participantEmail || !!user;

  // Debounced Draft Saving
  useEffect(() => {
    // Don't save empty string on initial mount if storage is already empty
    // But do save if user cleared it.
    const handler = setTimeout(() => {
        if (typeof window !== 'undefined') {
            if (newComment) {
                localStorage.setItem(`draft_comment_${submissionId}`, newComment);
                window.dispatchEvent(new CustomEvent('comment-draft-update', { detail: { submissionId, hasDraft: true } }));
            } else {
                // Only remove if it was previously set, to avoid noise? 
                // Actually safe to just remove if empty.
                const preExists = localStorage.getItem(`draft_comment_${submissionId}`);
                if (preExists) {
                    localStorage.removeItem(`draft_comment_${submissionId}`);
                    window.dispatchEvent(new CustomEvent('comment-draft-update', { detail: { submissionId, hasDraft: false } }));
                }
            }
        }
    }, 500); // 500ms debounce

    return () => clearTimeout(handler);
  }, [newComment, submissionId]);

  useEffect(() => {
    // Clear previous comments
    setComments([]);

    const commentsCollectionRef = collection(db, 'comments');
    const queryConstraints = [
      where('requestId', '==', requestId),
      orderBy('createdAt', 'asc')
    ];

    if (submissionId) { // Only add submissionId filter if it exists
      queryConstraints.push(where('submissionId', '==', submissionId));
    }
    
    const q = query(commentsCollectionRef, ...queryConstraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedComments = snapshot.docs.map(doc => {
        const data = doc.data();
        let createdAtTimestamp: number;
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            // It's a Firestore Timestamp object
            createdAtTimestamp = data.createdAt.toDate().getTime();
        } else if (typeof data.createdAt === 'number') {
            // It's already a number timestamp
            createdAtTimestamp = data.createdAt;
        } else {
            // Fallback to current time if format is unexpected
            console.warn("Unexpected createdAt format for comment:", doc.id, data.createdAt);
            createdAtTimestamp = Date.now();
        }

        return {
          id: doc.id,
          ...data, // Spread original data first
          createdAt: createdAtTimestamp, // Then override with the correctly formatted timestamp
        } as Comment;
      });

      setComments(loadedComments);
      onCommentsLoaded?.(submissionId, loadedComments.length); // Call the new prop with submissionId
    }, (err) => {
        console.error("Firestore comments subscription error:", err);
        onCommentsLoaded?.(submissionId, 0); // Pass 0 on error
    });

    return () => {
      unsubscribe();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [requestId, submissionId, onCommentsLoaded]);

  // Scroll to highlighted comment
  useEffect(() => {
      if (highlightCommentId && comments.length > 0) {
          // Delay slightly to ensure rendering
          const timer = setTimeout(() => {
              const el = document.getElementById(`comment-${highlightCommentId}`);
              if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('bg-blue-900/30', 'ring-1', 'ring-blue-500/50');
                  setTimeout(() => el.classList.remove('bg-blue-900/30', 'ring-1', 'ring-blue-500/50'), 3000);
              }
          }, 300);
          return () => clearTimeout(timer);
      }
  }, [comments, highlightCommentId]);

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'audio/webm'; // Fallback
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioFile = new File([audioBlob], `voice-comment.${mimeType.split('/')[1].split(';')[0]}`, { type: mimeType });
        setRecordedFile(audioFile);
        const url = URL.createObjectURL(audioBlob);
        setPreviewUrl(url);
        
        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please ensure you have granted permission.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
    }
  };

  const cancelRecording = () => {
      setRecordedFile(null);
      setPreviewUrl(null);
      setIsRecording(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setNewComment(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && !recordedFile) return;

    // Check if user is authenticated via participantEmail or Firebase user
    const authorEmail = participantEmail || user?.email;
    if (!authorEmail) {
        alert('You must be logged in to post a comment.');
        return;
    }

    setIsUploading(true);

    try {
        let audioUrl = '';
        if (recordedFile) {
            const result = await uploadFile(recordedFile); // uploadFile no longer needs userPair explicitly
            audioUrl = result.url;
        }

        const commentData: any = {
            requestId,
            submissionId: submissionId || null, // Ensure submissionId is stored, or null if not present
            authorEmail,
            text: newComment.trim(),
            createdAt: serverTimestamp(),
            userProfile: currentUserProfile, // Use the derived current user profile
        };
        
        if (audioUrl) {
            commentData.audioUrl = audioUrl;
        }

        await addDoc(collection(db, 'comments'), commentData);
        
        setNewComment('');
        localStorage.removeItem(`draft_comment_${submissionId}`);
        window.dispatchEvent(new CustomEvent('comment-draft-update', { detail: { submissionId, hasDraft: false } }));
        cancelRecording();

    } catch (err) {
        console.error('Error posting comment:', err);
        alert('Failed to post comment. Please try again.');
    } finally {
        setIsUploading(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
      setDeleteCandidateId(commentId);
  };

  const confirmDelete = async () => {
      if (!deleteCandidateId) return;
      const commentId = deleteCandidateId;
      setDeleteCandidateId(null);

      try {
          await deleteDoc(doc(db, 'comments', commentId));
      } catch (e) {
          console.error("Delete failed", e);
          alert("Failed to delete comment. Please try again.");
      }
  };

  const handleEditComment = async (commentId: string, newText: string) => {
      try {
          await updateDoc(doc(db, 'comments', commentId), { text: newText });
      } catch (e) {
          console.error(`Error updating comment ${commentId} in Firestore:`, e);
          alert("Failed to edit comment. Please try again.");
      }
  };

  return (
    <div className="mt-4 md:bg-gray-950/50 md:rounded md:p-4 md:border md:border-gray-800">
       <h5 className="text-sm font-semibold text-gray-400 mb-3">Comments</h5>
       
       <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
          {comments.map(c => (
             <div key={c.id} id={`comment-${c.id}`} className="rounded transition-all duration-1000">
                <CommentItemUI 
                    id={c.id}
                    text={c.text}
                    authorEmail={c.authorEmail}
                    authorName={c.userProfile?.displayName || c.authorEmail.split('@')[0]}
                    authorAvatarUrl={c.userProfile?.avatarUrl}
                    createdAt={c.createdAt}
                    audioUrl={c.audioUrl}
                    isOwnComment={c.authorEmail === (participantEmail || user?.email)}
                    onDelete={c.authorEmail === (participantEmail || user?.email) ? handleDeleteComment : undefined}
                    onEdit={c.authorEmail === (participantEmail || user?.email) ? handleEditComment : undefined}
                />
             </div>
          ))}
          {comments.length === 0 && <p className="text-xs text-gray-600 italic">No comments yet.</p>}
       </div>

       <form onSubmit={handleSubmit} className="flex flex-col gap-2 relative">
           {/* Recording UI */}
           {(isRecording || recordedFile) && (
               <div className="flex items-center gap-2 bg-gray-900 p-2 rounded border border-gray-700">
                   {isRecording ? (
                       <div className="flex items-center gap-2 text-red-400 animate-pulse">
                           <div className="w-2 h-2 bg-red-500 rounded-full" />
                           <span className="text-xs font-bold">Recording...</span>
                       </div>
                   ) : (
                       <div className="flex items-center gap-2 w-full">
                           <div className="flex-1">
                                <MiniPlayer src={previewUrl!} />
                           </div>
                           <button 
                             type="button" 
                             onClick={cancelRecording}
                             className="text-gray-400 hover:text-red-400 p-2"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                       </div>
                   )}
               </div>
           )}

           <div className="flex gap-1 md:gap-2">
               {isAuthorized ? (
               <>
               <input 
                  ref={inputRef}
                  type="text" 
                  value={newComment}
                  onChange={handleInputChange}
                  placeholder="Write a comment..."
                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-base md:text-sm text-white focus:border-blue-500 outline-none"
                  disabled={isRecording || isUploading}
               />
               
               {!isRecording && !recordedFile && (
                   <button 
                     type="button"
                     onClick={startRecording}
                     className="bg-gray-800 text-gray-300 p-1.5 rounded hover:bg-gray-700 hover:text-white border border-gray-700"
                     title="Record Audio"
                     disabled={isUploading}
                   >
                     <Mic className="w-4 h-4" />
                   </button>
               )}

               {isRecording && (
                   <button 
                     type="button"
                     onClick={stopRecording}
                     className="bg-red-900/50 text-red-200 p-1.5 rounded hover:bg-red-900 border border-red-700"
                     title="Stop Recording"
                   >
                     <Square className="w-4 h-4 fill-current" />
                   </button>
               )}

               <button 
                  type="submit"
                  disabled={(!newComment.trim() && !recordedFile) || isRecording || isUploading}
                  className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
               </button>
               </>
               ) : (
                   <div className="text-gray-500 text-sm italic w-full text-center p-2 bg-gray-900 rounded">
                       You must join this request to comment.
                   </div>
               )}
           </div>
       </form>

       <ConfirmModal
           isOpen={!!deleteCandidateId}
           title="Delete Comment?"
           message="Are you sure you want to delete this comment? This cannot be undone."
           confirmLabel="Delete"
           isDestructive
           onConfirm={confirmDelete}
           onCancel={() => setDeleteCandidateId(null)}
       />
    </div>
  );
}

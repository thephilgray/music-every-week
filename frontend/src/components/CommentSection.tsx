import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, Square, Loader2, Trash2, User } from 'lucide-react'; // Added Trash2 import
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, updateDoc, getDocs, limit } from 'firebase/firestore'; // Removed getDoc
import { uploadToR2 } from '../lib/r2'; // Replaced uploadFile
import { CommentItemUI } from './ui/CommentItemUI';
import { MiniPlayer } from './ui/MiniPlayer';
import { ConfirmModal } from './ui/ConfirmModal';
// import { fixUrl } from '../lib/url'; // Removed unused import
import type { Comment, UserProfile, Notification } from '../types';
import { getTimestampAsNumber } from '../lib/utils'; // Removed unused Notification, UserProfile

interface CommentSectionProps {
  requestId: string;
  submissionId: string;
  highlightCommentId?: string;
  submissionOwnerUid?: string; 
  submissionOwnerEmail?: string; // Added prop
  currentUserEmail?: string | null; // Added prop for authless/manual auth
  // onCommentsLoaded?: (submissionId: string, count: number) => void; // Removed prop
}

export function CommentSection({ requestId, submissionId, highlightCommentId, submissionOwnerUid, submissionOwnerEmail, currentUserEmail }: CommentSectionProps) { // Removed prop
  const { participantEmail, user, addPoints } = useAuth(); // Removed unused isAdmin
  const [comments, setComments] = useState<Comment[]>([]);
  const [firestoreProfile, setFirestoreProfile] = useState<any>(null); // Store fetched profile

  useEffect(() => {
      if (user?.uid) {
          const unsub = onSnapshot(doc(db, 'profiles', user.uid), (snap) => {
              if (snap.exists()) {
                  setFirestoreProfile(snap.data());
              }
          });
          return () => unsub();
      } else if (participantEmail || currentUserEmail) {
          // Fetch profile by email for participants
          const email = participantEmail || currentUserEmail;
          if (!email) return;
          const q = query(collection(db, 'profiles'), where('email', '==', email));
          const unsub = onSnapshot(q, (snapshot) => {
              if (!snapshot.empty) {
                  setFirestoreProfile(snapshot.docs[0].data());
              } else {
                  setFirestoreProfile(null);
              }
          });
          return () => unsub();
      }
  }, [user, participantEmail, currentUserEmail]);

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
  
  // Mention State
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<UserProfile[]>([]);
  const [showMentionList, setShowMentionList] = useState(false);
  const [cursorIndex, setCursorIndex] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const commentsContainerRef = useRef<HTMLDivElement>(null); // Ref for container scrolling

  // Derive current user's profile for comments (Prefer Firestore > Auth > Email)
  const effectiveEmail = participantEmail || currentUserEmail;
  const currentUserProfile = user ? {
    displayName: firestoreProfile?.displayName || firestoreProfile?.alias || user.displayName || user.email || 'Admin',
    avatarUrl: firestoreProfile?.avatarUrl || user.photoURL || null // Use null for Firestore compatibility
  } : (effectiveEmail ? {
    displayName: firestoreProfile?.displayName || firestoreProfile?.alias || effectiveEmail.split('@')[0], // Use profile data if available
    avatarUrl: firestoreProfile?.avatarUrl || null // Use profile data if available
  } : null);

  const isAuthorized = !!effectiveEmail || !!user;

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
        return {
          id: doc.id,
          ...data, // Spread original data first
          createdAt: getTimestampAsNumber(data.createdAt), // Then override with the correctly formatted timestamp
        } as Comment;
      });

      setComments(loadedComments);
      // onCommentsLoaded?.(submissionId, loadedComments.length); // Removed call
    }, (err) => {
        console.error("Firestore comments subscription error:", err);
        // onCommentsLoaded?.(submissionId, 0); // Removed call
    });

    return () => {
      unsubscribe();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [requestId, submissionId, previewUrl]); // Removed onCommentsLoaded from dependencies

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

  // Auto-scroll to bottom when new comments appear
  useEffect(() => {
    if (commentsContainerRef.current) {
        const { scrollHeight, clientHeight } = commentsContainerRef.current;
        commentsContainerRef.current.scrollTo({
            top: scrollHeight - clientHeight,
            behavior: 'smooth'
        });
    }
  }, [comments]); // Scroll when comments change

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
    ];
    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
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

  // Fetch mention suggestions
  useEffect(() => {
      if (!showMentionList) {
          setMentionResults([]);
          return;
      }

      const fetchMentions = async () => {
          if (!mentionQuery) {
              const q = query(collection(db, 'profiles'), limit(5));
              const snap = await getDocs(q);
              setMentionResults(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
              return;
          }

          const q = query(
              collection(db, 'profiles'), 
              where('alias', '>=', mentionQuery),
              where('alias', '<=', mentionQuery + '\uf8ff'),
              limit(5)
          );
          const snap = await getDocs(q);
          setMentionResults(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      };

      const timer = setTimeout(() => {
          fetchMentions();
      }, 300);

      return () => clearTimeout(timer);
  }, [mentionQuery, showMentionList]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setNewComment(val);

      const cursorPosition = e.target.selectionStart || 0;
      setCursorIndex(cursorPosition);
      
      const textBeforeCursor = val.slice(0, cursorPosition);
      const match = textBeforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);
      
      if (match) {
          setMentionQuery(match[1]);
          setShowMentionList(true);
      } else {
          setShowMentionList(false);
      }
  };

  const selectMention = (alias: string) => {
      if (!alias) return;
      
      const textBeforeCursor = newComment.slice(0, cursorIndex);
      const textAfterCursor = newComment.slice(cursorIndex);
      
      const match = textBeforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);
      if (match) {
          const startIdx = textBeforeCursor.lastIndexOf('@');
          const newTextBefore = newComment.slice(0, startIdx) + `@${alias} `;
          setNewComment(newTextBefore + textAfterCursor);
          
          setTimeout(() => {
              if (inputRef.current) {
                  inputRef.current.focus();
                  const newCursorPos = newTextBefore.length;
                  inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
              }
          }, 0);
      }
      
      setShowMentionList(false);
      setMentionQuery('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && !recordedFile) return;

    // Check if user is authenticated via participantEmail or Firebase user
    const authorEmail = participantEmail || user?.email || currentUserEmail;
    if (!authorEmail) {
        alert('You must be logged in to post a comment.');
        return;
    }

    setIsUploading(true);

    try {
        let audioUrl = '';
        if (recordedFile) {
            // Upload to R2 (Firebase-compatible file storage)
            const result = await uploadToR2(recordedFile); // Corrected to uploadToR2
            audioUrl = result.url;
        }

        const commentData: any = {
            requestId,
            submissionId: submissionId || null, // Ensure submissionId is stored, or null if not present
            authorEmail,
            authorUid: user?.uid || null, // Save UID if available
            text: newComment.trim(),
            createdAt: serverTimestamp(),
            userProfile: currentUserProfile, // Use the derived current user profile
        };
        
        if (audioUrl) {
            commentData.audioUrl = audioUrl;
        }

        const docRef = await addDoc(collection(db, 'comments'), commentData);
        
        // Award points for leaving a comment
        if (addPoints) {
            addPoints(3);
        }
        
        // Notify Submission Owner (if not self)
        const isSelf = (user?.uid && user.uid === submissionOwnerUid) || 
                       (participantEmail && participantEmail === submissionOwnerEmail) ||
                       (user?.email && user.email === submissionOwnerEmail);

        if (!isSelf && (submissionOwnerUid || submissionOwnerEmail)) {
             try {
                console.log("CommentSection: currentUserProfile.displayName for notification:", currentUserProfile?.displayName);
                const notif: Notification = {
                    // ID auto-generated by Firestore
                    type: 'comment',
                    message: `${currentUserProfile?.displayName || 'Someone'} commented on your track`,
                    link: `/request/${requestId}?submission=${submissionId}&comment=${docRef.id}`,
                    fromUid: user?.uid || 'participant',
                    fromName: currentUserProfile?.displayName || 'Someone', // Save name
                    fromEmail: authorEmail, // Save email
                    createdAt: Date.now(),
                    read: false,
                    requestId
                };
                
                const notifData: any = { ...notif };
                if (submissionOwnerUid) notifData.recipientUid = submissionOwnerUid;
                if (submissionOwnerEmail) notifData.recipientEmail = submissionOwnerEmail; // Add email recipient

                await addDoc(collection(db, 'notifications'), notifData);
             } catch (e) {
                 console.error("Failed to notify submission owner", e);
             }
        }

        // Handle Mentions Notifications
        const mentions = newComment.match(/@([a-zA-Z0-9_.-]+)/g);
        if (mentions) {
            const uniqueAliases = [...new Set(mentions.map(m => m.slice(1)))];
            // Resolve aliases to UIDs
            // We do this server-side usually, but for now client-side.
            // Be careful of iterating too many.
            uniqueAliases.forEach(async (alias) => {
                try {
                    const q = query(collection(db, 'profiles'), where('alias', '==', alias));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        const recipient = snapshot.docs[0];
                        const recipientUid = recipient.id;
                        const recipientData = recipient.data();
                        
                        // if (recipientUid === user?.uid) return; // Allow notifying self for testing

                        const notif: Notification = {
                            id: '', // Will be ignored by addDoc but satisfies type
                            type: 'mention',
                            message: `${currentUserProfile?.displayName || 'Someone'} mentioned you in a comment`,
                            link: `/request/${requestId}?submission=${submissionId}&comment=${docRef.id}`,
                            fromUid: user?.uid || 'participant',
                            fromName: currentUserProfile?.displayName || 'Someone',
                            fromEmail: authorEmail,
                            createdAt: Date.now(),
                            read: false,
                            requestId
                        };
                        
                        const notifData: any = {
                            ...notif,
                            recipientUid
                        };
                        delete notifData.id; // Remove empty id before saving

                        if (recipientData.email) {
                            notifData.recipientEmail = recipientData.email;
                        }

                        await addDoc(collection(db, 'notifications'), notifData);
                    }
                } catch (err) {
                    console.error("Failed to notify mention:", alias, err);
                }
            });
        }
        
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

  const handleReact = async (commentId: string, reaction: 'heart' | '+1') => {
      if (!user?.uid && !participantEmail) {
          alert("You must be logged in to react.");
          return;
      }
      
      const currentUserId = user?.uid || participantEmail;
      if (!currentUserId) return;

      try {
          const comment = comments.find(c => c.id === commentId);
          if (!comment) return;

          const currentReactions = comment.reactions || {};
          const existingReaction = currentReactions[currentUserId];
          
          let newReactions = { ...currentReactions };
          
          if (existingReaction === reaction) {
              // Toggle off
              delete newReactions[currentUserId];
          } else {
              // Set or change reaction
              newReactions[currentUserId] = reaction;
          }
          
          await updateDoc(doc(db, 'comments', commentId), { reactions: newReactions });
      } catch (e) {
          console.error("Failed to react to comment:", e);
      }
  };

  return (
    <div className="mt-4 md:bg-gray-950/50 md:rounded md:p-4 md:border md:border-gray-800">
       <h5 className="text-sm font-semibold text-gray-400 mb-3">Comments</h5>
       
       <div ref={commentsContainerRef} className="space-y-3 mb-4 max-h-60 overflow-y-auto">
          {comments.map(c => (
             <div key={c.id} id={`comment-${c.id}`} className="rounded transition-all duration-1000">
                <CommentItemUI 
                    id={c.id}
                    text={c.text}
                    authorEmail={c.authorEmail}
                    authorName={c.userProfile?.displayName || c.authorEmail.split('@')[0]}
                    authorAvatarUrl={c.userProfile?.avatarUrl}
                    createdAt={c.createdAt as number} // createdAt is already number here
                    audioUrl={c.audioUrl}
                    isOwnComment={c.authorEmail === (participantEmail || user?.email)}
                    onDelete={c.authorEmail === (participantEmail || user?.email) ? handleDeleteComment : undefined}
                    onEdit={c.authorEmail === (participantEmail || user?.email) ? handleEditComment : undefined}
                    profileLinkPub={c.authorUid} // Added prop
                    reactions={c.reactions}
                    onReact={handleReact}
                    currentUserId={user?.uid || participantEmail || undefined}
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

           <div className="flex gap-1 md:gap-2 relative">
               {showMentionList && mentionResults.length > 0 && (
                   <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                       <div className="p-2 text-xs text-gray-500 uppercase font-semibold border-b border-gray-700">Suggested Users</div>
                       {mentionResults.map(u => (
                           <button
                               key={u.uid}
                               type="button"
                               onClick={() => selectMention(u.alias)}
                               className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                           >
                               <div className="w-5 h-5 rounded-full bg-gray-600 overflow-hidden flex-shrink-0">
                                   {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full object-cover" /> : <User className="w-3 h-3 text-gray-400 m-auto" />}
                               </div>
                               <span className="font-bold truncate">{u.alias}</span>
                               {u.displayName && u.displayName !== u.alias && <span className="text-gray-500 truncate text-xs">({u.displayName})</span>}
                           </button>
                       ))}
                   </div>
               )}

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
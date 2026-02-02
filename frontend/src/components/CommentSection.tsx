import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, Square, Trash2, Loader2, User } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { APP_SCOPE } from '../config/appConfig';
import { uploadFile } from '../lib/upload';
import { CommentItem } from './CommentItem';
import { MiniPlayer } from './ui/MiniPlayer';
import { ConfirmModal } from './ui/ConfirmModal';
import type { Comment, Notification, UserProfile } from '../types';

interface CommentSectionProps {
  requestId: string;
  submissionId: string;
  highlightCommentId?: string;
  accessMode?: string;
  requestTitle?: string;
}

export function CommentSection({ requestId, submissionId, highlightCommentId, accessMode, requestTitle }: CommentSectionProps) {
  const { gun, pubKey, user, userProfile, isAuthorized } = useGun();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Mentions State
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<UserProfile[]>([]);
  const [mentionedUsers, setMentionedUsers] = useState<Record<string, string>>({}); // Alias -> Pub
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Clear previous
    setComments([]);

    // Subscribe
    const commentsMap = new Map<string, Comment>();

    // Use Public Comments Node
    gun.get('submission_comments')
       .get(submissionId)
       .map()
       .on((data: any, key: string) => {
          // Handle Deletion (data is null)
          if (data === null) {
              commentsMap.delete(key);
              setComments(Array.from(commentsMap.values()).sort((a, b) => a.createdAt - b.createdAt));
              return;
          }

          // If data is a reference (pointer), resolve it
          if (data && !data.text && !data.audioUrl) {
              gun.get(key).once((resolvedData: any) => {
                  if (resolvedData && (resolvedData.text || resolvedData.audioUrl)) {
                      const comment: Comment = { ...resolvedData, id: key };
                      commentsMap.set(key, comment);
                      setComments(Array.from(commentsMap.values()).sort((a, b) => a.createdAt - b.createdAt));
                  } else if (resolvedData === null) {
                      // Handle resolved node being deleted
                      commentsMap.delete(key);
                      setComments(Array.from(commentsMap.values()).sort((a, b) => a.createdAt - b.createdAt));
                  }
              });
          } else if (data && (data.text || data.audioUrl)) {
             const comment: Comment = { ...data, id: key };
             commentsMap.set(key, comment);
             setComments(Array.from(commentsMap.values()).sort((a, b) => a.createdAt - b.createdAt));
          }
       });
       
    return () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [requestId, submissionId, gun]);

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

      // Simple Mention Detection: Check if current word starts with @
      const cursor = e.target.selectionStart || 0;
      const textUpToCursor = val.substring(0, cursor);
      const words = textUpToCursor.split(/\s+/);
      const lastWord = words[words.length - 1];

      if (lastWord.startsWith('@') && lastWord.length > 1) {
          const query = lastWord.substring(1);
          setMentionQuery(query);
          
          // Search Users
          // Using a temporary map to dedup results from Gun stream
          const resultsMap = new Map<string, UserProfile>();
          gun.get('all_users').map().once((u: any, pub: string) => {
              if (u && u.alias && u.alias.toLowerCase().includes(query.toLowerCase())) {
                   if (!resultsMap.has(pub)) {
                       resultsMap.set(pub, { ...u, pub });
                       // Limit results to 5
                       if (resultsMap.size <= 5) {
                           setMentionResults(Array.from(resultsMap.values()));
                       }
                   }
              }
          });
      } else {
          setMentionQuery(null);
          setMentionResults([]);
      }
  };

  const selectMention = (user: UserProfile) => {
      if (!mentionQuery) return;
      
      const val = newComment;
      const cursor = inputRef.current?.selectionStart || val.length;
      const textUpToCursor = val.substring(0, cursor);
      const textAfterCursor = val.substring(cursor);
      
      // Replace the last word (the query) with the mention
      const words = textUpToCursor.split(/\s+/);
      words.pop(); // remove query
      const newVal = [...words, `@${user.alias} `].join(' ') + textAfterCursor;
      
      setNewComment(newVal);
      setMentionedUsers(prev => ({ ...prev, [user.alias]: user.pub }));
      
      setMentionQuery(null);
      setMentionResults([]);
      inputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && !recordedFile) return;

    setIsUploading(true);

    try {
        let audioUrl = '';
        if (recordedFile) {
            const result = await uploadFile(recordedFile, (user as any).is);
            audioUrl = result.url;
        }

        const id = crypto.randomUUID();
        // Construct object without undefined fields
        const comment: any = {
            id,
            text: newComment,
            authorPub: pubKey as string,
            createdAt: Date.now()
        };
        
        if (audioUrl) {
            comment.audioUrl = audioUrl;
        }

        const userCommentNode = user.get(APP_SCOPE).get('comments').get(id);
        userCommentNode.put(comment);

        // Write to Public Comments Node
        gun.get('submission_comments')
        .get(submissionId)
        .get(id)
        .put(userCommentNode);

        // Write to Global Feed if Public
        if (accessMode === 'direct') {
            const pulseId = crypto.randomUUID();
            const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const bucketKey = `global_pulse_${dateStr}`;

            // Fetch submission title for context
            gun.get('request_submissions').get(requestId).get(submissionId).once((subData: any) => {
                const feedItem = {
                    id: pulseId,
                    type: 'comment',
                    text: newComment,
                    authorPub: pubKey as string,
                    submissionId,
                    requestId,
                    submissionTitle: subData?.title || 'Unknown Track',
                    requestTitle: requestTitle || 'Unknown Request',
                    createdAt: Date.now()
                };
                gun.get(bucketKey).get(pulseId).put(feedItem);
                
                // Store pulseId & bucket ref in comment for future updates/deletes
                user.get(APP_SCOPE).get('comments').get(id).get('globalPulseId').put(pulseId);
                user.get(APP_SCOPE).get('comments').get(id).get('globalBucket').put(bucketKey);
            });
        }

        // Notify Submission Uploader
        gun.get('request_submissions')
        .get(requestId)
        .get(submissionId)
        .once((subData: any) => {
            const processNotification = (sub: any) => {
                 // Notify Uploader if not self
                 if (sub && sub.uploaderPub && sub.uploaderPub !== pubKey) {
                    const notifId = crypto.randomUUID();
                    const notification: Notification = {
                        id: notifId,
                        type: 'comment',
                        message: `New comment on your track "${sub.title}"`,
                        link: `/request/${requestId}?submission=${submissionId}&comment=${id}`,
                        fromPub: pubKey as string,
                        createdAt: Date.now(),
                        read: false
                    };
                    gun.get('inboxes').get(sub.uploaderPub).get(notifId).put(notification);
                 }
            };
            processNotification(subData);
        });

        // Notify Mentioned Users
        const processedPubs = new Set<string>();
        // Scan for @Alias in the final text
        const words = newComment.split(/\s+/);
        words.forEach(word => {
            if (word.startsWith('@')) {
                const alias = word.substring(1).replace(/[^a-zA-Z0-9_-]/g, ''); // Simple sanitization
                const pub = mentionedUsers[alias];
                
                if (pub && pub !== pubKey && !processedPubs.has(pub)) {
                    processedPubs.add(pub);
                    const notifId = crypto.randomUUID();
                    const n: Notification = {
                       id: notifId,
                       type: 'comment',
                       message: `You were mentioned in a comment by ${userProfile?.alias || 'someone'}`,
                       link: `/request/${requestId}?submission=${submissionId}&comment=${id}`,
                       fromPub: pubKey as string,
                       createdAt: Date.now(),
                       read: false
                    };
                    gun.get('inboxes').get(pub).get(notifId).put(n);
                }
            }
        });
        
        setNewComment('');
        cancelRecording();
        setMentionedUsers({});

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

  const confirmDelete = () => {
      if (!deleteCandidateId) return;
      const commentId = deleteCandidateId;
      setDeleteCandidateId(null);

      // Check for Global Pulse ID to delete from feed
      user.get(APP_SCOPE).get('comments').get(commentId).once((cData: any) => {
          if (cData && cData.globalPulseId) {
              const bucket = cData.globalBucket || 'global_pulse'; // Fallback for legacy
              gun.get(bucket).get(cData.globalPulseId).put(null as any);
          }
      });

      // Delete from Public List (Pointer)
      gun.get('submission_comments').get(submissionId).get(commentId).put(null);
      
      // Delete from User Graph (Actual Data)
      user.get(APP_SCOPE).get('comments').get(commentId).put(null);
  };

  const handleEditComment = (commentId: string, newText: string) => {
      // Update User Graph (Source of Truth)
      user.get(APP_SCOPE).get('comments').get(commentId).get('text').put(newText);
      
      // Update Global Pulse if exists
      user.get(APP_SCOPE).get('comments').get(commentId).once((cData: any) => {
          if (cData && cData.globalPulseId) {
              const bucket = cData.globalBucket || 'global_pulse'; // Fallback
              (gun.get(bucket).get(cData.globalPulseId) as any).get('text').put(newText);
          }
      });
  };

  return (
    <div className="mt-4 bg-gray-950/50 rounded p-4 border border-gray-800">
       <h5 className="text-sm font-semibold text-gray-400 mb-3">Comments</h5>
       
       <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
          {comments.map(c => (
             <div key={c.id} id={`comment-${c.id}`} className="rounded transition-all duration-1000">
                <CommentItem 
                    comment={c} 
                    onDelete={handleDeleteComment} 
                    onEdit={handleEditComment}
                />
             </div>
          ))}
          {comments.length === 0 && <p className="text-xs text-gray-600 italic">No comments yet.</p>}
       </div>

       <form onSubmit={handleSubmit} className="flex flex-col gap-2 relative">
           {/* Mentions Dropdown */}
           {mentionQuery && mentionResults.length > 0 && (
               <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-20">
                   {mentionResults.map(u => (
                       <button
                           key={u.pub}
                           type="button"
                           onClick={() => selectMention(u)}
                           className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 transition"
                       >
                           <div className="w-6 h-6 rounded-full bg-gray-600 overflow-hidden flex-shrink-0">
                               {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-gray-300 mx-auto mt-1" />}
                           </div>
                           <div className="min-w-0">
                               <p className="text-sm text-white font-medium truncate">{u.alias}</p>
                           </div>
                       </button>
                   ))}
               </div>
           )}

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

           <div className="flex gap-2">
               {isAuthorized ? (
               <>
               <input 
                  ref={inputRef}
                  type="text" 
                  value={newComment}
                  onChange={handleInputChange}
                  placeholder="Write a comment... (@ to mention)"
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

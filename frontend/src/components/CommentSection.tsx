import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, Square, Trash2, Loader2 } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { uploadFile } from '../lib/upload';
import { CommentItem } from './CommentItem';
import { MiniPlayer } from './ui/MiniPlayer';
import type { Comment, Notification } from '../types';

interface CommentSectionProps {
  requestId: string;
  submissionId: string;
}

export function CommentSection({ requestId, submissionId }: CommentSectionProps) {
  const { gun, pubKey, user } = useGun();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Clear previous
    setComments([]);

    // Subscribe
    const commentsMap = new Map<string, Comment>();

    gun.get('file_requests')
       .get(requestId)
       .get('submissions')
       .get(submissionId)
       .get('comments')
       .map()
       .on((data: any, key: string) => {
          // If data is a reference (pointer), resolve it
          if (data && !data.text && !data.audioUrl) {
              gun.get(key).once((resolvedData: any) => {
                  if (resolvedData && (resolvedData.text || resolvedData.audioUrl)) {
                      const comment: Comment = { ...resolvedData, id: key };
                      commentsMap.set(key, comment);
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], 'voice-comment.webm', { type: 'audio/webm' });
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

        const userCommentNode = user.get('comments').get(id);
        userCommentNode.put(comment);

        gun.get('file_requests')
        .get(requestId)
        .get('submissions')
        .get(submissionId)
        .get('comments')
        .get(id)
        .put(userCommentNode);

        // Notify Submission Uploader
        gun.get('file_requests')
        .get(requestId)
        .get('submissions')
        .get(submissionId)
        .once((subData: any) => {
            // Resolve if it's a pointer/reference (which it likely is now)
            // .once() usually resolves, but let's be safe if it returns the pointer object
            const processNotification = (sub: any) => {
                 if (sub && sub.uploaderPub && sub.uploaderPub !== pubKey) {
                    console.log('Sending notification to:', sub.uploaderPub);
                    const notifId = crypto.randomUUID();
                    const notification: Notification = {
                        id: notifId,
                        type: 'comment',
                        message: `New comment on your track "${sub.title}"`,
                        link: `/request/${requestId}`,
                        fromPub: pubKey as string,
                        createdAt: Date.now(),
                        read: false
                    };
                    // Use public 'inboxes' graph since we can't write to other user's private graph
                    gun.get('inboxes').get(sub.uploaderPub).get(notifId).put(notification);
                 }
            };

            if (subData && !subData.uploaderPub) {
                 // Try to fetch assuming 'subData' might be the key or pointer, 
                 // but since we did .get(submissionId), subData should be the object.
                 // However, if the object is purely a reference (e.g. {'#': 'soul'}), 
                 // we might need to follow it.
                 // Actually, standard Gun .once() returns the data. 
                 // If the data was written as a reference, Gun follows it automatically.
                 // The issue might be if the data is PARTIALLY loaded.
                 processNotification(subData);
            } else {
                 processNotification(subData);
            }
        });
        
        setNewComment('');
        cancelRecording();

    } catch (err) {
        console.error('Error posting comment:', err);
        alert('Failed to post comment. Please try again.');
    } finally {
        setIsUploading(false);
    }
  };

  return (
    <div className="mt-4 bg-gray-950/50 rounded p-4 border border-gray-800 ml-16">
       <h5 className="text-sm font-semibold text-gray-400 mb-3">Comments</h5>
       
       <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
          {comments.map(c => (
             <CommentItem key={c.id} comment={c} />
          ))}
          {comments.length === 0 && <p className="text-xs text-gray-600 italic">No comments yet.</p>}
       </div>

       <form onSubmit={handleSubmit} className="flex flex-col gap-2">
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
               <input 
                  type="text" 
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
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
           </div>
       </form>
    </div>
  );
}

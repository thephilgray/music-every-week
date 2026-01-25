import { useState, useEffect } from 'react';
import { Send, User as UserIcon } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import type { Comment, Notification } from '../types';

interface CommentSectionProps {
  requestId: string;
  submissionId: string;
}

export function CommentSection({ requestId, submissionId }: CommentSectionProps) {
  const { gun, pubKey } = useGun();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    // Clear previous
    setComments([]);

    // Subscribe
    // Note: In a real app we might want to ensure we don't have duplicate listeners
    // but Gun's .map().on() is persistent.
    
    // We use a Map to dedup by ID just in case
    const commentsMap = new Map<string, Comment>();

    gun.get('file_requests')
       .get(requestId)
       .get('submissions')
       .get(submissionId)
       .get('comments')
       .map()
       .on((data: any, key: string) => {
          if (data && data.text) {
             const comment: Comment = { ...data, id: key };
             commentsMap.set(key, comment);
             setComments(Array.from(commentsMap.values()).sort((a, b) => a.createdAt - b.createdAt));
          }
       });
  }, [requestId, submissionId, gun]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const id = crypto.randomUUID();
    const comment: Comment = {
        id,
        text: newComment,
        authorPub: pubKey as string,
        createdAt: Date.now()
    };

    gun.get('file_requests')
       .get(requestId)
       .get('submissions')
       .get(submissionId)
       .get('comments')
       .get(id)
       .put(comment);

    // Notify Submission Uploader
    gun.get('file_requests')
       .get(requestId)
       .get('submissions')
       .get(submissionId)
       .once((sub: any) => {
           if (sub && sub.uploaderPub && sub.uploaderPub !== pubKey) {
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
                gun.user(sub.uploaderPub).get('inbox').get(notifId).put(notification);
           }
       });
       
    setNewComment('');
  };

  return (
    <div className="mt-4 bg-gray-950/50 rounded p-4 border border-gray-800 ml-16">
       <h5 className="text-sm font-semibold text-gray-400 mb-3">Comments</h5>
       
       <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
          {comments.map(c => (
             <div key={c.id} className="flex gap-2">
                 <div className="w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0">
                     <UserIcon className="w-3 h-3 text-gray-400" />
                 </div>
                 <div>
                     <div className="flex items-baseline gap-2">
                        <span className="text-xs font-mono text-blue-400">{c.authorPub.substring(0, 8)}</span>
                        <span className="text-xs text-gray-600">{new Date(c.createdAt).toLocaleTimeString()}</span>
                     </div>
                     <p className="text-sm text-gray-300">{c.text}</p>
                 </div>
             </div>
          ))}
          {comments.length === 0 && <p className="text-xs text-gray-600 italic">No comments yet.</p>}
       </div>

       <form onSubmit={handleSubmit} className="flex gap-2">
           <input 
              type="text" 
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
           />
           <button 
              type="submit"
              disabled={!newComment.trim()}
              className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
           >
              <Send className="w-4 h-4" />
           </button>
       </form>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { User as UserIcon } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { MiniPlayer } from './ui/MiniPlayer';
import type { Comment } from '../types';

interface CommentItemProps {
  comment: Comment;
}

export function CommentItem({ comment }: CommentItemProps) {
  const { gun } = useGun();
  const [authorAlias, setAuthorAlias] = useState<string>('');
  const [authorAvatar, setAuthorAvatar] = useState<string>('');

  useEffect(() => {
    // Fetch user profile
    gun.get('all_users').get(comment.authorPub).once((user: any) => {
        if (user) {
            setAuthorAlias(user.alias || 'Unknown');
            setAuthorAvatar(user.avatarUrl || '');
        }
    });
  }, [comment.authorPub, gun]);

  return (
    <div className="flex gap-2">
         <div className="w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
             {authorAvatar ? (
                 <img src={authorAvatar} alt={authorAlias} className="w-full h-full object-cover" />
             ) : (
                 <UserIcon className="w-3 h-3 text-gray-400" />
             )}
         </div>
         <div>
             <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-gray-300">
                    {authorAlias || <span className="font-mono text-blue-400">{comment.authorPub.substring(0, 8)}</span>}
                </span>
                <span className="text-xs text-gray-600">{new Date(comment.createdAt).toLocaleTimeString()}</span>
             </div>
             {comment.text && <p className="text-sm text-gray-300 whitespace-pre-wrap">{comment.text}</p>}
             {comment.audioUrl && (
                <MiniPlayer src={comment.audioUrl} />
             )}
         </div>
     </div>
  );
}

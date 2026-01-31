import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { User as UserIcon, MoreVertical, Trash2, Edit2, X, Check } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { MiniPlayer } from './ui/MiniPlayer';
import type { Comment } from '../types';

interface CommentItemProps {
  comment: Comment;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, newText: string) => void;
}

export function CommentItem({ comment, onDelete, onEdit }: CommentItemProps) {
  const { gun, pubKey } = useGun();
  const [authorAlias, setAuthorAlias] = useState<string>('');
  const [authorAvatar, setAuthorAvatar] = useState<string>('');
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(comment.text);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAuthor = pubKey && comment.authorPub === pubKey;

  useEffect(() => {
    // Fetch user profile
    gun.get('all_users').get(comment.authorPub).once((user: any) => {
        if (user) {
            setAuthorAlias(user.alias || 'Unknown');
            setAuthorAvatar(user.avatarUrl || '');
        }
    });
  }, [comment.authorPub, gun]);

  // Click outside to close menu
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
              setIsMenuOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveEdit = () => {
      if (editedText.trim() !== comment.text) {
          onEdit?.(comment.id, editedText);
      }
      setIsEditing(false);
      setIsMenuOpen(false);
  };

  return (
    <div className="flex gap-2 group relative">
         <div className="w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden mt-1">
             {authorAvatar ? (
                 <img src={authorAvatar} alt={authorAlias} className="w-full h-full object-cover" />
             ) : (
                 <UserIcon className="w-3 h-3 text-gray-400" />
             )}
         </div>
         <div className="flex-1 min-w-0">
             <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-gray-300">
                        <Link to={`/profile/${comment.authorPub}`} className="hover:text-white hover:underline">
                            {authorAlias || <span className="font-mono text-blue-400">{comment.authorPub.substring(0, 8)}</span>}
                        </Link>
                    </span>
                    <span className="text-xs text-gray-600">{new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                
                {isAuthor && !isEditing && (
                    <div className="relative" ref={menuRef}>
                        <button 
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition p-1"
                        >
                            <MoreVertical className="w-3 h-3" />
                        </button>
                        {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-24 bg-gray-800 border border-gray-700 rounded shadow-xl z-10 py-1">
                                <button 
                                    onClick={() => { setIsEditing(true); setIsMenuOpen(false); }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <Edit2 className="w-3 h-3" /> Edit
                                </button>
                                <button 
                                    onClick={() => { onDelete?.(comment.id); setIsMenuOpen(false); }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <Trash2 className="w-3 h-3" /> Delete
                                </button>
                            </div>
                        )}
                    </div>
                )}
             </div>

             {isEditing ? (
                 <div className="mt-1">
                     <textarea 
                        value={editedText}
                        onChange={e => setEditedText(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none min-h-[60px]"
                        autoFocus
                     />
                     <div className="flex justify-end gap-2 mt-2">
                         <button 
                            onClick={() => setIsEditing(false)}
                            className="p-1 text-gray-400 hover:text-white"
                         >
                             <X className="w-4 h-4" />
                         </button>
                         <button 
                            onClick={handleSaveEdit}
                            className="p-1 text-green-400 hover:text-green-300"
                         >
                             <Check className="w-4 h-4" />
                         </button>
                     </div>
                 </div>
             ) : (
                 <>
                    {comment.text && <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{comment.text}</p>}
                    {comment.audioUrl && (
                        <div className="mt-1">
                            <MiniPlayer src={comment.audioUrl} />
                        </div>
                    )}
                 </>
             )}
         </div>
     </div>
  );
}

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [menuPos, setMenuPos] = useState<{ top: number, left: number } | null>(null);

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

  const handleSaveEdit = () => {
      if (editedText.trim() !== comment.text) {
          onEdit?.(comment.id, editedText);
      }
      setIsEditing(false);
      setMenuPos(null);
  };

  const toggleMenu = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (menuPos) {
          setMenuPos(null);
      } else {
          const rect = e.currentTarget.getBoundingClientRect();
          // w-24 is 6rem (96px). We align right edge of menu with right edge of button.
          setMenuPos({ 
              top: rect.bottom + 4, 
              left: rect.right - 96 
          });
      }
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
                    <div className="relative">
                        <button 
                            onClick={toggleMenu}
                            className={`text-gray-500 hover:text-white transition p-1 ${menuPos ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                            <MoreVertical className="w-3 h-3" />
                        </button>
                        
                        {menuPos && createPortal(
                            <>
                                <div 
                                    className="fixed inset-0 z-[9998]" 
                                    onClick={(e) => { e.stopPropagation(); setMenuPos(null); }}
                                />
                                <div 
                                    className="fixed z-[9999] w-24 bg-gray-800 border border-gray-700 rounded shadow-xl py-1"
                                    style={{ top: menuPos.top, left: menuPos.left }}
                                >
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setIsEditing(true); setMenuPos(null); }}
                                        className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <Edit2 className="w-3 h-3" /> Edit
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDelete?.(comment.id); setMenuPos(null); }}
                                        className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <Trash2 className="w-3 h-3" /> Delete
                                    </button>
                                </div>
                            </>,
                            document.body
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

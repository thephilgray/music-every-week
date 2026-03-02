import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom'; // Import Link
import { User as UserIcon, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { MiniPlayer } from './MiniPlayer';
import { fixUrl } from '../../lib/url';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { formatCommentDate } from '../../lib/utils';

export interface CommentItemUIProps {
  id: string;
  text: string;
  authorEmail: string;
  authorName: string;
  authorAvatarUrl?: string;
  createdAt: number;
  audioUrl?: string;
  isOwnComment: boolean;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, newText: string) => void;
  onAuthorClick?: (email: string) => void;
  profileLinkPub?: string; // New prop for profile linking
  reactions?: Record<string, 'heart' | '+1'>;
  onReact?: (id: string, reaction: 'heart' | '+1') => void;
  currentUserId?: string;
}

export function CommentItemUI({ 
  id, 
  text, 
  authorEmail, 
  authorName, 
  authorAvatarUrl, 
  createdAt, 
  audioUrl, 
  isOwnComment, 
  onDelete, 
  onEdit,
  profileLinkPub,
  reactions,
  onReact,
  currentUserId
}: CommentItemUIProps) {
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(text);
  const [menuPos, setMenuPos] = useState<{ top: number, left: number } | null>(null);
  const [resolvedUid, setResolvedUid] = useState<string | undefined>(profileLinkPub);
  const [liveProfile, setLiveProfile] = useState<{ displayName?: string, alias?: string, avatarUrl?: string } | null>(null);

  useEffect(() => {
      let isMounted = true;
      if (profileLinkPub) {
          setResolvedUid(profileLinkPub);
          // Fetch profile directly by UID
          const fetchProfileByUid = async () => {
              try {
                  const profileDoc = await getDoc(doc(db, 'profiles', profileLinkPub));
                  if (profileDoc.exists() && isMounted) {
                      setLiveProfile(profileDoc.data() as any);
                  }
              } catch (e) {
                  // Ignore
              }
          };
          fetchProfileByUid();
      } else if (authorEmail) {
          // Fallback: Resolve UID from email if missing
          const fetchProfile = async () => {
              try {
                  const q = query(collection(db, 'profiles'), where('email', '==', authorEmail));
                  const querySnapshot = await getDocs(q);
                  if (!querySnapshot.empty && isMounted) {
                      setResolvedUid(querySnapshot.docs[0].id);
                      setLiveProfile(querySnapshot.docs[0].data() as any);
                  }
              } catch (e) {
                  // Ignore error
              }
          };
          fetchProfile();
      }
      return () => { isMounted = false; };
  }, [profileLinkPub, authorEmail]);

  useEffect(() => {
    setEditedText(text); // Update editedText if original text changes
  }, [text]);

  const handleSaveEdit = () => {
      if (editedText.trim() !== text) {
          onEdit?.(id, editedText);
      }
      setIsEditing(false);
      setMenuPos(null);
  };

  const handleCancelEdit = () => {
    setEditedText(text); // Reset to original text
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

  const finalName = liveProfile?.displayName || liveProfile?.alias || authorName;
  const finalAvatar = liveProfile?.avatarUrl || authorAvatarUrl;

  const heartCount = Object.values(reactions || {}).filter(r => r === 'heart').length;
  const plusOneCount = Object.values(reactions || {}).filter(r => r === '+1').length;
  const myReaction = currentUserId ? (reactions?.[currentUserId]) : undefined;

  return (
    <div className="flex gap-2 group relative">
         <div className="w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden mt-1">
             {finalAvatar ? (
                 <img src={fixUrl(finalAvatar)} alt={finalName} className="w-full h-full object-cover" />
             ) : (
                 <UserIcon className="w-3 h-3 text-gray-400" />
             )}
         </div>
         <div className="flex-1 min-w-0">
             <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                    {resolvedUid ? (
                        <Link to={`/profile/${resolvedUid}`} className="text-xs font-bold text-gray-300 hover:text-white hover:underline">
                            {finalName}
                        </Link>
                    ) : (
                        <span className="text-xs font-bold text-gray-300">
                            {finalName}
                        </span>
                    )}
                    <span className="text-xs text-gray-600" title={new Date(createdAt).toLocaleString()}>
                        {formatCommentDate(createdAt)}
                    </span>
                </div>
                
                {isOwnComment && !isEditing && (
                    <div className="relative">
                        <button 
                            onClick={toggleMenu}
                            className={`text-gray-500 hover:text-white transition p-1 ${menuPos ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}
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
                                        onClick={(e) => { e.stopPropagation(); onDelete?.(id); setMenuPos(null); }}
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
                        onFocus={(e) => {
                            const val = e.target.value;
                            e.target.setSelectionRange(val.length, val.length);
                        }}
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none min-h-[60px]"
                        autoFocus
                     />
                     <div className="flex justify-end gap-2 mt-2">
                         <button 
                            onClick={handleCancelEdit}
                            className="px-3 py-1 text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                         >
                             Cancel
                         </button>
                         <button 
                            onClick={handleSaveEdit}
                            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition"
                         >
                             Save
                         </button>
                     </div>
                 </div>
             ) : (
                 <>
                    {text && (
                        <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">
                            {text.split(/(@\w+)/g).map((part, i) => 
                                part.startsWith('@') ? <span key={i} className="text-blue-400">{part}</span> : part
                            )}
                        </p>
                    )}
                    {audioUrl && (
                        <div className="mt-1">
                            <MiniPlayer src={audioUrl} />
                        </div>
                    )}
                    <div className="flex gap-2 mt-1">
                        <button 
                            onClick={() => onReact?.(id, 'heart')}
                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${myReaction === 'heart' ? 'bg-pink-900/30 text-pink-400 border-pink-800' : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-pink-400 hover:border-pink-800'}`}
                        >
                            ❤️ {heartCount > 0 && heartCount}
                        </button>
                        <button 
                            onClick={() => onReact?.(id, '+1')}
                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${myReaction === '+1' ? 'bg-blue-900/30 text-blue-400 border-blue-800' : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-blue-400 hover:border-blue-800'}`}
                        >
                            👍 {plusOneCount > 0 && plusOneCount}
                        </button>
                    </div>
                 </>
             )}
         </div>
     </div>
  );
}

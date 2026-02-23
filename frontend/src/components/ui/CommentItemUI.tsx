import React from 'react';
import { Trash2, Edit2 } from 'lucide-react';
import { MiniPlayer } from './MiniPlayer';
import { fixUrl } from '../../lib/url';

export interface CommentUIProps {
  id: string;
  authorName: string;
  authorEmail: string; // NEW
  authorAvatarUrl?: string;
  createdAt: number;
  text: string;
  audioUrl?: string;
  isOwnComment?: boolean;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, newText: string) => void;
  onAuthorClick?: (email: string) => void; // NEW
}

export function CommentItemUI({
  id,
  authorName,
  authorEmail,
  authorAvatarUrl,
  createdAt,
  text,
  audioUrl,
  isOwnComment,
  onDelete,
  onEdit,
  onAuthorClick 
}: CommentUIProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editText, setEditText] = React.useState(text);

  // Sync editText with text prop when text changes from parent (e.g., after Firestore update)
  React.useEffect(() => {
    setEditText(text);
  }, [text]);

  const handleSaveEdit = () => {
      console.log("handleSaveEdit called.");
      console.log("Current id:", id);
      console.log("Current editText:", editText);
      console.log("Original text prop:", text);
      if (onEdit && editText.trim() !== text) {
          console.log("Calling onEdit with:", id, editText);
          onEdit(id, editText);
      } else {
          console.log("onEdit not called. Reason: onEdit is missing OR editText is same as text prop after trim.");
      }
      setIsEditing(false);
  };
  return (
    <div className={`flex gap-3 p-3 rounded-lg hover:bg-gray-900/40 transition group ${isOwnComment ? 'bg-blue-900/10 border border-blue-900/30' : ''}`}>
      <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center">
              {authorAvatarUrl ? (
                  <img src={fixUrl(authorAvatarUrl)} alt={authorName} className="w-full h-full object-cover" />
              ) : (
                  <div className="text-xs font-bold text-gray-400">
                      {authorName?.[0]?.toUpperCase() || '?'}
                  </div>
              )}
          </div>
      </div>
      
      <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between">
              <span 
                  className={`font-bold text-sm text-gray-300 mr-2 truncate ${onAuthorClick ? 'cursor-pointer hover:text-blue-400' : ''}`}
                  onClick={() => onAuthorClick && onAuthorClick(authorEmail)}
              >
                  {authorName}
              </span>
              <span className="text-[10px] text-gray-500 flex-shrink-0">
                  {(() => {
                      const commentDate = new Date(createdAt);
                      const today = new Date();
                      
                      const isToday = commentDate.getDate() === today.getDate() &&
                                      commentDate.getMonth() === today.getMonth() &&
                                      commentDate.getFullYear() === today.getFullYear();

                      if (isToday) {
                          return commentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      } else {
                          // Display date and time for other days
                          return commentDate.toLocaleString([], { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                          });
                      }
                  })()}
              </span>
          </div>

          {isEditing ? (
              <div className="mt-1">
                  <textarea 
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                      rows={2}
                  />
                  <div className="flex gap-2 mt-2 justify-end">
                      <button onClick={() => setIsEditing(false)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                      <button onClick={handleSaveEdit} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-500">Save</button>
                  </div>
              </div>
          ) : (
              <>
                  <p className="text-sm text-gray-300 mt-0.5 whitespace-pre-wrap break-words leading-snug">
                      {text}
                  </p>
                  
                  {audioUrl && (
                      <div className="mt-2 w-full max-w-[200px]">
                          <MiniPlayer src={fixUrl(audioUrl)} />
                      </div>
                  )}
              </>
          )}
      </div>

      {isOwnComment && !isEditing && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 items-end justify-start">
              {onEdit && (
                  <button onClick={() => setIsEditing(true)} className="text-gray-500 hover:text-blue-400 p-1" title="Edit">
                      <Edit2 className="w-3 h-3" />
                  </button>
              )}
              {onDelete && (
                  <button onClick={() => onDelete(id)} className="text-gray-500 hover:text-red-400 p-1" title="Delete">
                      <Trash2 className="w-3 h-3" />
                  </button>
              )}
          </div>
      )}
    </div>
  );
}

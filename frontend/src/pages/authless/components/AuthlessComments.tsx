import React, { useEffect, useState, useRef } from 'react';
import { db } from '../../../lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Send, Loader2 } from 'lucide-react';
import { CommentItemUI } from '../../../components/ui/CommentItemUI';

interface Comment {
  id: string;
  requestId: string;
  submissionId?: string;
  authorEmail: string;
  text: string;
  createdAt: any;
  userProfile?: {
      displayName?: string;
      avatarUrl?: string;
  }
}

interface AuthlessCommentsProps {
  requestId: string;
  submissionId?: string | null; // Allow null or undefined
  currentUserEmail: string;
  userProfile?: {
      displayName?: string;
      avatarUrl?: string;
  }
}

export function AuthlessComments({ requestId, submissionId, currentUserEmail, userProfile }: AuthlessCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  // Initialize newComment from localStorage draft
  const draftKey = `comment_draft_${requestId}_${submissionId || 'request'}`;
  const [newComment, setNewComment] = useState(localStorage.getItem(draftKey) || '');
  const [loading, setLoading] = useState(true);

  // Debounce saving draft to localStorage
  const saveDraftTimeout = useRef<number | null>(null);
  useEffect(() => {
    // Clear previous timeout on re-render or if newComment changes rapidly
    if (saveDraftTimeout.current) {
      clearTimeout(saveDraftTimeout.current);
    }

    // Set a new timeout to save draft after 500ms of inactivity
    saveDraftTimeout.current = setTimeout(() => {
      if (newComment.trim() === '') {
        localStorage.removeItem(draftKey); // Clear draft if empty
      } else {
        localStorage.setItem(draftKey, newComment);
      }
    }, 500);

    // Cleanup function: clear timeout on unmount
    return () => {
      if (saveDraftTimeout.current) {
        clearTimeout(saveDraftTimeout.current);
      }
    };
  }, [newComment, draftKey]);


  useEffect(() => {
    const commentsCollectionRef = collection(db, 'comments');
    const queryConstraints = [
      where('requestId', '==', requestId),
      orderBy('createdAt', 'asc')
    ];

    if (submissionId !== undefined) {
      queryConstraints.push(where('submissionId', '==', submissionId));
    }
    console.log("AuthlessComments Querying with:", {
        requestId,
        submissionId: submissionId !== undefined ? submissionId : "no filter (all submissions)",
        constraints: queryConstraints.map(c => JSON.stringify(c))
    });


    const q = query(commentsCollectionRef, ...queryConstraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`AuthlessComments received ${snapshot.docs.length} comments for requestId: ${requestId}, submissionId: ${submissionId}`);
      const loadedComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Comment));
      console.log("Loaded Comments Data (AuthlessComments):", loadedComments.map(c => ({ id: c.id, text: c.text, createdAt: c.createdAt }))); // Added console.log
      setComments(loadedComments);
      setLoading(false);
    }, (err) => {
        console.error("Comments subscription error:", err);
        setLoading(false);
        console.error("Firebase comments error details:", err.message);
    });

    return () => unsubscribe();
  }, [requestId, submissionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      await addDoc(collection(db, 'comments'), {
        requestId,
        submissionId,
        authorEmail: currentUserEmail,
        text: newComment.trim(),
        createdAt: serverTimestamp(),
        userProfile: {
            displayName: userProfile?.displayName || currentUserEmail,
            avatarUrl: userProfile?.avatarUrl || null
        }
      });
      setNewComment('');
      localStorage.removeItem(draftKey); // Clear draft after successful submission
    } catch (err) {
      console.error("Error adding comment:", err);
    }
  };

  const handleDelete = async (commentId: string) => {
      if (confirm("Are you sure you want to delete this comment?")) {
          try {
              await deleteDoc(doc(db, 'comments', commentId));
          } catch (e) {
              console.error("Delete failed", e);
          }
      }
  };

  const handleEditComment = async (commentId: string, newText: string) => {
      console.log(`Attempting to update comment ${commentId} with new text: "${newText}"`);
      try {
          const commentDocRef = doc(db, 'comments', commentId);
          const currentDocSnap = await getDoc(commentDocRef);
          if (currentDocSnap.exists()) {
              console.log("Current comment text in Firestore:", currentDocSnap.data().text);
          } else {
              console.warn("Comment document does not exist:", commentId);
          }

          await updateDoc(commentDocRef, { text: newText });
          console.log(`Comment ${commentId} updated successfully in Firestore.`);
      } catch (e) {
          console.error(`Error updating comment ${commentId} in Firestore:`, e);
      }
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl flex flex-col min-h-[200px] max-h-[500px]">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-xl font-bold flex items-center gap-2">Discussion</h2> {/* Changed to Discussion */}
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-700">
        {loading ? (
            <div className="flex justify-center p-4">
                <Loader2 className="animate-spin text-gray-500" />
            </div>
        ) : (
            <div className="space-y-4">
                {comments.map(comment => (
                    <CommentItemUI
                        key={comment.id}
                        id={comment.id}
                        text={comment.text}
                        authorName={comment.userProfile?.displayName || 'Anonymous'}
                        authorEmail={comment.authorEmail}
                        authorAvatarUrl={comment.userProfile?.avatarUrl}
                        createdAt={comment.createdAt?.toDate ? comment.createdAt.toDate().getTime() : Date.now()}
                        isOwnComment={comment.authorEmail === currentUserEmail}
                        onDelete={comment.authorEmail === currentUserEmail ? handleDelete : undefined}
                        onEdit={comment.authorEmail === currentUserEmail ? handleEditComment : undefined}
                        onAuthorClick={(email) => console.log("Navigate to profile for:", email)}
                    />
                ))}
                {comments.length === 0 && (
                    <div className="text-center text-gray-500 mt-10 italic">
                        No comments yet. Be the first!
                    </div>
                )}
            </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-800 bg-gray-900/30">
        <form onSubmit={handleSubmit} className="relative">
            <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                className="w-full bg-gray-800 border border-gray-700 rounded-full py-3 px-4 pr-12 text-white focus:outline-none focus:border-blue-500 transition shadow-inner"
            />
            <button
                type="submit"
                disabled={!newComment.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition shadow-lg"
            >
                <Send size={16} />
            </button>
        </form>
      </div>
    </div>
  );
}

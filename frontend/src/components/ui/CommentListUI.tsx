import { CommentItemUI, type CommentItemUIProps } from './CommentItemUI';
import { Loader2 } from 'lucide-react';

interface CommentListUIProps {
  comments: CommentItemUIProps[];
  loading?: boolean;
}

export function CommentListUI({ comments, loading }: CommentListUIProps) {
  if (loading) {
      return (
          <div className="flex justify-center p-4">
              <Loader2 className="animate-spin text-gray-500" />
          </div>
      );
  }

  if (comments.length === 0) {
      return (
          <div className="text-center text-gray-500 italic p-4 text-sm">
              No comments yet. Be the first!
          </div>
      );
  }

  return (
      <div className="space-y-3 p-4">
          {comments.map((comment) => (
              <CommentItemUI key={comment.id} {...comment} />
          ))}
      </div>
  );
}

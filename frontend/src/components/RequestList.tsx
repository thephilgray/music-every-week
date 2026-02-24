import { useAuth } from '../contexts/AuthContext';
import { RequestCard } from './RequestCard';
import { Skeleton } from './ui/Skeleton';
import type { FileRequest } from '../types';
import { Music } from 'lucide-react';

interface RequestListProps {
  requests: FileRequest[];
  loading: boolean;
  filter?: 'active' | 'archived' | 'mine';
}

export function RequestList({ requests, loading, filter = 'active' }: RequestListProps) {
  const { user, participantEmail, isAdmin } = useAuth();

  // Filter Logic based on deadline and status
  const filtered = requests.filter(req => {
      const isExpired = req.deadline ? new Date(req.deadline).getTime() < Date.now() : false;
      
      const currentUserEmail = user?.email || participantEmail;
      
      const isOwner = req.hostEmail && currentUserEmail && req.hostEmail === currentUserEmail;
      const isDirect = req.accessMode === 'direct' || req.accessMode === 'public'; // Assuming 'direct' means public/direct access
      const isJoined = currentUserEmail && req.accessList?.includes(currentUserEmail);

      // 1. Privacy Check: Must be Owner, Public, or Joined
      // If requests are passed via props (e.g. from Home), they are already filtered by the parent?
      // Home.tsx filters for "Active Requests" using similar logic.
      // Archive.tsx might use this component too.
      if (!isAdmin && !isOwner && !isDirect && !isJoined) return false;
      
      if (filter === 'active') {
          return !isExpired; 
      }
      if (filter === 'archived') {
          return isExpired;
      }
      return true;
  });

  if (loading && filtered.length === 0) {
      return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
      );
  }

  if (filtered.length === 0) {
      return (
          <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-800">
              <Music className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500">No {filter} requests found.</p>
          </div>
      );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filtered.map(req => {
          const isClosed = req.deadline ? new Date(req.deadline).getTime() < Date.now() : false;
          return (
            <RequestCard 
                key={req.id} 
                request={req} 
                isClosed={isClosed}
            />
          );
      })}
    </div>
  );
}
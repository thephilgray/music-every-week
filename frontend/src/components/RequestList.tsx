import { useState, useEffect } from 'react';
import { useGun } from '../contexts/GunContext';
import { RequestCard } from './RequestCard';
import { Skeleton } from './ui/Skeleton';
import type { FileRequest } from '../types';
import { Music } from 'lucide-react';

interface RequestListProps {
  requests?: FileRequest[];
  loading?: boolean;
  filter?: 'active' | 'archived' | 'mine';
}

export function RequestList({ requests: propRequests, loading: propLoading, filter = 'active' }: RequestListProps) {
  const { gun, user, pubKey, userProfile } = useGun();
  const [internalRequests, setInternalRequests] = useState<FileRequest[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);
  const [participation, setParticipation] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    
    // Subscribe to participation statuses (Scoped)
    user.get('participation').map().on((status: any, reqId: string) => {
        setParticipation(prev => ({ ...prev, [reqId]: status }));
    });
  }, [user]);

  // Internal Fetch if no props provided
  useEffect(() => {
      if (propRequests) {
          setInternalLoading(false);
          return;
      }

      const reqMap = new Map<string, FileRequest>();
      let batchTimeout: ReturnType<typeof setTimeout> | null = null;

      const updateState = () => {
          setInternalRequests(Array.from(reqMap.values()).sort((a, b) => b.createdAt - a.createdAt));
          setInternalLoading(false);
          batchTimeout = null;
      };
      
      gun.get('file_requests').map().on((data: any, key: string) => {
          if (data && data.title) {
              reqMap.set(key, { ...data, id: key });
              
              if (!batchTimeout) {
                batchTimeout = setTimeout(updateState, 100);
              }
          }
      });
      
      const timer = setTimeout(() => setInternalLoading(false), 2000);
      return () => {
          if (batchTimeout) clearTimeout(batchTimeout);
          clearTimeout(timer);
      };
  }, [gun, propRequests]);

  const requestsToFilter = propRequests || internalRequests;
  const isLoading = propLoading !== undefined ? propLoading : internalLoading;

  // Filter Logic based on deadline and status
  const filtered = requestsToFilter.filter(req => {
      const isExpired = req.deadline ? new Date(req.deadline).getTime() < Date.now() : false;
      const myStatus = participation[req.id!];
      const isOwner = req.ownerPub === pubKey;
      const isDirect = req.accessMode === 'direct';
      const isJoined = myStatus === 'accepted' || myStatus === 'joined';

      // 1. Privacy Check: Must be Owner, Public, or Joined
      // If requests are passed via props (e.g. from Home), they are already filtered by the parent?
      // Home.tsx filters for "Active Requests" using similar logic.
      // Archive.tsx does NOT filter. So we need this check here for Archive view security.
      const isAdmin = userProfile?.isAdmin;
      if (!isAdmin && !isOwner && !isDirect && !isJoined) return false;
      
      if (filter === 'active') {
          return !isExpired; 
      }
      if (filter === 'archived') {
          return isExpired;
      }
      return true;
  });

  if (isLoading && filtered.length === 0) {
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
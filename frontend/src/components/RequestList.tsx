import { useEffect, useState } from 'react';
import { useGun } from '../contexts/GunContext';
import type { FileRequest } from '../types';
import { Skeleton } from './ui/Skeleton';
import { RequestCard } from './RequestCard';

interface RequestListProps {
  filter?: 'active' | 'archived' | 'all';
}

export function RequestList({ filter = 'all' }: RequestListProps) {
  const { gun, pubKey } = useGun();
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to all file_requests
    const requestsMap = new Map<string, FileRequest>();
    const now = Date.now();

    const processRequest = (data: any, key: string) => {
       if (!data || !data.title) return; // Basic validation
       
       const newRequest: FileRequest = {
         id: key,
         ...data,
         // Parse JSON fields if they are strings
         pending_emails: typeof data.pending_emails === 'string' ? JSON.parse(data.pending_emails) : data.pending_emails,
         participants: typeof data.participants === 'string' ? JSON.parse(data.participants) : data.participants
       };
       
       // Privacy Logic
       // accessMode 'invite' is restricted (formerly private). 'direct' is visible to all (formerly public).
       if (newRequest.accessMode === 'invite') {
           // If not logged in, hide invite-only requests
           if (!pubKey) return;
           
           // Check if owner
           const isOwner = newRequest.ownerPub === pubKey;
           
           // Check if participant
           const participants = newRequest.participants || {};
           const isParticipant = participants[pubKey];
           
           if (!isOwner && !isParticipant) return;
       }

       // Filter Logic
       const GRACE_PERIOD = 7 * 24 * 60 * 60 * 1000; // 7 days
       const deadlineTime = newRequest.deadline ? new Date(newRequest.deadline).getTime() : Infinity;
       
       if (filter === 'active') {
           // Show if deadline is in future OR within grace period
           if (deadlineTime + GRACE_PERIOD < now) return; 
       } else if (filter === 'archived') {
           // Show only if deadline + grace period is past
           if (deadlineTime + GRACE_PERIOD >= now) return;
       }

       requestsMap.set(key, newRequest);
       // Sort by Deadline (Active: soonest first, Archived: newest first)
       const sorted = Array.from(requestsMap.values()).sort((a, b) => {
           const dateA = a.deadline ? new Date(a.deadline).getTime() : 0;
           const dateB = b.deadline ? new Date(b.deadline).getTime() : 0;
           if (filter === 'active') return dateA - dateB; // Soonest deadline first
           return dateB - dateA; // Newest archived first
       });
       
       setRequests(sorted);
       setLoading(false);
    };

    gun.get('file_requests').map().on(processRequest);
    
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, [gun, filter, pubKey]);

  if (loading && requests.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-full flex flex-col">
                  <Skeleton className="aspect-video w-full bg-gray-700" />
                  <div className="p-4 flex-1 flex flex-col gap-4">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-1/2" />
                      <div className="mt-auto pt-4 border-t border-gray-700/50 flex justify-between">
                          <Skeleton className="h-3 w-1/4" />
                          <Skeleton className="h-3 w-1/4" />
                      </div>
                  </div>
              </div>
          ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {requests.map(req => {
        const isClosed = req.deadline && new Date(req.deadline).getTime() < Date.now();
        return (
          <RequestCard key={req.id} request={req} isClosed={!!isClosed} />
      )})}
      
      {requests.length === 0 && (
        <div className="col-span-full text-center py-12 text-gray-500 bg-gray-900/50 border border-gray-800 border-dashed rounded-lg">
           <p className="text-lg font-medium text-gray-300 mb-2">
               {filter === 'active' ? 'No active requests' : 'No archived requests'}
           </p>
           {filter === 'active' && <p className="text-sm">Create a new request to get started!</p>}
        </div>
      )}
    </div>
  );
}

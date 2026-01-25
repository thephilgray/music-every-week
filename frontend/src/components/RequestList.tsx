import { useEffect, useState } from 'react';
import { useGun } from '../contexts/GunContext';
import type { FileRequest } from '../types';
import { Link } from 'react-router-dom';
import { Skeleton } from './ui/Skeleton';

export function RequestList() {
  const { gun } = useGun();
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to all file_requests
    // Note: In a real app we might want to paginate or filter
    const requestsMap = new Map<string, FileRequest>();

    gun.get('file_requests').map().on((data: any, key: string) => {
       if (!data || !data.title) return; // Basic validation
       
       const newRequest: FileRequest = {
         id: key,
         ...data,
         // Parse JSON fields if they are strings
         pending_emails: typeof data.pending_emails === 'string' ? JSON.parse(data.pending_emails) : data.pending_emails,
         participants: typeof data.participants === 'string' ? JSON.parse(data.participants) : data.participants
       };
       
       requestsMap.set(key, newRequest);
       setRequests(Array.from(requestsMap.values()));
       if (requestsMap.size > 0) setLoading(false);
    });
    
    // Cleanup not strictly necessary for Gun .on() in this simple case, 
    // but in production we'd want to manage subscriptions.
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, [gun]);

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
      {requests.map(req => (
        <Link to={`/request/${req.id}`} key={req.id} className="block group">
            <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:border-blue-500 transition-colors h-full flex flex-col">
            <div className="aspect-video bg-gray-700 relative">
                {req.artworkUrl ? (
                <img src={req.artworkUrl} alt={req.title} className="w-full h-full object-cover" />
                ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                    No Artwork
                </div>
                )}
                <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 backdrop-blur rounded text-xs font-mono text-gray-300 capitalize">
                {req.visibility}
                </div>
            </div>
            
            <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-xl font-bold text-gray-100 mb-2 group-hover:text-blue-400 transition-colors">{req.title}</h3>
                <p className="text-gray-400 text-sm mb-4 line-clamp-2 flex-1">{req.description}</p>
                
                <div className="flex items-center justify-between text-xs text-gray-500 mt-auto pt-4 border-t border-gray-700/50">
                    <span>Due: {req.deadline ? new Date(req.deadline).toLocaleDateString() : 'No Deadline'}</span>
                    {/* Placeholder for participant count */}
                    <span>0 Tracks</span>
                </div>
            </div>
            </div>
        </Link>
      ))}
      
      {requests.length === 0 && (
        <div className="col-span-full text-center py-12 text-gray-500 bg-gray-900/50 border border-gray-800 border-dashed rounded-lg">
           <p className="text-lg font-medium text-gray-300 mb-2">No active requests</p>
           <p className="text-sm">Create a new request to get started!</p>
        </div>
      )}
    </div>
  );
}

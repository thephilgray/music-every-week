import { useEffect, useState } from 'react';
import { useGun } from '../contexts/GunContext';
import type { FileRequest } from '../types';
import { Link } from 'react-router-dom';

export function RequestList() {
  const { gun } = useGun();
  const [requests, setRequests] = useState<FileRequest[]>([]);

  useEffect(() => {
    // Subscribe to all file_requests
    // Note: In a real app we might want to paginate or filter
    const requestsMap = new Map<string, FileRequest>();

    gun.get('file_requests').map().on((data: any, key: string) => {
       if (!data || !data.title) return; // Basic validation
       
       const newRequest: FileRequest = {
         id: key,
         ...data
       };
       
       requestsMap.set(key, newRequest);
       setRequests(Array.from(requestsMap.values()));
    });
    
    // Cleanup not strictly necessary for Gun .on() in this simple case, 
    // but in production we'd want to manage subscriptions.
  }, [gun]);

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
        <div className="col-span-full text-center py-12 text-gray-500">
           No requests found. Create one to get started!
        </div>
      )}
    </div>
  );
}

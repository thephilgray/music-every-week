import { useEffect, useState } from 'react';
import { useGun } from '../contexts/GunContext';
import type { FileRequest } from '../types';

export function RequestList() {
  const { gun } = useGun();
  const [requests, setRequests] = useState<FileRequest[]>([]);

  useEffect(() => {
    // Subscribe to updates
    // map() iterates over each item in the set
    gun.get('file_requests').map().on((data: any, id: string) => {
      if (!data || !data.title) return; // Basic validation (deleted nodes might be null)
      
      setRequests(prev => {
        // Check if exists to update or add
        const exists = prev.find(r => r.id === id);
        if (exists) {
            // Update if changed
            return prev.map(r => r.id === id ? { ...data, id } : r);
        }
        return [...prev, { ...data, id }];
      });
    });
  }, [gun]);

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold text-white mb-6">Active File Requests</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {requests.map(req => (
          <div key={req.id} className="bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700 hover:border-blue-500 transition cursor-pointer">
             {req.artworkUrl ? (
               <img src={req.artworkUrl} alt={req.title} className="w-full h-48 object-cover"/>
             ) : (
               <div className="w-full h-48 bg-gray-700 flex items-center justify-center text-gray-500">
                 No Artwork
               </div>
             )}
             <div className="p-4">
               <div className="flex justify-between items-start mb-2">
                  <h4 className="text-lg font-bold text-white truncate pr-2">{req.title}</h4>
                  <span className={`text-xs px-2 py-1 rounded uppercase font-bold tracking-wider ${req.visibility === 'public' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                    {req.visibility}
                  </span>
               </div>
               <p className="text-gray-400 text-sm mb-4 line-clamp-2 h-10">{req.description}</p>
               <div className="flex justify-between items-center text-xs text-gray-500 border-t border-gray-700 pt-3">
                  <span>Due: {req.deadline || 'No Date'}</span>
                  <span>By: {req.ownerPub.substring(0,4)}...{req.ownerPub.substring(req.ownerPub.length-4)}</span>
               </div>
             </div>
          </div>
        ))}
        {requests.length === 0 && (
          <p className="text-gray-500 col-span-full text-center py-12 bg-gray-800/50 rounded border border-gray-700 border-dashed">
            No active requests found. Create one to get started!
          </p>
        )}
      </div>
    </div>
  );
}

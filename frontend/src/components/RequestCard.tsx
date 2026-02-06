import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGun } from '../contexts/GunContext';
import type { FileRequest } from '../types';

interface RequestCardProps {
  request: FileRequest;
  isClosed: boolean;
}

export function RequestCard({ request, isClosed }: RequestCardProps) {
  const { gun } = useGun();
  const [submissionCount, setSubmissionCount] = useState(0);

  useEffect(() => {
    if (!request.id) return;

    const submissionIds = new Set<string>();
    
    // Listen for submissions to this request (Global Node)
    gun.get('request_submissions').get(request.id).map().on((data: any, key: any) => {
      if (data) {
        submissionIds.add(key);
        setSubmissionCount(submissionIds.size);
      }
    });

    return () => {
        // Cleanup subscription
        gun.get('request_submissions').get(request.id!).off();
    };
  }, [gun, request.id]);

  return (
    <Link to={`/request/${request.id}`} className="block group">
      <div className={`bg-gray-800 border ${isClosed ? 'border-red-900/50 opacity-80' : 'border-gray-700'} rounded-lg overflow-hidden hover:border-blue-500 transition-colors h-full flex flex-col`}>
        <div className="aspect-video bg-gray-700 relative">
          {request.artworkUrl ? (
            <img src={request.artworkUrl} alt={request.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
              No Artwork
            </div>
          )}
          {request.accessMode === 'direct' && (
            <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600/90 text-white rounded text-xs font-bold border border-blue-400 shadow-md">
              PUBLIC
            </div>
          )}
          {isClosed && (
            <div className="absolute bottom-2 right-2 px-2 py-1 bg-red-900/90 text-red-200 rounded text-xs font-bold border border-red-700">
              CLOSED
            </div>
          )}
        </div>
        
        <div className="p-4 flex-1 flex flex-col">
          <h3 className="text-xl font-bold text-gray-100 mb-2 group-hover:text-blue-400 transition-colors">{request.title}</h3>
          <p className="text-gray-400 text-sm mb-4 line-clamp-2 flex-1">{request.description}</p>
          
          <div className="flex items-center justify-between text-xs text-gray-500 mt-auto pt-4 border-t border-gray-700/50">
            <span className={isClosed ? 'text-red-400' : ''}>
              {isClosed ? 'Ended: ' : 'Due: '} 
              {request.deadline ? new Date(request.deadline).toLocaleDateString() : 'No Deadline'}
            </span>
            <span>{submissionCount} Track{submissionCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

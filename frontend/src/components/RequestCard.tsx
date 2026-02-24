import { Link } from 'react-router-dom';
import { fixUrl } from '../lib/url';
import type { FileRequest } from '../types';

interface RequestCardProps {
  request: FileRequest;
  isClosed: boolean;
}

export function RequestCard({ request, isClosed }: RequestCardProps) {
  // TODO: Add submission count from Firestore (denormalized field on request or separate query)
  
  return (
    <Link to={`/request/${request.id}`} className="block group">
      <div className={`bg-gray-800 border ${isClosed ? 'border-red-900/50 opacity-80' : 'border-gray-700'} rounded-lg overflow-hidden hover:border-blue-500 transition-colors h-full flex flex-col`}>
        <div className="aspect-video bg-gray-700 relative">
          {request.artworkUrl ? (
            <img src={fixUrl(request.artworkUrl)} alt={request.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
              No Artwork
            </div>
          )}
          {request.accessMode === 'direct' ? (
            <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600/90 text-white rounded text-xs font-bold border border-blue-400 shadow-md">
              PUBLIC
            </div>
          ) : request.accessMode === 'invite' ? (
            <div className="absolute top-2 left-2 px-2 py-1 bg-purple-600/90 text-white rounded text-xs font-bold border border-purple-400 shadow-md">
              PRIVATE
            </div>
          ) : request.accessMode === 'volunteer' ? (
             <div className="absolute top-2 left-2 px-2 py-1 bg-teal-600/90 text-white rounded text-xs font-bold border border-teal-400 shadow-md">
              VOLUNTEER
            </div>
          ) : null}
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
          </div>
        </div>
      </div>
    </Link>
  );
}

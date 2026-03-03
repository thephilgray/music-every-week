import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fixUrl } from '../lib/url';
import type { FileRequest } from '../types';
import { getTimestampAsNumber } from '../lib/utils';
import { Clock } from 'lucide-react';

interface RequestCardProps {
  request: FileRequest;
  isClosed: boolean;
  hideStatus?: boolean;
}

export function RequestCard({ request, isClosed, hideStatus }: RequestCardProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [timerColor, setTimerColor] = useState<string>('text-blue-400');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  useEffect(() => {
    if (!request.deadline || isClosed || hideStatus) {
        setTimeLeft('');
        return;
    }

    const deadlineTime = getTimestampAsNumber(request.deadline);
    
    const updateTimer = () => {
        const remaining = deadlineTime - Date.now();
        if (remaining <= 0) {
            setTimeLeft(''); // Just let isClosed handle it
            return;
        }

        const hoursTotal = remaining / (1000 * 60 * 60);
        if (hoursTotal < 24) {
            setTimerColor('text-red-500');
        } else if (hoursTotal < 48) {
            setTimerColor('text-orange-500');
        } else {
            setTimerColor('text-blue-400');
        }

        const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

        let str = '';
        if (days > 0) str += `${days}d `;
        str += `${hours}h ${minutes}m`;
        setTimeLeft(str);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 60000); // Update every minute for mini version
    return () => clearInterval(timer);
  }, [request.deadline, isClosed, hideStatus]);
  
  return (
    <Link to={`/request/${request.id}`} className="block group">
      <div 
        className={`bg-gray-800 border ${isClosed && !hideStatus ? 'border-red-900/50 opacity-80' : 'border-gray-700'} rounded-lg overflow-hidden hover:border-blue-500 transition-colors h-full flex flex-col`}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => {
            setIsHovering(false);
            setMousePos({ x: 0, y: 0 });
        }}
        style={{
            perspective: '1000px'
        }}
      >
        <div 
            className="aspect-video bg-gray-700 relative overflow-hidden"
            style={{
                transform: isHovering 
                    ? `rotateY(${mousePos.x * 10}deg) rotateX(${-mousePos.y * 10}deg)` 
                    : 'rotateY(0deg) rotateX(0deg)',
                transition: isHovering ? 'none' : 'transform 0.5s ease-out'
            }}
        >
          <div 
            className="w-full h-full"
            style={{
                transform: isHovering
                    ? `scale(1.1) translateX(${mousePos.x * 20}px) translateY(${mousePos.y * 20}px)`
                    : 'scale(1) translateX(0) translateY(0)',
                transition: isHovering ? 'none' : 'transform 0.5s ease-out'
            }}
          >
            {request.artworkUrl ? (
                <img src={fixUrl(request.artworkUrl)} alt={request.title} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                No Artwork
                </div>
            )}
          </div>
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
          {isClosed && !hideStatus && (
            <div className="absolute bottom-2 right-2 px-2 py-1 bg-red-900/90 text-red-200 rounded text-xs font-bold border border-red-700">
              CLOSED
            </div>
          )}
        </div>
        
        <div className="p-4 flex-1 flex flex-col">
          <h3 className="text-xl font-bold text-gray-100 mb-2 group-hover:text-blue-400 transition-colors">{request.title}</h3>
          <p className="text-gray-400 text-sm mb-4 line-clamp-2 flex-1">{request.description}</p>
          
          <div className="flex items-center justify-between text-xs text-gray-500 mt-auto pt-4 border-t border-gray-700/50">
            <span className={isClosed && !hideStatus ? 'text-red-400' : ''}>
              {hideStatus ? 'Ended: ' : (isClosed ? 'Ended: ' : 'Due: ')} 
              {request.deadline ? new Date(request.deadline).toLocaleDateString() : 'No Deadline'}
            </span>
            {timeLeft && (
                <span className={`flex items-center gap-1 font-bold ${timerColor}`}>
                    <Clock className="w-3 h-3" />
                    {timeLeft}
                </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

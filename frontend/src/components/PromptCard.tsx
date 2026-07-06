import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fixUrl } from '../lib/url';
import type { Prompt } from '../types';
import { getTimestampAsNumber } from '../lib/utils';
import { Clock } from 'lucide-react';

interface PromptCardProps {
  request: Prompt;
  isClosed: boolean;
  hideStatus?: boolean;
}

export function PromptCard({ request, isClosed, hideStatus }: PromptCardProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [timerColor, setTimerColor] = useState<string>('text-blue-400');

  useEffect(() => {
    if (!request.deadline || isClosed || hideStatus) {
        setTimeLeft('');
        return;
    }

    const deadlineTime = getTimestampAsNumber(request.deadline);
    
    const updateTimer = () => {
        const remaining = deadlineTime - Date.now();
        if (remaining <= 0) {
            setTimeLeft(''); 
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
    const timer = setInterval(updateTimer, 60000); 
    return () => clearInterval(timer);
  }, [request.deadline, isClosed, hideStatus]);
  
  return (
    <Link to={`/prompt/${request.id}`} className="block group">
      <div className="flex flex-col gap-4">
        {/* Artwork Square */}
        <div 
          className={`aspect-square bg-gray-700 relative overflow-hidden rounded-lg border shadow-lg transition-all duration-300 ${
            isClosed && !hideStatus 
              ? 'border-red-900/50 opacity-80' 
              : 'border-gray-800 group-hover:border-blue-500/50 group-hover:shadow-blue-900/10'
          }`}
        >
          {request.artworkUrl ? (
              <img src={fixUrl(request.artworkUrl)} alt={request.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                No Artwork
              </div>
          )}
          
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {request.accessMode === 'direct' ? (
              <div className="px-2 py-1 bg-blue-600/90 text-white rounded text-[10px] font-bold border border-blue-400 shadow-md backdrop-blur-sm">
                PUBLIC
              </div>
            ) : request.accessMode === 'invite' ? (
              <div className="px-2 py-1 bg-purple-600/90 text-white rounded text-[10px] font-bold border border-purple-400 shadow-md backdrop-blur-sm">
                PRIVATE
              </div>
            ) : request.accessMode === 'volunteer' ? (
               <div className="px-2 py-1 bg-teal-600/90 text-white rounded text-[10px] font-bold border border-teal-400 shadow-md backdrop-blur-sm">
                VOLUNTEER
              </div>
            ) : null}
          </div>

          {isClosed && !hideStatus && (
            <div className="absolute bottom-2 right-2 px-2 py-1 bg-red-900/90 text-red-200 rounded text-[10px] font-bold border border-red-700 backdrop-blur-sm">
              CLOSED
            </div>
          )}
        </div>
        
        {/* Label Content */}
        <div className="flex flex-col">
          <h3 className="text-lg font-bold text-gray-100 group-hover:text-blue-400 transition-colors truncate">{request.title}</h3>
          <p className="text-gray-400 text-sm line-clamp-1 mt-0.5">{request.description}</p>
          
          <div className="flex items-center justify-between text-[11px] text-gray-500 mt-3 tabular-nums">
            <span className={isClosed && !hideStatus ? 'text-red-400/80' : 'text-gray-500'}>
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


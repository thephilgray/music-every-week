import { useState } from 'react';
import { Info } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  icon?: boolean; // If true, renders an Info icon instead of wrapping children
  className?: string;
}

export function Tooltip({ content, children, icon = false, className = "" }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onClick={(e) => {
          // On mobile, tap to toggle
          e.stopPropagation();
          setIsVisible(!isVisible);
      }}
    >
      {icon ? (
          <Info className="w-4 h-4 text-gray-500 hover:text-blue-400 cursor-help transition-colors" />
      ) : children}
      
      {isVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-gray-950 border border-gray-700 rounded-lg text-xs text-gray-200 shadow-2xl z-[100] pointer-events-none leading-relaxed">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-950" />
        </div>
      )}
    </div>
  );
}

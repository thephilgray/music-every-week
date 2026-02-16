import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  icon?: boolean;
  className?: string;
}

export function Tooltip({ content, children, icon = false, className = "" }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
      if (triggerRef.current) {
          const rect = triggerRef.current.getBoundingClientRect();
          setCoords({
              top: rect.top, // Viewport relative
              left: rect.left + (rect.width / 2)
          });
      }
  };

  return (
    <>
      <div 
        ref={triggerRef}
        className={`relative inline-flex items-center ${className}`}
        onMouseEnter={() => {
            updatePosition();
            setIsVisible(true);
        }}
        onMouseLeave={() => setIsVisible(false)}
        onClick={(e) => {
            e.stopPropagation();
            updatePosition();
            setIsVisible(!isVisible);
        }}
      >
        {icon ? (
            <Info className="w-4 h-4 text-gray-500 hover:text-blue-400 cursor-help transition-colors" />
        ) : children}
      </div>
      
      {isVisible && createPortal(
        <div 
            className="fixed z-[9999] w-56 p-3 bg-gray-950 border border-gray-700 rounded-lg text-xs text-gray-200 shadow-2xl pointer-events-none leading-relaxed animate-in fade-in zoom-in duration-200"
            style={{ 
                top: coords.top - 8, // 8px spacing above
                left: coords.left,
                transform: 'translate(-50%, -100%)'
            }}
        >
          {content}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-950" />
        </div>,
        document.body
      )}
    </>
  );
}

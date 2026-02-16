import { useState, useEffect, type ComponentType } from 'react';
import { Music } from 'lucide-react';

interface ArtworkDisplayProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
  FallbackIcon?: ComponentType<{ className?: string }>;
}

export function ArtworkDisplay({ 
    src, 
    alt, 
    className = "w-full h-full object-cover", 
    iconClassName = "text-gray-600",
    FallbackIcon = Music 
}: ArtworkDisplayProps) {
  const [error, setError] = useState(false);

  // Reset error if src changes
  useEffect(() => {
      setError(false);
  }, [src]);

  if (src && !error) {
    return (
      <img 
        src={src} 
        alt={alt} 
        className={className} 
        onError={() => setError(true)} 
      />
    );
  }

  return <FallbackIcon className={iconClassName} />;
}
import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { fixUrl } from '../../lib/url';

interface MiniPlayerProps {
  src: string;
}

export function MiniPlayer({ src }: MiniPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration) {
          setCurrentTime(audio.currentTime);
          setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleEnded = () => setIsPlaying(false);
    const handleMetadata = () => setDuration(audio.duration);

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleMetadata);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleMetadata);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Pause other audios? Maybe not necessary for mini player
      audioRef.current.play();
      setIsPlaying(true);
    }
  };
  
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!audioRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const p = x / rect.width;
      const time = p * audioRef.current.duration;
      audioRef.current.currentTime = time;
      setProgress(p * 100);
  };
  
  const formatTime = (seconds: number) => {
      if(!seconds || isNaN(seconds)) return "0:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 bg-gray-800 rounded-full px-3 py-2 mt-1 w-fit border border-gray-700 min-w-[180px]">
      <audio ref={audioRef} src={fixUrl(src)} preload="metadata" />
      <button 
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-500 transition flex-shrink-0"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      
      <div className="flex flex-col flex-1 min-w-[100px]">
         <div 
            className="h-1.5 bg-gray-600 rounded-full w-full overflow-hidden cursor-pointer hover:h-2 transition-all"
            onClick={handleSeek}
         >
             <div className="h-full bg-blue-400 transition-all duration-100 ease-linear" style={{ width: `${progress}%` }} />
         </div>
         <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-mono">
             <span>{formatTime(currentTime)}</span>
             <span>{formatTime(duration)}</span>
         </div>
      </div>
    </div>
  );
}

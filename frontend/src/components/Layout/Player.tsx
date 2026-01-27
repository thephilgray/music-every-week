import React from 'react';
import { Play, SkipBack, SkipForward, Volume2, Pause, Music } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';

const Waveform = ({ data, progress, onSeek }: { data: number[], progress: number, onSeek: (p: number) => void }) => {
  return (
    <div 
      className="flex items-center gap-0.5 h-8 w-full cursor-pointer group"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const p = x / rect.width;
        onSeek(Math.min(Math.max(p, 0), 1));
      }}
    >
      {data.map((val, i) => {
        const barProgress = i / data.length;
        const isPlayed = barProgress < progress;
        return (
          <div 
            key={i}
            className={`flex-1 rounded-sm transition-colors ${isPlayed ? 'bg-blue-500' : 'bg-gray-700 group-hover:bg-gray-600'}`}
            style={{ height: `${Math.max(val * 100, 15)}%` }}
          />
        );
      })}
    </div>
  );
};

export function Player() {
  const { currentTrack, isPlaying, pause, resume, next, prev, currentTime, duration, seek } = usePlayer();

  if (!currentTrack) {
      return null; // Don't render empty bar at bottom if nothing playing? Or render placeholder?
                   // The original code rendered a placeholder. Let's keep it but make it hidden or minimal if preferred.
                   // User asked for specific changes, but didn't say to remove the placeholder.
                   // I'll keep the original placeholder behavior but return null if nothing to match typical persistent players, 
                   // OR keep the placeholder.
      /* Original:
      return (
        <div className="h-24 bg-gray-900 border-t border-gray-800 px-6 flex items-center justify-center text-gray-500 text-sm">
            Select a track to start playing
        </div>
      );
      */
     // Let's stick to the previous return for consistency.
     return (
        <div className="h-24 bg-gray-900 border-t border-gray-800 px-6 flex items-center justify-center text-gray-500 text-sm z-50 fixed bottom-0 w-full">
            Select a track to start playing
        </div>
      );
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(Number(e.target.value));
  };

  const formatTime = (time: number) => {
      if (!time || isNaN(time)) return "0:00";
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-24 bg-gray-900 border-t border-gray-800 px-6 flex items-center justify-between z-50 fixed bottom-0 w-full">
      {/* Track Info */}
      <div className="w-1/3 flex items-center gap-4">
        <div className="w-14 h-14 bg-gray-800 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
             {currentTrack.artworkUrl ? (
                 <img src={currentTrack.artworkUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
             ) : (
                 <Music className="text-gray-600" />
             )}
        </div>
        <div className="min-w-0">
           <div className="text-white font-medium truncate">{currentTrack.title}</div>
           <div className="text-gray-500 text-xs truncate">
             {currentTrack.byline || (currentTrack.uploaderPub ? `${currentTrack.uploaderPub.substring(0, 8)}...` : 'Unknown')}
           </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-2 w-1/3 min-w-[200px]">
         <div className="flex items-center gap-6">
            <button onClick={prev} className="text-gray-400 hover:text-white transition">
                <SkipBack className="w-5 h-5" />
            </button>
            <button 
                onClick={isPlaying ? pause : resume}
                className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition"
            >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
            </button>
            <button onClick={next} className="text-gray-400 hover:text-white transition">
                <SkipForward className="w-5 h-5" />
            </button>
         </div>
         
         <div className="w-full flex items-center gap-3 text-xs text-gray-500 font-mono">
             <span className="min-w-[35px] text-right">{formatTime(currentTime)}</span>
             
             {currentTrack.waveform && currentTrack.waveform.length > 0 ? (
                 <Waveform 
                    data={currentTrack.waveform} 
                    progress={duration ? currentTime / duration : 0}
                    onSeek={(p) => seek(p * (duration || 0))}
                 />
             ) : (
                 <input 
                    type="range" 
                    min={0} 
                    max={duration || 100} 
                    value={currentTime} 
                    onChange={handleSeek}
                    className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                 />
             )}
             
             <span className="min-w-[35px]">{formatTime(duration)}</span>
         </div>
      </div>

      {/* Volume / Extras */}
      <div className="w-1/3 flex justify-end items-center gap-4">
          <Volume2 className="text-gray-400 w-5 h-5" />
          <div className="w-24 h-1 bg-gray-800 rounded-full hidden md:block"></div>
      </div>
    </div>
  );
}

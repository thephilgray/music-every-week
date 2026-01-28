import React, { useState } from 'react';
import { Play, SkipBack, SkipForward, Volume2, VolumeX, Pause, Music, FileText, X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePlayer } from '../../contexts/PlayerContext';

const Waveform = ({ data, progress, onSeek }: { data: number[], progress: number, onSeek: (p: number) => void }) => {
  // Defensive check: ensure data is an array
  const bars = Array.isArray(data) ? data : [];
  
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
      {bars.map((val, i) => {
        const barProgress = i / bars.length;
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
  const { currentTrack, isPlaying, pause, resume, next, prev, currentTime, duration, seek, context, volume, muted, setVolume, toggleMute } = usePlayer();
  const [showLyrics, setShowLyrics] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  if (!currentTrack) {
     return (
        <div className="h-24 bg-gray-900 border-t border-gray-800 px-6 flex items-center justify-center text-gray-500 text-sm w-full flex-none">
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
    <>
      {showLyrics && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowLyrics(false)}>
           <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
               <div className="flex justify-between items-center mb-4">
                   <h3 className="text-xl font-bold text-white">Track Notes / Lyrics</h3>
                   <button onClick={() => setShowLyrics(false)} className="text-gray-400 hover:text-white">
                       <X className="w-5 h-5" />
                   </button>
               </div>
               <div className="flex-1 overflow-y-auto bg-gray-950 p-4 rounded text-gray-300 whitespace-pre-wrap font-mono text-sm">
                   {currentTrack.lyrics || "No notes or lyrics available for this track."}
               </div>
           </div>
        </div>
      )}

      <div className={`${isMinimized ? 'h-16' : 'h-24'} bg-gray-900 border-t border-gray-800 px-6 flex items-center justify-between w-full flex-none transition-all duration-300 ease-in-out`}>
      {/* Track Info */}
      <div className="w-1/3 flex items-center gap-4">
        <div className={`${isMinimized ? 'w-10 h-10' : 'w-14 h-14'} bg-gray-800 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 relative group transition-all`}>
             {currentTrack.artworkUrl ? (
                 <img src={currentTrack.artworkUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
             ) : (
                 <Music className="text-gray-600" />
             )}
             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                 <button onClick={() => setShowLyrics(true)} title="View Notes/Lyrics">
                     <FileText className={`${isMinimized ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
                 </button>
             </div>
        </div>
        <div className="min-w-0">
           <div className="text-white font-medium truncate flex items-center gap-2">
               {currentTrack.title}
               {currentTrack.lyrics && (
                   <button onClick={() => setShowLyrics(true)} className="text-gray-500 hover:text-blue-400" title="View Notes">
                       <FileText className="w-3 h-3" />
                   </button>
               )}
           </div>
           <div className="text-gray-500 text-xs truncate">
             {currentTrack.byline || (currentTrack.uploaderPub ? `${currentTrack.uploaderPub.substring(0, 8)}...` : 'Unknown')}
           </div>
           {context && !isMinimized && (
               <div className="text-xs text-blue-500 truncate mt-0.5 flex items-center gap-1">
                   <span>Playing from:</span>
                   <Link to={context.link} className="hover:underline flex items-center gap-0.5">
                       {context.name} <ExternalLink className="w-2 h-2" />
                   </Link>
               </div>
           )}
        </div>
      </div>

      {/* Controls */}
      <div className={`flex flex-col items-center justify-center w-1/3 min-w-[200px] ${isMinimized ? 'gap-0' : 'gap-2'}`}>
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
         
         {!isMinimized && (
             <div className="w-full flex items-center gap-3 text-xs text-gray-500 font-mono animate-in fade-in duration-300">
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
         )}
      </div>

      {/* Volume / Extras */}
      <div className="w-1/3 flex justify-end items-center gap-4">
          <div className={`flex items-center gap-4 ${isMinimized ? 'hidden md:flex' : 'flex'}`}>
              <button onClick={toggleMute} className="text-gray-400 hover:text-white">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                      setVolume(parseFloat(e.target.value));
                      if (muted && parseFloat(e.target.value) > 0) toggleMute(); // Unmute if dragging slider
                  }}
                  className={`w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hidden md:block ${isMinimized ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
              />
          </div>
          
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-2 text-gray-500 hover:text-white bg-gray-800 rounded-full hover:bg-gray-700 transition"
            title={isMinimized ? "Expand Player" : "Minimize Player"}
          >
             {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
      </div>
    </div>
    </>
  );
}

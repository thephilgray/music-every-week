import React, { useState } from 'react';
import { Play, SkipBack, SkipForward, Volume2, VolumeX, Pause, Music, FileText, ExternalLink, ChevronDown, ChevronUp, ListMusic } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePlayer } from '../../contexts/PlayerContext';
import { SongDetailsModal } from '../SongDetailsModal';
import { QueueModal } from './QueueModal';
import { Waveform } from '../ui/Waveform';

export function Player() {
  const { currentTrack, isPlaying, pause, resume, next, prev, currentTime, duration, seek, context, volume, muted, setVolume, toggleMute, queue, play } = usePlayer();
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);

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
      {showLyrics && currentTrack && (
        <SongDetailsModal currentTrack={currentTrack} onClose={() => setShowLyrics(false)} />
      )}

      {showQueue && (
        <QueueModal 
            queue={queue} 
            currentTrack={currentTrack} 
            onPlay={(track) => play(track)} 
            onClose={() => setShowQueue(false)} 
        />
      )}

      <div className={`${isMinimized ? 'h-16' : 'h-24'} bg-gray-900 border-t border-gray-800 px-6 flex items-center justify-between w-full flex-none transition-all duration-300 ease-in-out`}>
      {/* Track Info */}
      <div className={`${isMinimized ? 'flex-1 lg:w-1/3' : 'w-1/3'} flex items-center gap-4 transition-all duration-300`}>
        <div className={`${isMinimized ? 'w-10 h-10' : 'w-14 h-14'} bg-gray-800 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 relative group transition-all`}>
             {currentTrack?.artworkUrl ? (
                 <img src={currentTrack.artworkUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
             ) : (
                 <Music className="text-gray-600" />
             )}
             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                 <button onClick={() => setShowLyrics(true)} title="View Notes/Lyrics" disabled={!currentTrack}>
                     <FileText className={`${isMinimized ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
                 </button>
             </div>
        </div>
        <div className="min-w-0 flex-1">
           <div className="text-white font-medium truncate flex items-center gap-2">
               {currentTrack?.title || 'No Track Selected'}
               {currentTrack?.lyrics && (
                   <button onClick={() => setShowLyrics(true)} className="text-gray-500 hover:text-blue-400" title="View Notes">
                       <FileText className="w-3 h-3" />
                   </button>
               )}
           </div>
           <div className="text-gray-500 text-xs truncate">
             {currentTrack?.byline || (currentTrack?.uploaderPub ? `${currentTrack.uploaderPub.substring(0, 8)}...` : 'Select a track to play')}
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
      <div className={`flex flex-col items-center justify-center ${isMinimized ? 'w-auto ml-4 flex-row gap-4 lg:w-1/3 lg:justify-center' : 'w-1/3 min-w-[200px] gap-2'}`}>
         <div className="flex items-center gap-6">
            <button onClick={prev} className="text-gray-400 hover:text-white transition" disabled={!currentTrack}>
                <SkipBack className="w-5 h-5" />
            </button>
            <button 
                onClick={isPlaying ? pause : resume}
                disabled={!currentTrack}
                className={`${isMinimized ? 'w-8 h-8' : 'w-10 h-10'} bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition disabled:opacity-50`}
            >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
            </button>
            <button onClick={next} className="text-gray-400 hover:text-white transition" disabled={!currentTrack}>
                <SkipForward className="w-5 h-5" />
            </button>
         </div>
         
         {!isMinimized && (
             <div className="w-full flex items-center gap-3 text-xs text-gray-500 font-mono animate-in fade-in duration-300">
                 <span className="min-w-[35px] text-right">{formatTime(currentTime)}</span>
                 
                 {currentTrack?.waveform && currentTrack.waveform.length > 0 ? (
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
                        disabled={!currentTrack}
                        className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full disabled:opacity-50"
                     />
                 )}
                 
                 <span className="min-w-[35px]">{formatTime(duration)}</span>
             </div>
         )}
      </div>

      {/* Volume / Extras */}
      <div className={`${isMinimized ? 'w-auto ml-4 lg:w-1/3' : 'w-1/3'} flex justify-end items-center gap-4`}>
          <button 
              onClick={() => setShowQueue(true)}
              className={`text-gray-400 hover:text-white transition ${queue.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={queue.length === 0}
              title="Queue"
          >
              <ListMusic className="w-5 h-5" />
          </button>

          <div className={`flex items-center gap-4 ${isMinimized ? 'hidden' : 'flex'}`}>
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

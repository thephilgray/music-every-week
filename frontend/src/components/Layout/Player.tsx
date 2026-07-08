import React, { useState, useEffect } from 'react';
import { Play, SkipBack, SkipForward, Volume2, VolumeX, Pause, Music, FileText, ChevronDown, ListMusic } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import { SongDetailsModal } from '../SongDetailsModal';
import { QueueModal } from './QueueModal';
import { Waveform } from '../ui/Waveform';
import { ArtworkDisplay } from '../ui/ArtworkDisplay';
import { CollaboratorList } from '../ui/CollaboratorList';
import { useAuth } from '../../contexts/AuthContext';


export function Player() {
  const { currentTrack, isPlaying, pause, resume, next, prev, currentTime, duration, seek, volume, muted, setVolume, toggleMute, queue, play, context } = usePlayer();
  const { participantEmail } = useAuth();
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);

  // Manage currentUserEmail and userProfile internally
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(participantEmail);

  // Effect to load currentUserEmail from AuthContext
  useEffect(() => {
    setCurrentUserEmail(participantEmail);
  }, [participantEmail]);


  // Auto-expand on track change
  const isInitialMount = React.useRef(true);
  useEffect(() => {
      if (currentTrack) {
          if (isInitialMount.current) {
              isInitialMount.current = false;
              return;
          }
          setIsMinimized(false);
      }
  }, [currentTrack?.id]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(Number(e.target.value));
  };

  const formatTime = (time: number) => {
      if (!time || isNaN(time) || !isFinite(time)) return "0:00";
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {showLyrics && currentTrack && ( 
        <SongDetailsModal 
            currentTrack={{ ...currentTrack, context }} 
            onClose={() => setShowLyrics(false)} 
            currentUserEmail={currentUserEmail} 
        />
      )}

      {showQueue && (
        <QueueModal 
            queue={queue} 
            currentTrack={currentTrack} 
            onPlay={(track) => play(track)} 
            onClose={() => setShowQueue(false)} 
        />
      )}

      {/* Main Player Container */}
      <div 
        className={`
            fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 transition-all duration-300 ease-in-out
            ${isMinimized ? 'h-16' : 'h-[100dvh] md:h-16'}
            flex flex-col md:flex-row items-center justify-between
            px-0 md:px-4
        `}
      >
        
        {/* Mobile Expanded Header (Only visible on mobile expanded) */}
        {!isMinimized && (
            <div className="w-full flex md:hidden items-center justify-between p-4 border-b border-gray-800">
                <button onClick={() => setIsMinimized(true)} className="text-gray-400 hover:text-white">
                    <ChevronDown className="w-6 h-6" />
                </button>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Now Playing</span>
                <button onClick={() => setShowQueue(true)} className="text-gray-400 hover:text-white">
                    <ListMusic className="w-6 h-6" />
                </button>
            </div>
        )}

        {/* Track Info */}
        <div 
            className={`
                flex transition-all duration-300
                ${isMinimized ? 'w-full h-full items-center px-4 gap-3 cursor-pointer' : 'flex-col w-full items-center p-6 flex-1'}
                md:flex-row md:w-1/4 lg:w-1/3 md:max-w-[260px] lg:max-w-[380px] md:h-full md:items-center md:px-2 md:gap-3 md:p-0 md:flex-none md:cursor-default
            `}
            onClick={() => {
                // On mobile minimized, clicking anywhere (except buttons) expands
                if (isMinimized && window.innerWidth < 768) {
                    setIsMinimized(false);
                }
            }}
        >
            <div className={`
                bg-gray-800 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 relative group transition-all
                ${isMinimized ? 'w-10 h-10' : 'w-64 h-64 shadow-2xl mb-6'}
                md:w-10 md:h-10 md:shadow-none md:mb-0
            `}>
                <ArtworkDisplay 
                    src={currentTrack?.artworkUrl || context?.artworkUrl || '/mewlogo.png'} 
                    alt={currentTrack?.title || 'Track'} 
                    className="w-full h-full object-cover"
                    FallbackIcon={Music}
                />
                {/* Overlay on Desktop or Mobile Expanded */}
                <div className={`absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center ${isMinimized ? 'hidden md:flex' : ''}`}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowLyrics(true); }} 
                        title="View Notes/Lyrics" 
                        disabled={!currentTrack}
                    >
                        <FileText className="w-6 h-6 text-white md:w-5 md:h-5" />
                    </button>
                </div>
            </div>

            <div className={`min-w-0 flex-1 ${!isMinimized ? 'text-center w-full' : ''} md:text-left md:w-auto`}>
                {currentTrack ? (
                    <CollaboratorList
                        uploaderPub={currentTrack.uploaderUid || currentTrack.originalUploaderPub || ''}
                        uploaderEmail={currentTrack.uploaderEmail}
                        byline={currentTrack.byline}
                        collaborators={currentTrack.collaborators}
                        linkProfile={currentTrack.linkProfile}
                        proxyFor={currentTrack.proxyFor}
                        className={`text-white font-bold truncate flex items-center gap-2 ${!isMinimized ? 'justify-center text-xl' : ''} md:justify-start md:text-base`}
                    />
                ) : (
                    <div className={`text-white font-bold truncate flex items-center gap-2 ${!isMinimized ? 'justify-center text-xl' : ''} md:justify-start md:text-base`}>
                        No Artist Selected
                    </div>
                )}
                <div className={`text-gray-500 text-xs truncate ${!isMinimized ? 'text-lg mt-1 justify-center' : ''} md:text-xs md:mt-0 md:justify-start flex items-center gap-2`}>
                    {currentTrack?.title || 'Select a track to play'}
                    {currentTrack?.lyrics && !isMinimized && (
                        <button onClick={(e) => { e.stopPropagation(); setShowLyrics(true); }} className="text-gray-500 hover:text-blue-400 block md:hidden" title="View Notes">
                            <FileText className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            
            {/* Mobile Minimized Play Button (Right side) */}
            {isMinimized && (
                <div className="md:hidden ml-auto flex items-center gap-4">
                    <button 
                        onClick={(e) => { e.stopPropagation(); isPlaying ? pause() : resume(); }}
                        disabled={!currentTrack}
                        className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black"
                    >
                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                    </button>
                </div>
            )}
        </div>

      {/* Controls Section */}
      <div className={`
          flex flex-col items-center justify-center transition-all
          ${isMinimized ? 'hidden' : 'w-full min-w-[200px] gap-6 p-6'}
          md:flex md:flex-row md:flex-1 md:w-auto md:max-w-[800px] md:gap-4 lg:gap-6 md:px-4 md:p-0 md:justify-between min-w-0
      `}>
          {/* Waveform / Progress (Mobile Expanded & Desktop) */}
          <div className="w-full md:flex-1 md:w-auto min-w-0 flex items-center gap-3 text-xs text-gray-500 font-mono animate-in fade-in duration-300">
               <span className="min-w-[35px] text-right">{formatTime(currentTime)}</span>
               
               {currentTrack?.waveform && currentTrack.waveform.length > 0 ? (
                   <div className="flex-1 min-w-0 overflow-hidden flex items-center">
                       <Waveform 
                          data={currentTrack.waveform} 
                          progress={duration ? currentTime / duration : 0}
                          onSeek={(p) => seek(p * (duration || 0))}
                       />
                   </div>
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

         <div className="flex items-center gap-8 md:gap-4 mt-4 md:mt-0 flex-shrink-0">
            <button onClick={prev} className="text-gray-400 hover:text-white transition transform hover:scale-110" disabled={!currentTrack}>
                <SkipBack className="w-8 h-8 md:w-5 md:h-5" />
            </button>
            <button 
                onClick={isPlaying ? pause : resume}
                disabled={!currentTrack}
                className="w-16 h-16 md:w-10 md:h-10 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition disabled:opacity-50 shadow-lg md:shadow-none"
            >
                {isPlaying ? <Pause className="w-8 h-8 md:w-5 md:h-5" /> : <Play className="w-8 h-8 md:w-5 md:h-5 ml-1" />}
            </button>
            <button onClick={next} className="text-gray-400 hover:text-white transition transform hover:scale-110" disabled={!currentTrack}>
                <SkipForward className="w-8 h-8 md:w-5 md:h-5" />
            </button>
         </div>
      </div>

      {/* Volume / Extras (Desktop Only for Volume) */}
      <div className={`
          ${isMinimized ? 'hidden' : 'w-full flex'} 
          md:flex md:w-auto md:flex-shrink-0 justify-between md:justify-end items-center gap-4 px-8 md:px-2 pb-8 md:pb-0
      `}>
          {/* Mobile Expanded Extras */}
          {!isMinimized && (
              <div className="flex md:hidden items-center justify-between w-full">
                  <button onClick={() => setShowLyrics(true)} className="text-gray-400 hover:text-white flex flex-col items-center gap-1">
                      <FileText className="w-6 h-6" />
                      <span className="text-[10px]">Lyrics</span>
                  </button>
                   {/* Volume Mute Toggle */}
                  <button onClick={toggleMute} className="text-gray-400 hover:text-white flex flex-col items-center gap-1">
                      {muted || volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                      <span className="text-[10px]">Mute</span>
                  </button>
              </div>
          )}

          <div className="hidden md:flex items-center justify-end gap-4 w-full">
              <button 
                  onClick={() => setShowQueue(true)}
                  className={`text-gray-400 hover:text-white transition ${queue.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={queue.length === 0}
                  title="Queue"
              >
                  <ListMusic className="w-5 h-5" />
              </button>

              <button 
                  onClick={() => setShowLyrics(true)}
                  className={`hidden lg:block transition ${!currentTrack ? 'text-gray-600 opacity-50 cursor-not-allowed' : currentTrack?.lyrics ? 'text-blue-400 hover:text-blue-300' : 'text-gray-400 hover:text-white'}`}
                  disabled={!currentTrack}
                  title={currentTrack?.lyrics ? "View Notes / Lyrics (Available)" : "View Song Details / Comments"}
              >
                  <FileText className="w-5 h-5" />
              </button>

              <div className="hidden lg:flex items-center gap-3">
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
                          if (muted && parseFloat(e.target.value) > 0) toggleMute(); 
                      }}
                      className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                  />
              </div>
          </div>
      </div>

    </div>
    </>
  );
}

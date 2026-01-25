import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import type { Submission } from '../types';

interface PlayerContextType {
  currentTrack: Submission | null;
  isPlaying: boolean;
  queue: Submission[];
  play: (track: Submission, newQueue?: Submission[]) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  currentTime: number;
  duration: number;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Submission | null>(null);
  const [queue, setQueue] = useState<Submission[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Audio Element
  useEffect(() => {
    audioRef.current = new Audio();
    
    const audio = audioRef.current;

    const handleEnded = () => {
        setIsPlaying(false);
        next(); // Auto-advance
    };

    const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
        setDuration(audio.duration);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.pause();
    };
  }, []);

  // Handle Playback Logic when currentTrack changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrack) {
        audio.src = currentTrack.audioUrl;
        audio.play().then(() => setIsPlaying(true)).catch(e => console.error("Playback failed", e));
    } else {
        audio.pause();
        setIsPlaying(false);
    }
  }, [currentTrack]);

  // Handle Play/Pause Toggle
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying && audio.paused && currentTrack) {
        audio.play().catch(e => console.error(e));
    } else if (!isPlaying && !audio.paused) {
        audio.pause();
    }
  }, [isPlaying, currentTrack]);

  const play = (track: Submission, newQueue?: Submission[]) => {
    if (newQueue) {
        setQueue(newQueue);
    }
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const pause = () => setIsPlaying(false);
  const resume = () => setIsPlaying(true);

  const next = () => {
      if (!currentTrack || queue.length === 0) return;
      const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
      if (currentIndex < queue.length - 1) {
          setCurrentTrack(queue[currentIndex + 1]);
      } else {
          // Loop or stop? For now stop.
          setIsPlaying(false);
      }
  };

  const prev = () => {
    if (!currentTrack || queue.length === 0) return;
    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    if (currentIndex > 0) {
        setCurrentTrack(queue[currentIndex - 1]);
    } else {
        // Restart track
        if (audioRef.current) audioRef.current.currentTime = 0;
    }
  };
  
  const seek = (time: number) => {
      if (audioRef.current) {
          audioRef.current.currentTime = time;
          setCurrentTime(time);
      }
  }

  return (
    <PlayerContext.Provider value={{ 
        currentTrack, 
        isPlaying, 
        queue, 
        play, 
        pause, 
        resume, 
        next, 
        prev,
        seek,
        currentTime,
        duration
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}

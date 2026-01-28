import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import type { Submission } from '../types';

interface PlayerContextType {
  currentTrack: Submission | null;
  isPlaying: boolean;
  queue: Submission[];
  context?: { type: 'request' | 'playlist' | 'profile', id: string, name: string, link: string };
  play: (track: Submission, newQueue?: Submission[], context?: { type: 'request' | 'playlist' | 'profile', id: string, name: string, link: string }) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Submission | null>(null);
  const [queue, setQueue] = useState<Submission[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [context, setContext] = useState<PlayerContextType['context']>();
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Submission[]>(queue);
  const currentTrackRef = useRef<Submission | null>(currentTrack);

  // Keep refs in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // Initialize Audio Element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = volume;
    audioRef.current.muted = muted;
    
    const audio = audioRef.current;

    const handleEnded = () => {
        const q = queueRef.current;
        const c = currentTrackRef.current;
        
        if (c && q.length > 0) {
             const currentIndex = q.findIndex(t => t.id === c.id);
             if (currentIndex < q.length - 1) {
                 setCurrentTrack(q[currentIndex + 1]);
                 return;
             }
        }
        setIsPlaying(false);
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
        if (isPlaying) setIsPlaying(false);
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

  // Handle Volume/Mute changes
  useEffect(() => {
      if (audioRef.current) {
          audioRef.current.volume = volume;
          audioRef.current.muted = muted;
      }
  }, [volume, muted]);

  const play = (track: Submission, newQueue?: Submission[], newContext?: PlayerContextType['context']) => {
    if (newQueue) {
        setQueue(newQueue);
    }
    if (newContext) {
        setContext(newContext);
    }
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const pause = () => setIsPlaying(false);
  const resume = () => setIsPlaying(true);
  const toggleMute = () => setMuted(prev => !prev);

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
        context,
        play, 
        pause, 
        resume, 
        next, 
        prev,
        seek,
        currentTime,
        duration,
        volume,
        muted,
        setVolume,
        toggleMute
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

import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import type { Submission } from '../types';
import { fixUrl } from '../lib/url';
import { useListenedTracks } from '../hooks/useListenedTracks';

interface PlayerContextType {
  currentTrack: Submission | null;
  isPlaying: boolean;
  queue: Submission[];
  context?: { type: 'request' | 'playlist' | 'profile', id: string, name: string, link: string, artworkUrl?: string };
  play: (track: Submission, newQueue?: Submission[], context?: { type: 'request' | 'playlist' | 'profile', id: string, name: string, link: string, artworkUrl?: string }) => void;
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
  const [currentTrack, setCurrentTrack] = useState<Submission | null>(() => {
    try {
      const saved = localStorage.getItem('player_currentTrack');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [queue, setQueue] = useState<Submission[]>(() => {
    try {
      const saved = localStorage.getItem('player_queue');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [context, setContext] = useState<PlayerContextType['context']>(() => {
    try {
      const saved = localStorage.getItem('player_context');
      return saved ? JSON.parse(saved) : undefined;
    } catch { return undefined; }
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => {
    try {
      const saved = localStorage.getItem('player_currentTime');
      return saved ? parseFloat(saved) : 0;
    } catch { return 0; }
  });
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Submission[]>(queue);
  const currentTrackRef = useRef<Submission | null>(currentTrack);
  const contextRef = useRef<PlayerContextType['context']>(context);
  const initialTimeLoadedRef = useRef(false);
  const lastSavedTimeRef = useRef(currentTime);
  
  const { markAsListened } = useListenedTracks();
  const markAsListenedRef = useRef(markAsListened);
  useEffect(() => { markAsListenedRef.current = markAsListened; }, [markAsListened]);

  // Keep refs in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { contextRef.current = context; }, [context]);

  // Persist state
  useEffect(() => {
    localStorage.setItem('player_currentTrack', JSON.stringify(currentTrack));
    localStorage.setItem('player_queue', JSON.stringify(queue));
    localStorage.setItem('player_context', JSON.stringify(context));
  }, [currentTrack, queue, context]);

  // Initialize Audio Element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.preload = "metadata"; // Ensure metadata loads for duration
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
        // Save time occasionally to avoid spamming localStorage
        if (Math.abs(audio.currentTime - lastSavedTimeRef.current) > 2) {
             localStorage.setItem('player_currentTime', audio.currentTime.toString());
             lastSavedTimeRef.current = audio.currentTime;
        }

        // Mark as listened if > 80% played
        if (audio.duration > 0 && (audio.currentTime / audio.duration) >= 0.8) {
             const trackId = currentTrackRef.current?.id;
             if (trackId) {
                  markAsListenedRef.current(trackId);
             }
        }
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
        const url = fixUrl(currentTrack.audioUrl);
        if (url) {
            if (audio.src !== url) {
                audio.src = url;
                
                if (!initialTimeLoadedRef.current) {
                    const savedTime = localStorage.getItem('player_currentTime');
                    if (savedTime) {
                        const parsedTime = parseFloat(savedTime);
                        audio.currentTime = parsedTime;
                        setCurrentTime(parsedTime);
                        lastSavedTimeRef.current = parsedTime;
                    }
                    initialTimeLoadedRef.current = true;
                } else {
                    audio.currentTime = 0;
                    localStorage.setItem('player_currentTime', '0');
                    lastSavedTimeRef.current = 0;
                }

                if (isPlaying) {
                    audio.play().then(() => {
                        updateMediaSession();
                    }).catch(e => console.error("Playback failed", e));
                }
            } else if (isPlaying && audio.paused) {
                audio.play().then(() => {
                    updateMediaSession();
                }).catch(e => console.error("Playback failed", e));
            }
        } else {
            console.warn("Track has no valid audio URL:", currentTrack);
            setIsPlaying(false);
        }
    } else {
        audio.pause();
        if (isPlaying) setIsPlaying(false);
    }
  }, [currentTrack, markAsListened]); // Removed isPlaying from deps to prevent unwanted triggers, handled below

  // Handle Play/Pause Toggle separate from track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying && audio.paused && currentTrack && audio.src === fixUrl(currentTrack.audioUrl)) {
        audio.play().catch(e => console.error(e));
    } else if (!isPlaying && !audio.paused) {
        audio.pause();
        localStorage.setItem('player_currentTime', audio.currentTime.toString()); // Save exact time on pause
        lastSavedTimeRef.current = audio.currentTime;
    }
    updateMediaSessionState();
  }, [isPlaying, currentTrack]);

  // Update Media Session Metadata & Handlers
  const updateMediaSession = () => {
      if (!currentTrack || !('mediaSession' in navigator)) return;
      
      const artworkUrl = currentTrack.artworkUrl || contextRef.current?.artworkUrl || '/mewlogo.png';

      navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.byline || 'Unknown Artist',
          artwork: [{ src: fixUrl(artworkUrl), sizes: '512x512', type: 'image/jpeg' }]
      });

      navigator.mediaSession.setActionHandler('play', () => resume());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
              seek(details.seekTime);
          }
      });
  };

  const updateMediaSessionState = () => {
      if (!('mediaSession' in navigator)) return;
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  };


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
    // If selecting a different track, initial load logic is over
    initialTimeLoadedRef.current = true;
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const pause = () => setIsPlaying(false);
  const resume = () => {
      // If we are resuming after page load, initial load logic is over
      initialTimeLoadedRef.current = true;
      setIsPlaying(true);
  };
  const toggleMute = () => setMuted(prev => !prev);

  const next = () => {
      initialTimeLoadedRef.current = true;
      if (!currentTrack || queue.length === 0) return;
      const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
      if (currentIndex < queue.length - 1) {
          setCurrentTrack(queue[currentIndex + 1]);
          setIsPlaying(true);
      } else {
          setIsPlaying(false);
      }
  };

  const prev = () => {
    initialTimeLoadedRef.current = true;
    if (!currentTrack || queue.length === 0) return;
    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    if (currentIndex > 0) {
        setCurrentTrack(queue[currentIndex - 1]);
        setIsPlaying(true);
    } else {
        // Restart track
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            setIsPlaying(true);
        }
    }
  };
  
  const seek = (time: number) => {
      if (audioRef.current) {
          audioRef.current.currentTime = time;
          setCurrentTime(time);
          localStorage.setItem('player_currentTime', time.toString());
          lastSavedTimeRef.current = time;
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

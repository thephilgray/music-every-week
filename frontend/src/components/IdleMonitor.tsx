import { useEffect, useState, useRef } from 'react';
import { useGun } from '../contexts/GunContext';
import { usePlayer } from '../contexts/PlayerContext';

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export function IdleMonitor() {
  const { isConnected, disconnect, reconnect } = useGun();
  const { isPlaying } = usePlayer();
  const lastActivityRef = useRef(0);
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdle) {
        console.log('User active: Reconnecting...');
        setIsIdle(false);
        if (!isConnected) {
            reconnect();
        }
      }
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastActivityRef.current > IDLE_TIMEOUT) {
        if (!isIdle) {
            console.log('User idle: Checking disconnect conditions...');
            setIsIdle(true);
            if (!isPlaying) {
                console.log('Audio not playing: Disconnecting...');
                disconnect();
            } else {
                console.log('Audio playing: Keeping connection alive.');
            }
        } else {
            // Already idle, check if we need to disconnect (in case music stopped while idle)
            if (!isPlaying && isConnected) {
                console.log('Audio stopped while idle: Disconnecting...');
                disconnect();
            }
        }
      }
    }, 10000); // Check every 10 seconds

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearInterval(interval);
    };
  }, [isIdle, isPlaying, isConnected, disconnect, reconnect]);

  if (!isConnected) {
    return (
      <div className="fixed bottom-4 right-4 bg-yellow-900/90 text-yellow-200 px-4 py-2 rounded-full text-sm font-medium shadow-lg backdrop-blur-sm z-50 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
        Network Paused (Idle)
      </div>
    );
  }

  // Optional: Show a "Connecting..." state if we wanted to track "isReconnecting"
  // But since reconnect() is synchronous in our context (just setting opts), 
  // the visual feedback is the disappearance of the "Paused" badge.

  return null;
}

import { useEffect, useState, useRef } from 'react';

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export function IdleMonitor() {
  const lastActivityRef = useRef(0);
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdle) {
        console.log('User active.');
        setIsIdle(false);
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
            console.log('User idle.');
            setIsIdle(true);
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
  }, [isIdle]); // isPlaying is no longer a dependency

  return null;
}

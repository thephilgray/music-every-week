import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { WatchParty } from '../types';

export function useWatchPartySync(partyId: string | undefined) {
  const [party, setParty] = useState<WatchParty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!partyId) {
      setLoading(false);
      return;
    }

    const partyRef = doc(db, 'watchParties', partyId);
    const unsubscribe = onSnapshot(
      partyRef,
      (doc) => {
        if (doc.exists()) {
          setParty({ id: doc.id, ...doc.data() } as WatchParty);
        } else {
          setParty(null);
          setError(new Error('Watch party not found'));
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to watch party:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [partyId]);

  const calculateOffset = useCallback(() => {
    if (!party) return 0;
    
    const pausedMs = party.pausedOffset || 0;

    if (party.status !== 'live' || !party.trackStartTime) {
      return pausedMs / 1000;
    }
    
    // Normalize timestamp depending on what FieldValue resolves to or if it's raw ms
    let startTimeMs = 0;
    if (typeof party.trackStartTime === 'number') {
        startTimeMs = party.trackStartTime; 
    } else if (party.trackStartTime && (party.trackStartTime as any).toMillis) {
        startTimeMs = (party.trackStartTime as any).toMillis();
    }

    if (startTimeMs === 0) return pausedMs / 1000;

    const now = Date.now();
    const elapsedTimeSinceResumeMs = Math.max(0, now - startTimeMs);
    const totalOffsetMs = elapsedTimeSinceResumeMs + pausedMs;
    
    return totalOffsetMs / 1000; // Return seconds for the audio player
  }, [party]);

  return {
    party,
    loading,
    error,
    calculateOffset,
    status: party?.status || 'ended',
    currentIndex: party?.currentIndex || 0
  };
}

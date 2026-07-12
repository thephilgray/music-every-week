import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { safeGetItem, safeSetItem } from '../lib/storage';

export function useListenedTracks() {
    const { participantEmail, addPoints } = useAuth();
    const key = `listenedTracks_${participantEmail || 'anonymous'}`;
    
    const [listenedTracks, setListenedTracks] = useState<Set<string>>(() => {
        try {
            const saved = safeGetItem(key);
            if (saved) {
                return new Set(JSON.parse(saved));
            }
        } catch {}
        return new Set();
    });

    useEffect(() => {
        try {
            const saved = safeGetItem(key);
            if (saved) {
                setListenedTracks(new Set(JSON.parse(saved)));
            } else {
                setListenedTracks(new Set());
            }
        } catch {}
    }, [key]);

    const markAsListened = useCallback((trackId: string) => {
        setListenedTracks(prev => {
            if (prev.has(trackId)) return prev;
            const next = new Set(prev);
            next.add(trackId);
            safeSetItem(key, JSON.stringify(Array.from(next)));
            
            // Award points for listening!
            if (addPoints) {
                addPoints(1);
            }
            
            return next;
        });
    }, [key, addPoints]);

    const toggleListened = useCallback((trackId: string) => {
        setListenedTracks(prev => {
            const next = new Set(prev);
            if (next.has(trackId)) {
                next.delete(trackId);
            } else {
                next.add(trackId);
            }
            safeSetItem(key, JSON.stringify(Array.from(next)));
            return next;
        });
    }, [key]);

    return { listenedTracks, markAsListened, toggleListened };
}

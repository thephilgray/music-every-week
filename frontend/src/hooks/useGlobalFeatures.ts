import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { GlobalFeatureConfig } from '../types';

export function useGlobalFeatures() {
  const [features, setFeatures] = useState<Required<GlobalFeatureConfig>>({
    live: true,
    community: true,
    activityFeed: true,
    eventsCalendar: true,
    directory: true,
    playerNormalization: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const configRef = doc(db, 'config', 'global');
    const unsub = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GlobalFeatureConfig;
        setFeatures({
          live: data.live !== false,
          community: data.community !== false,
          activityFeed: data.activityFeed !== false,
          eventsCalendar: data.eventsCalendar !== false,
          directory: data.directory !== false,
          playerNormalization: data.playerNormalization !== false,
        });
      }
      setLoading(false);
    }, (error) => {
      console.error("Failed to load global feature config:", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { features, loading };
}

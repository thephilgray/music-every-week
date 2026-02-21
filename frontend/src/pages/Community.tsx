import { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { Skeleton } from '../components/ui/Skeleton';
import { FeedItemRow, type FeedItemData } from '../components/FeedItemRow';

export function Community() {
  const { gun, user } = useGun();
  const [feed, setFeed] = useState<FeedItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAI, setFilterAI] = useState(false);

  useEffect(() => {
      let isMounted = true;
      let updateTimeout: ReturnType<typeof setTimeout> | null = null;
      
      // Load Filter AI setting
      if (user) {
          user.get('settings').get('content').get('filterAI').on((data: any) => {
              if (isMounted) setFilterAI(!!data);
          });
      }

      const feedMap = new Map<string, FeedItemData>();

      const updateFeedState = () => {
          if (!isMounted) return;
          setFeed(Array.from(feedMap.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100));
          setLoading(false);
          updateTimeout = null;
      };

      const triggerUpdate = () => {
          if (!updateTimeout) {
              updateTimeout = setTimeout(updateFeedState, 100); // Debounce 100ms
          }
      };

      // Helper to process feed item
      const processItem = (data: any, key: string) => {
          if (!isMounted) return;

          if (data && data.text) {
              const item: FeedItemData = { ...data, id: key };
              feedMap.set(key, item);
              triggerUpdate();
          } else if (data === null) {
              // Handle deletion
              feedMap.delete(key);
              triggerUpdate();
          }
      };

      // Time-Bucketing: Subscribe to Today and Yesterday
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const dates = [
          today.toISOString().split('T')[0],
          yesterday.toISOString().split('T')[0]
      ];

      dates.forEach(dateStr => {
          const bucketKey = `global_pulse_${dateStr}`;
          // 1. Subscribe to Global Pulse
          gun.get(bucketKey).map().on(processItem);
      });

      // 2. Subscribe to Participated Requests Pulse
      if (user) {
          user.get('participation').map().on((status: string, reqId: string) => {
              if (!isMounted) return;
              if (status === 'accepted' || status === 'joined' || status === 'invited') { 
                  dates.forEach(dateStr => {
                      const reqBucket = `request_pulse_${reqId}_${dateStr}`;
                      gun.get(reqBucket).map().on(processItem);
                  });
              }
          });
      }
      
      const timer = setTimeout(() => {
          if (isMounted) setLoading(false);
      }, 2000);
      
      return () => {
          isMounted = false;
          clearTimeout(timer);
          if (updateTimeout) clearTimeout(updateTimeout);
      };
  }, [gun, user]);

  const filteredFeed = feed.filter(item => {
      if (filterAI && item.usesAI) return false;
      return true;
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Community Feed</h1>
            <p className="text-gray-400">See what's happening across all your requests.</p>
        </div>

        {loading && filteredFeed.length === 0 ? (
             <div className="space-y-4">
                 {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
             </div>
        ) : filteredFeed.length === 0 ? (
             <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-800">
                 <MessageSquare className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                 <p className="text-gray-500">No submission activity yet.</p>
             </div>
        ) : (
            <div className="space-y-4">
                {filteredFeed.map(item => (
                    <FeedItemRow key={item.id} item={item} />
                ))}
            </div>
        )}
    </div>
  );
}

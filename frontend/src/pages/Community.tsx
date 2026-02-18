import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Music, User } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { Skeleton } from '../components/ui/Skeleton';

interface FeedItem {
    id: string;
    type: 'comment' | 'submission';
    text: string;
    authorPub: string;
    submissionId: string;
    requestId: string;
    submissionTitle: string;
    requestTitle: string;
    createdAt: number;
    authorAlias?: string;
    authorAvatar?: string;
    usesAI?: boolean;
}

export function Community() {
  const { gun, user } = useGun();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAI, setFilterAI] = useState(false);

  useEffect(() => {
      // Load Filter AI setting
      if (user) {
          user.get('settings').get('content').get('filterAI').on((data: any) => {
              setFilterAI(!!data);
          });
      }

      const feedMap = new Map<string, FeedItem>();
      
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
          
          // Helper to process feed item
          const processItem = (data: any, key: string) => {
              if (data && data.text) {
                  const item: FeedItem = { ...data, id: key };
                  
                  // Resolve Author Profile
                  gun.get('all_users').get(data.authorPub).once((u: any) => {
                      if (u) {
                          setFeed(_prev => {
                               // Update existing or add new
                               feedMap.set(key, { ...item, authorAlias: u.alias, authorAvatar: u.avatarUrl });
                               return Array.from(feedMap.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
                          });
                      }
                  });

                  feedMap.set(key, item);
                  setFeed(Array.from(feedMap.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100));
                  setLoading(false);
              } else if (data === null) {
                  // Handle deletion
                  feedMap.delete(key);
                  setFeed(Array.from(feedMap.values()).sort((a, b) => b.createdAt - a.createdAt));
              }
          };

          // 1. Subscribe to Global Pulse
          gun.get(bucketKey).map().on(processItem);

          // 2. Subscribe to Participated Requests Pulse
          if (user) {
              user.get('participation').map().on((status: string, reqId: string) => {
                  if (status === 'accepted' || status === 'joined' || status === 'invited') { // Include invited? Maybe just accepted.
                      const reqBucket = `request_pulse_${reqId}_${dateStr}`;
                      gun.get(reqBucket).map().on(processItem);
                  }
              });
          }
      });
      
      const timer = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(timer);
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
                    <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 flex gap-2 md:gap-4 hover:border-gray-700 transition">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                            <Link to={`/profile/${item.authorPub}`}>
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gray-800 overflow-hidden">
                                    {item.authorAvatar ? (
                                        <img src={item.authorAvatar} alt={item.authorAlias} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-500"><User className="w-4 h-4 md:w-5 md:h-5" /></div>
                                    )}
                                </div>
                            </Link>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1 gap-1 md:gap-0">
                                <div className="text-sm">
                                    <Link to={`/profile/${item.authorPub}`} className="font-bold text-white hover:underline">
                                        {item.authorAlias || 'Unknown User'}
                                    </Link>
                                    <span className="text-gray-500 ml-1">
                                        {item.type === 'submission' ? 'uploaded a track' : 'commented on'}
                                    </span>
                                </div>
                                <span className="text-xs text-gray-600 whitespace-nowrap self-end md:self-auto">{new Date(item.createdAt).toLocaleDateString()}</span>
                            </div>

                            <div className="bg-gray-950 rounded-lg p-3 mb-2 border border-gray-800/50 flex items-center gap-3">
                                {item.type === 'submission' && (
                                    <div className="w-8 h-8 bg-blue-900/20 rounded flex items-center justify-center text-blue-500 flex-shrink-0">
                                        <Music className="w-4 h-4" />
                                    </div>
                                )}
                                <p className="text-gray-300 text-sm line-clamp-3 italic">{item.text.replace('Submitted a new track: ', '')}</p>
                            </div>

                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-xs text-gray-500 mt-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Music className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{item.submissionTitle}</span>
                                    <span className="flex-shrink-0">in</span>
                                    <Link to={`/request/${item.requestId}`} className="text-blue-400 hover:underline truncate max-w-[150px]">
                                        {item.requestTitle}
                                    </Link>
                                </div>
                                
                                <div className="md:flex-1" />
                                
                                <Link 
                                    to={`/request/${item.requestId}?submission=${item.submissionId}${item.type === 'comment' ? `&comment=${item.id}` : ''}`}
                                    className="flex items-center gap-1 text-gray-400 hover:text-white transition self-end md:self-auto"
                                >
                                    {item.type === 'submission' ? 'View Track' : 'View Thread'}
                                </Link>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
}

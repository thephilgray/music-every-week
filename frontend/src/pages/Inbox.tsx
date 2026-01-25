import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageSquare, Music, UserPlus, Check } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { Skeleton } from '../components/ui/Skeleton';
import type { Notification } from '../types';

export function Inbox() {
  const { user, pubKey } = useGun();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !pubKey) return;

    const notifsMap = new Map<string, Notification>();

    // Subscribe to inbox
    // We map over the inbox node
    user.get('inbox').map().on((data: any, key: string) => {
      // If data is null, it might have been deleted, but usually we just get the node
      if (data && data.type) { 
          const n: Notification = { ...data, id: key };
          notifsMap.set(key, n);
          
          // Sort by newest first
          const sorted = Array.from(notifsMap.values()).sort((a, b) => b.createdAt - a.createdAt);
          setNotifications(sorted);
          setLoading(false);
      }
    });
    
    // Timeout for loading state if empty (Gun doesn't tell us "done loading")
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);

  }, [user, pubKey]);

  const markAsRead = (n: Notification) => {
      if (!n.read) {
          user.get('inbox').get(n.id).get('read').put(true);
      }
  };

  const handleNotificationClick = (n: Notification) => {
      markAsRead(n);
      navigate(n.link);
  };

  const markAllRead = () => {
      notifications.forEach(n => {
          if (!n.read) {
               user.get('inbox').get(n.id).get('read').put(true);
          }
      });
  };

  const getIcon = (type: string) => {
      switch (type) {
          case 'comment': return <MessageSquare className="w-5 h-5 text-blue-400" />;
          case 'submission': return <Music className="w-5 h-5 text-green-400" />;
          case 'invite': return <UserPlus className="w-5 h-5 text-purple-400" />;
          default: return <Bell className="w-5 h-5 text-gray-400" />;
      }
  };

  if (!pubKey) {
      return (
          <div className="flex items-center justify-center h-full text-gray-500">
              Please login to view notifications.
          </div>
      );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Bell className="w-6 h-6" />
              Inbox
          </h1>
          {notifications.some(n => !n.read) && (
              <button 
                onClick={markAllRead}
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                  <Check className="w-4 h-4" />
                  Mark all read
              </button>
          )}
      </div>

      {loading && notifications.length === 0 ? (
          <div className="space-y-4">
              {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
          </div>
      ) : notifications.length === 0 ? (
          <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-800">
              <Bell className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500">No notifications yet.</p>
          </div>
      ) : (
          <div className="space-y-2">
              {notifications.map(n => (
                  <div 
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`
                        group flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all
                        ${n.read 
                            ? 'bg-gray-950 border-gray-900 opacity-60 hover:opacity-100' 
                            : 'bg-gray-900 border-gray-800 hover:border-gray-700 shadow-sm'
                        }
                    `}
                  >
                      <div className={`p-2 rounded-full ${n.read ? 'bg-gray-900' : 'bg-gray-800'}`}>
                          {getIcon(n.type)}
                      </div>
                      
                      <div className="flex-1">
                          <p className={`text-sm ${n.read ? 'text-gray-400' : 'text-gray-200 font-medium'}`}>
                              {n.message}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                              {new Date(n.createdAt).toLocaleDateString()} at {new Date(n.createdAt).toLocaleTimeString()}
                          </p>
                      </div>

                      {!n.read && (
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      )}
                  </div>
              ))}
          </div>
      )}
    </div>
  );
}
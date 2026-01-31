import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageSquare, Music, UserPlus, Check, X, CheckCircle } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { Skeleton } from '../components/ui/Skeleton';
import type { Notification } from '../types';

export function Inbox() {
  const { user, pubKey, gun } = useGun();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<(Notification & { fromAlias?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Privacy & Contacts
  const [acceptUnsolicited, setAcceptUnsolicited] = useState(true);
  const [contacts, setContacts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !pubKey) return;

    // 1. Load Privacy Settings
    user.get('settings').get('privacy').get('acceptUnsolicited').on((data: any) => {
        setAcceptUnsolicited(data === false ? false : true);
    });

    // 2. Load Contacts
    user.get('contacts').map().on((data: any, pub: string) => {
        if (data) {
            setContacts(prev => new Set(prev).add(pub));
        }
    });

    const notifsMap = new Map<string, Notification & { fromAlias?: string }>();

    const updateState = () => {
        // Sort: Priority (Invite > Submission > Comment) then Date (Newest first)
        const sorted = Array.from(notifsMap.values()).sort((a, b) => {
            const priority = { invite: 3, submission: 2, comment: 1 };
            const pA = priority[a.type as keyof typeof priority] || 0;
            const pB = priority[b.type as keyof typeof priority] || 0;
            
            if (pA !== pB) return pB - pA; // Higher priority first
            return b.createdAt - a.createdAt; // Then newest first
        });
        setNotifications(sorted);
        setLoading(false);
    };

    // Subscribe to inbox
    gun.get('inboxes').get(pubKey).map().on((data: any, key: string) => {
      // If data is null, it might have been deleted, but usually we just get the node
      if (data && data.type) { 
          // Check if we already have this notification and its alias
          const existing = notifsMap.get(key);
          const n: Notification & { fromAlias?: string } = { ...data, id: key, fromAlias: existing?.fromAlias };
          
          // If we don't have the alias yet, fetch it
          if (!n.fromAlias && n.fromPub) {
              gun.get('all_users').get(n.fromPub).once((u: any) => {
                  if (u && (u.alias || u.displayName)) {
                      // Update the specific notification in the map and trigger re-render
                      const updated = { ...n, fromAlias: u.displayName || u.alias };
                      notifsMap.set(key, updated);
                      updateState();
                  }
              });
          }

          notifsMap.set(key, n);
          updateState();
      }
    });
    
    // Timeout for loading state if empty (Gun doesn't tell us "done loading")
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);

  }, [user, pubKey, gun]);

  // Filter Notifications based on Privacy
  const filteredNotifications = notifications.filter(n => {
      if (n.type === 'invite' && !acceptUnsolicited) {
          // Only show if sender is a contact
          return contacts.has(n.fromPub);
      }
      return true;
  });

  const markAsRead = (n: Notification) => {
      if (!n.read && pubKey) {
          gun.get('inboxes').get(pubKey).get(n.id).get('read').put(true);
      }
  };

  const handleNotificationClick = (n: Notification) => {
      markAsRead(n);
      navigate(n.link);
  };

  const markAllRead = () => {
      if (!pubKey) return;
      filteredNotifications.forEach(n => {
          if (!n.read) {
               gun.get('inboxes').get(pubKey).get(n.id).get('read').put(true);
          }
      });
  };

  const handleAccept = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    if (!n.requestId || !pubKey) return;
    
    // Update status to accepted in User Graph
    user.get('participation').get(n.requestId).put('accepted');
    
    // Add sender to contacts (Implicit connection)
    if (n.fromPub) {
        user.get('contacts').get(n.fromPub).put(true);
    }

    markAsRead(n);
  };

  const handleDecline = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    if (!n.requestId || !pubKey) return;
    
    // Update status to declined in User Graph
    user.get('participation').get(n.requestId).put('declined');
    
    markAsRead(n);
  };

  const deleteNotification = (e: React.MouseEvent, n: Notification) => {
      e.stopPropagation();
      if (!pubKey) return;
      gun.get('inboxes').get(pubKey).get(n.id).put(null);
      setNotifications(prev => prev.filter(item => item.id !== n.id));
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
          {filteredNotifications.some(n => !n.read) && (
              <button 
                onClick={markAllRead}
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                  <Check className="w-4 h-4" />
                  Mark all read
              </button>
          )}
      </div>

      {loading && filteredNotifications.length === 0 ? (
          <div className="space-y-4">
              {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
          </div>
      ) : filteredNotifications.length === 0 ? (
          <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-800">
              <Bell className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500">No notifications yet.</p>
          </div>
      ) : (
          <div className="space-y-2">
              {filteredNotifications.map(n => (
                  <div 
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`
                        group flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all relative
                        ${n.read 
                            ? 'bg-gray-950 border-gray-900 opacity-60 hover:opacity-100' 
                            : 'bg-gray-900 border-gray-800 hover:border-gray-700 shadow-sm'
                        }
                    `}
                  >
                      <div className={`hidden md:block p-2 rounded-full ${n.read ? 'bg-gray-900' : 'bg-gray-800'}`}>
                          {getIcon(n.type)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                              <div className="flex items-center gap-2">
                                  {/* Sender Alias Display */}
                                  <span className="font-bold text-white text-sm truncate max-w-[150px]">
                                      {n.fromAlias || 'Someone'}
                                  </span>
                                  <span className="text-gray-500 text-xs">•</span>
                                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                                      {n.type}
                                  </span>
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap ml-2 mr-6 md:mr-0">
                                  {new Date(n.createdAt).toLocaleDateString()}
                              </span>
                          </div>
                          
                          <p className={`text-sm mb-3 break-words ${n.read ? 'text-gray-500' : 'text-gray-300 font-medium'}`}>
                              {n.message}
                          </p>
                          
                          {/* Invite Actions */}
                          {n.type === 'invite' && !n.read && (
                              <div className="flex gap-2 mt-3">
                                  <button 
                                    onClick={(e) => handleAccept(e, n)}
                                    className="bg-green-900/50 hover:bg-green-800 text-green-200 text-xs px-3 py-1.5 rounded border border-green-800 flex items-center gap-1 transition-colors"
                                  >
                                      <CheckCircle className="w-3 h-3" /> Accept
                                  </button>
                                  <button 
                                    onClick={(e) => handleDecline(e, n)}
                                    className="bg-red-900/50 hover:bg-red-800 text-red-200 text-xs px-3 py-1.5 rounded border border-red-800 flex items-center gap-1 transition-colors"
                                  >
                                      <X className="w-3 h-3" /> Decline
                                  </button>
                              </div>
                          )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        {!n.read && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                        )}
                        <button 
                            onClick={(e) => deleteNotification(e, n)}
                            className="text-gray-600 hover:text-red-500 p-1 md:opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 md:relative md:top-auto md:right-auto"
                            title="Dismiss"
                        >
                            <X className="w-4 h-4" />
                        </button>
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
}

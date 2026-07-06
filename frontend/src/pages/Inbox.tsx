import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageSquare, Music, UserPlus, Check, X, CheckCircle, AtSign, AlertCircle, Users, Send, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext'; // Changed to useAuth
import { Skeleton } from '../components/ui/Skeleton';
import type { Notification, UserProfile } from '../types'; // Added UserProfile for fetching sender alias
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore'; // Removed writeBatch
import { getTimestampAsNumber } from '../lib/utils'; // Import the utility

export function Inbox() {
  const { user, profile, participantEmail, isLoading: authLoading } = useAuth(); // Changed from useGun
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<(Notification & { fromAlias?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'invite' | 'submission' | 'comment' | 'mention' | 'bug' | 'message' | 'collaborator'>('all');
  
  // Bug Reply State
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Privacy & Contacts
  const [acceptUnsolicited, setAcceptUnsolicited] = useState(true);
  const [contacts, setContacts] = useState<Set<string>>(new Set());
  const [filterAI, setFilterAI] = useState(false);
  const isMounted = useRef(true); // Moved to top level

  // Define updateNotificationState inside Inbox, but outside useEffect
const updateNotificationState = useCallback(async (
    isMountedRef: React.MutableRefObject<boolean>, // Renamed for clarity
    currentNotifsMap: Map<string, Notification & { fromAlias?: string }>
) => {
    // Fetch aliases for all notifications in the map
    const uidsToFetch = new Set<string>();
    currentNotifsMap.forEach(n => {
        // Only fetch if we don't have a name and have a valid UID (not 'participant')
        if (!n.fromName && !n.fromAlias && n.fromUid && n.fromUid !== 'participant' && n.fromUid !== 'guest') {
            uidsToFetch.add(n.fromUid);
        }
    });

    if (uidsToFetch.size > 0) {
        const profilePromises = Array.from(uidsToFetch).map(async (uid) => {
            try {
                const profileDoc = await getDoc(doc(db, 'profiles', uid));
                if (profileDoc.exists()) {
                    const profileData = profileDoc.data() as UserProfile;
                    return { uid, alias: profileData.displayName || profileData.alias };
                }
            } catch (e) {
                console.error("Error fetching profile for notification sender:", uid, e);
            }
            return { uid, alias: 'Unknown' };
        });
        const profiles = await Promise.all(profilePromises);
        const aliasMap = new Map<string, string>();
        profiles.forEach(p => aliasMap.set(p.uid, p.alias));

        currentNotifsMap.forEach((n, key) => {
            if (!n.fromName && !n.fromAlias && n.fromUid && aliasMap.has(n.fromUid)) {
                currentNotifsMap.set(key, { ...n, fromAlias: aliasMap.get(n.fromUid) });
            }
        });
    }
    
    const sorted = Array.from(currentNotifsMap.values()).sort((a, b) => {
        const priority = { invite: 3, mention: 2, comment: 2, submission: 1, bug: 0 };
        const pA = priority[a.type as keyof typeof priority] || 0;
        const pB = priority[b.type as keyof typeof priority] || 0;
        
        if (pA !== pB) return pB - pA;
        return getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt); 
    });
    if (isMountedRef.current) { // Use ref for isMounted
        setNotifications(sorted);
        setLoading(false);
    }
  }, [setNotifications, setLoading]); // Dependencies for useCallback


  useEffect(() => {
    if (authLoading) return; // Wait for auth to resolve
    
    // If no user AND no participant email, we can't fetch anything.
    if (!user?.uid && !participantEmail) {
        setLoading(prev => {
            if (prev) return false;
            return prev;
        });
        return;
    }

    isMounted.current = true; // Ensure it's true on mount

    // 1. Subscribe to User Profile for settings (privacy, contacts, filterAI)
    // Only if we have a UID (Profiles are keyed by UID)
    let unsubscribeProfile = () => {};
    if (user?.uid) {
        const profileRef = doc(db, 'profiles', user.uid);
        unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
          if (!isMounted.current) return; // Use ref for isMounted
          if (docSnap.exists()) {
            const profileData = docSnap.data() as UserProfile;
            setAcceptUnsolicited(profileData.settings?.privacy?.acceptUnsolicited !== false); // Default to true
            setFilterAI(!!profileData.settings?.content?.filterAI);
            // Assuming contacts are stored as an array of UIDs in UserProfile
            setContacts(new Set(profileData.contacts || []));
          }
        });
    }

    const notifsMap = new Map<string, Notification & { fromAlias?: string }>();

    // 2. Subscribe to Notifications
    // Query by recipientUid (if user) AND recipientEmail (if available) to catch all
    const unsubs: (() => void)[] = [];

    const setupListeners = () => {
        if (!user?.uid && !participantEmail) return;

        const queries = [];

        // Query 1: By UID
        if (user?.uid) {
            queries.push(query(
                collection(db, 'notifications'),
                where('recipientUid', '==', user.uid),
                orderBy('createdAt', 'desc')
            ));
        }

        // Query 2: By Email (if available)
        const email = user?.email || participantEmail;
        if (email) {
            queries.push(query(
                collection(db, 'notifications'),
                where('recipientEmail', '==', email),
                orderBy('createdAt', 'desc')
            ));
        }

        queries.forEach(q => {
            const unsub = onSnapshot(q, (snapshot) => {
                if (!isMounted.current) return;
                snapshot.docChanges().forEach(change => {
                    const data = change.doc.data();
                    const notification: Notification & { fromAlias?: string } = {
                        ...data,
                        id: change.doc.id,
                        createdAt: getTimestampAsNumber(data.createdAt)
                    } as Notification & { fromAlias?: string };

                    if (change.type === 'added' || change.type === 'modified') {
                        notifsMap.set(change.doc.id, notification);
                    } else if (change.type === 'removed') {
                        notifsMap.delete(change.doc.id);
                    }
                });
                updateNotificationState(isMounted, notifsMap);
            }, (error) => {
                console.error("Error fetching notifications:", error);
            });
            unsubs.push(unsub);
        });
    };

    setupListeners();

    return () => {
        isMounted.current = false; // Use ref for isMounted
        unsubscribeProfile();
        unsubs.forEach(u => u());
    };


  }, [user, participantEmail, authLoading, updateNotificationState]); // Add updateNotificationState to dependencies

  const filteredNotifications = notifications.filter(n => {
    if (filterType !== 'all' && n.type !== filterType) return false;
    
    // Privacy filters
    if (!acceptUnsolicited && n.type === 'invite' && n.fromUid && !contacts.has(n.fromUid)) {
       return false;
    }

    // AI Content filter
    if (filterAI && n.usesAI) {
        return false;
    }
    
    return true;
  });

  const markAllRead = async () => {
    if (!user?.uid && !participantEmail) { // Allow participantEmail users to mark all read
        console.log("Mark all read: No authenticated user or participant email.");
        return;
    }
    
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) {
        console.log("No unread notifications to mark.");
        return;
    }

    console.log(`Attempting to mark ${unread.length} notifications as read individually to avoid batch failures.`);
    
    const updatePromises = unread.map(async (n) => {
        if (!n.id) return { status: 'rejected', id: n.id, error: 'No ID' };
        const ref = doc(db, 'notifications', n.id);
        try {
            await updateDoc(ref, { read: true });
            return { status: 'fulfilled', id: n.id };
        } catch (error) {
            console.error(`Failed to mark notification ${n.id} as read (it may have been deleted):`, error);
            return { status: 'rejected', id: n.id, error };
        }
    });

    await Promise.allSettled(updatePromises);
    console.log("Finished mark all read operation.");
  };

  const deleteNotification = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    if (!user?.uid && !participantEmail) return;
    if (!n.id) return;
    
    // Optimistic Update
    setNotifications(prev => prev.filter(item => item.id !== n.id));

    try {
        console.log(`Attempting to delete notification: ${n.id}`);
        await deleteDoc(doc(db, 'notifications', n.id));
        console.log(`Successfully deleted notification: ${n.id}`);
    } catch (err: unknown) { 
        const error = err as any;
        console.error("Error deleting notification:", error);
        if (error && typeof error === 'object' && 'code' in error && error.code === 'not-found') {
             // Already deleted
        } else {
             alert('Failed to delete notification.');
        }
    }
  };

  const handleNotificationClick = async (n: Notification) => {
      // Mark as read if not already
      if (!n.read && n.id) {
          try {
              await updateDoc(doc(db, 'notifications', n.id), { read: true });
              console.log(`Notification ${n.id} marked as read.`);
          } catch (error) {
              console.error(`Error marking notification ${n.id} read on click:`, error);
          }
      }

      // Navigate based on type
      if (n.link) {
          if (n.link.startsWith('http')) {
             window.open(n.link, '_blank');
          } else {
             navigate(n.link);
          }
      } else if (n.type === 'submission' || n.type === 'comment' || n.type === 'mention') {
          // Fallback if no link, try to construct one
           if (n.requestId) {
              navigate(`/prompt/${n.requestId}`);
           }
      }
  };

  const handleAccept = async (e: React.MouseEvent, n: Notification) => {
      e.stopPropagation();
      // Placeholder for invite acceptance logic
      console.log("Accepted invite:", n.id);
      // You would typically call a cloud function or update a document here
      // For now, let's just mark it read and maybe show a toast
      if (!n.read && n.id) {
         await updateDoc(doc(db, 'notifications', n.id), { read: true });
      }
  };

  const handleDecline = async (e: React.MouseEvent, n: Notification) => {
      e.stopPropagation();
      console.log("Declined invite:", n.id);
      // Logic to reject invite
      await deleteNotification(e, n);
  };

  const submitReply = async (e: React.MouseEvent | React.FormEvent, n: Notification) => {
      e.preventDefault();
      e.stopPropagation();
      if (!replyText.trim() || !n.fromUid) return;
      setSendingReply(true);

      try {
          const currentThread = n.thread || [{
              id: crypto.randomUUID(),
              fromUid: n.fromUid,
              fromName: n.fromName || (n.fromEmail ? n.fromEmail.split('@')[0] : 'User'),
              text: n.message,
              createdAt: typeof n.createdAt === 'number' ? n.createdAt : Date.now()
          }];

          const replyId = crypto.randomUUID();
          const senderUid = user?.uid || 'guest';
          const senderName = profile?.alias || (user?.email ? user.email.split('@')[0] : 'User');
          
          const newReply = {
              id: replyId,
              fromUid: senderUid,
              fromName: senderName,
              text: replyText,
              createdAt: Date.now()
          };

          const updatedThread = [...currentThread, newReply];

          const notification: Notification = {
              id: replyId,
              type: n.type,
              message: `New reply to ${n.type === 'bug' ? 'bug report' : 'message'}`,
              link: n.link || `/inbox`,
              fromUid: senderUid,
              fromName: senderName,
              createdAt: serverTimestamp() as any,
              read: false,
              thread: updatedThread
          };
          
          await addDoc(collection(db, 'notifications'), {
              ...notification,
              recipientUid: n.fromUid
          });
          
          setReplyingTo(null);
          setReplyText('');
          
          // Update the current notification with the new thread and mark as read
          if (n.id) {
              await updateDoc(doc(db, 'notifications', n.id), { 
                  thread: updatedThread,
                  read: true 
              });
          }
      } catch (err) {
          console.error("Failed to send reply:", err);
          alert("Failed to send reply.");
      } finally {
          setSendingReply(false);
      }
  };

  const getIcon = (type: string) => {
      switch (type) {
          case 'invite': return <UserPlus className="w-5 h-5 text-purple-400" />;
          case 'submission': return <Music className="w-5 h-5 text-blue-400" />;
          case 'comment': return <MessageSquare className="w-5 h-5 text-green-400" />;
          case 'mention': return <AtSign className="w-5 h-5 text-yellow-400" />;
          case 'bug': return <AlertCircle className="w-5 h-5 text-red-400" />;
          case 'message': return <MessageSquare className="w-5 h-5 text-blue-400" />;
          case 'collaborator': return <Users className="w-5 h-5 text-purple-400" />;
          default: return <Bell className="w-5 h-5 text-gray-400" />;
      }
  };

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

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {(['all', 'invite', 'submission', 'comment', 'mention', 'bug', 'message', 'collaborator'] as const).map(type => (
              <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition whitespace-nowrap capitalize ${
                      filterType === type 
                          ? 'bg-blue-600 border-blue-500 text-white' 
                          : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white'
                  }`}
              >
                  {type === 'all' ? 'All' : `${type}s`}
              </button>
          ))}
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
                                      {n.fromName || n.fromAlias || (n.fromEmail ? n.fromEmail.split('@')[0] : 'Someone')}
                                  </span>
                                  <span className="text-gray-500 text-xs">•</span>
                                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                                      {n.type}
                                  </span>
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap ml-2 mr-6 md:mr-0">
                                  {new Date(n.createdAt as number).toLocaleDateString()}
                              </span>
                          </div>
                          
                          {n.thread && n.thread.length > 0 ? (
                              <div className="flex flex-col gap-3 mt-4 mb-4" onClick={(e) => e.stopPropagation()}>
                                  {n.thread.map((msg, i) => (
                                      <div key={msg.id || i} className={`flex flex-col ${msg.fromUid === user?.uid ? 'items-end' : 'items-start'}`}>
                                          <div className={`max-w-[90%] rounded-xl p-3 ${msg.fromUid === user?.uid ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
                                              <span className="text-[10px] opacity-70 mb-1 block">
                                                  {msg.fromName} • {new Date(msg.createdAt).toLocaleString()}
                                              </span>
                                              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          ) : (
                              <p className={`text-sm mb-3 break-words ${n.read ? 'text-gray-500' : 'text-gray-300 font-medium'}`}>
                                  {n.message}
                              </p>
                          )}
                          
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

                          {/* Bug/Message Reply */}
                          {(n.type === 'bug' || n.type === 'message') && (
                              <div className="mt-3">
                                  {replyingTo === n.id ? (
                                      <div className="mt-2 flex flex-col gap-2 bg-gray-950 p-3 rounded border border-gray-800" onClick={e => e.stopPropagation()}>
                                          <textarea 
                                              value={replyText}
                                              onChange={e => setReplyText(e.target.value)}
                                              placeholder="Type your reply..."
                                              className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm outline-none focus:border-blue-500 min-h-[60px]"
                                              autoFocus
                                          />
                                          <div className="flex justify-end gap-2">
                                              <button 
                                                  onClick={() => setReplyingTo(null)}
                                                  className="px-3 py-1 text-xs text-gray-400 hover:text-white transition"
                                                  disabled={sendingReply}
                                              >
                                                  Cancel
                                              </button>
                                              <button 
                                                  onClick={(e) => submitReply(e, n)}
                                                  disabled={sendingReply || !replyText.trim()}
                                                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                                              >
                                                  {sendingReply ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                                  Reply
                                              </button>
                                          </div>
                                      </div>
                                  ) : (
                                      <button 
                                          onClick={(e) => { e.stopPropagation(); setReplyingTo(n.id!); setReplyText(''); }}
                                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                      >
                                          <MessageSquare className="w-3 h-3" /> Reply
                                      </button>
                                  )}
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

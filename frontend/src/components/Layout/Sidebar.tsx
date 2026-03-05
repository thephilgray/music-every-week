import { useState, useEffect, useMemo } from 'react';
import { Home, Inbox, Layers, Users, User, Settings, X, ListMusic, Bug, Globe } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BugReportModal } from '../BugReportModal';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, participantEmail, settings } = useAuth();
  
  const [notifDocs, setNotifDocs] = useState<Record<string, any>>({});
  const [accessibleRequestIds, setAccessibleRequestIds] = useState<Set<string>>(new Set());
  const [subDocs, setSubDocs] = useState<QueryDocumentSnapshot<DocumentData, DocumentData>[]>([]);
  const [commDocs, setCommDocs] = useState<QueryDocumentSnapshot<DocumentData, DocumentData>[]>([]);
  
  const [showBugReport, setShowBugReport] = useState(false);

  // 1. Notifications Listener (Inbox)
  useEffect(() => {
    if (!user && !participantEmail) {
        setNotifDocs({});
        return;
    }

    const unsubs: (() => void)[] = [];
    const docsByQuery: Record<string, Record<string, any>> = {};

    const updateNotifState = () => {
        const merged: Record<string, any> = {};
        Object.values(docsByQuery).forEach(map => {
            Object.assign(merged, map);
        });
        setNotifDocs(merged);
    };

    if (user?.uid) {
        const q = query(
            collection(db, 'notifications'),
            where('recipientUid', '==', user.uid),
            where('read', '==', false)
        );
        unsubs.push(onSnapshot(q, (snap) => {
            const map: Record<string, any> = {};
            snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
            docsByQuery['uid'] = map;
            updateNotifState();
        }));
    }

    const email = user?.email || participantEmail;
    if (email) {
        const q = query(
            collection(db, 'notifications'),
            where('recipientEmail', '==', email),
            where('read', '==', false)
        );
        unsubs.push(onSnapshot(q, (snap) => {
            const map: Record<string, any> = {};
            snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
            docsByQuery['email'] = map;
            updateNotifState();
        }));
    }

    return () => unsubs.forEach(unsub => unsub());
  }, [user?.uid, user?.email, participantEmail]);

  // 2. Accessible Requests Listener
  useEffect(() => {
    if (!user && !participantEmail) {
        setAccessibleRequestIds(new Set());
        return;
    }

    const unsubs: (() => void)[] = [];
    const idsByQuery: Record<number, Set<string>> = {};
    const email = user?.email || participantEmail;
    const uid = user?.uid;

    const updateIds = () => {
        const merged = new Set<string>();
        Object.values(idsByQuery).forEach(set => {
            set.forEach(id => merged.add(id));
        });
        setAccessibleRequestIds(merged);
    };

    const reqQueries = [];
    if (uid) reqQueries.push(query(collection(db, 'requests'), where('ownerPub', '==', uid)));
    if (email) reqQueries.push(query(collection(db, 'requests'), where('accessList', 'array-contains', email)));
    reqQueries.push(query(collection(db, 'requests'), where('accessMode', '==', 'volunteer')));

    reqQueries.forEach((q, index) => {
        unsubs.push(onSnapshot(q, (snap) => {
            const ids = new Set<string>();
            snap.forEach(doc => {
                if (!doc.data().deleted) ids.add(doc.id);
            });
            idsByQuery[index] = ids;
            updateIds();
        }));
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [user?.uid, user?.email, participantEmail]);

  // 3. Community Content Listener (Submissions & Comments)
  useEffect(() => {
    if (!user && !participantEmail) {
        setSubDocs([]);
        setCommDocs([]);
        return;
    }

    const START_DATE = new Date('2026-03-03T00:00:00Z').getTime();
    
    let lastVisit = 0;
    if (profile?.lastCommunityVisit) {
        if (typeof profile.lastCommunityVisit === 'number') {
            lastVisit = profile.lastCommunityVisit;
        } else if ((profile.lastCommunityVisit as any).toMillis) {
            lastVisit = (profile.lastCommunityVisit as any).toMillis();
        } else if ((profile.lastCommunityVisit as any).seconds) {
            lastVisit = (profile.lastCommunityVisit as any).seconds * 1000;
        }
    }
    
    const effectiveStartDate = Math.max(START_DATE, lastVisit);

    const subQuery = query(
        collection(db, 'submissions'),
        where('createdAt', '>', new Date(effectiveStartDate)),
        orderBy('createdAt', 'desc')
    );

    const commQuery = query(
        collection(db, 'comments'),
        where('createdAt', '>', new Date(effectiveStartDate)),
        orderBy('createdAt', 'desc')
    );

    const unsubSub = onSnapshot(subQuery, (snap) => setSubDocs(snap.docs));
    const unsubComm = onSnapshot(commQuery, (snap) => setCommDocs(snap.docs));

    return () => {
        unsubSub();
        unsubComm();
    };
  }, [user?.uid, profile?.lastCommunityVisit]);

  // 4. Badge Calculations (Memoized for performance)
  const unreadCount = useMemo(() => {
      const filterAI = !!settings?.content?.filterAI;
      return Object.values(notifDocs).filter(data => !(filterAI && data.usesAI)).length;
  }, [notifDocs, settings?.content?.filterAI]);

  const communityUnreadCount = useMemo(() => {
      const readItems = profile?.readCommunityItems || {};
      const filterAI = !!settings?.content?.filterAI;

      const unreadSubs = subDocs.filter(d => {
          const data = d.data();
          return !readItems[d.id] && accessibleRequestIds.has(data.requestId) && !(filterAI && data.usesAI);
      }).length;

      const unreadComms = commDocs.filter(d => {
          const data = d.data();
          return !readItems[d.id] && accessibleRequestIds.has(data.requestId) && !(filterAI && data.usesAI);
      }).length;

      return unreadSubs + unreadComms;
  }, [subDocs, commDocs, accessibleRequestIds, profile?.readCommunityItems, settings?.content?.filterAI]);


  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: ListMusic, label: 'Playlists', path: '/playlists' },
    { icon: Globe, label: 'Community', path: '/feed', badge: communityUnreadCount },
    { icon: Inbox, label: 'Inbox', path: '/inbox', badge: unreadCount },
    { icon: Users, label: 'Directory', path: '/directory' },
    { icon: Layers, label: 'Creator Tools', path: '/creator' },
    { icon: User, label: 'Profile', path: '/profile' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  const handleNavigation = (path: string) => {
      if (onClose) onClose();
      setTimeout(() => navigate(path), 50);
  };

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      <div className="p-6 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-3" onClick={onClose}>
          <img src="/mewlogo.png" alt="MEW" className="h-8 w-auto" />
          <span className="font-bold text-xl tracking-tight text-white">MEW</span>
        </Link>
        <button 
          onClick={onClose}
          className="md:hidden text-gray-400 hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => handleNavigation(item.path)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors text-left ${
                isActive 
                  ? 'bg-blue-600/10 text-blue-500'  
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {item.badge > 99 ? '99+' : item.badge}
                  </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="pt-4 pb-4 px-4 border-t border-gray-800 mb-4 md:mb-20">
        <button 
            onClick={() => setShowBugReport(true)}
            className="w-full text-left px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition text-sm font-medium flex items-center gap-3"
        >
            <Bug className="w-5 h-5" />
            Report Bug
        </button>
      </div>
      
      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
    </div>
  );
}

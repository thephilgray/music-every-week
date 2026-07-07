import { useState, useEffect, useMemo } from 'react';
import { Home, Inbox, Layers, Users, Settings, X, ListMusic, Bug, Globe, Radio, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BugReportModal } from '../BugReportModal';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { BRAND_INFO } from '../../config/appConfig';
import { useGlobalFeatures } from '../../hooks/useGlobalFeatures';

interface SidebarProps {
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, participantEmail, settings, isAdmin } = useAuth();
  const { features } = useGlobalFeatures();
  
  const [notifDocs, setNotifDocs] = useState<Record<string, any>>({});
  const [accessibleRequestIds, setAccessibleRequestIds] = useState<Set<string>>(new Set());
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

  // 3. Community Content Listener (Comments Only)
  useEffect(() => {
    if (!user && !participantEmail) {
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

    const commQuery = query(
        collection(db, 'comments'),
        where('createdAt', '>', new Date(effectiveStartDate)),
        orderBy('createdAt', 'desc')
    );

    const unsubComm = onSnapshot(commQuery, (snap) => setCommDocs(snap.docs));

    return () => {
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

      const unreadComms = commDocs.filter(d => {
          const data = d.data();
          return !readItems[d.id] && accessibleRequestIds.has(data.requestId) && !(filterAI && data.usesAI);
      }).length;

      return unreadComms;
  }, [commDocs, accessibleRequestIds, profile?.readCommunityItems, settings?.content?.filterAI]);


  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: ListMusic, label: 'Playlists', path: '/playlists' },
    ...(features.live ? [{ icon: Radio, label: 'Live', path: '/live' }] : []),
    ...(features.community ? [{ icon: Globe, label: 'Community', path: '/feed', badge: communityUnreadCount }] : []),
    { icon: Inbox, label: 'Inbox', path: '/inbox', badge: unreadCount },
    ...(features.directory ? [{ icon: Users, label: 'Directory', path: '/directory' }] : []),
    { icon: Layers, label: 'Creator Tools', path: '/creator' },
    ...(isAdmin && features.live ? [{ icon: ListMusic, label: 'Party Hub', path: '/party' }] : []),
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  const handleNavigation = (path: string) => {
      if (onClose) onClose();
      setTimeout(() => navigate(path), 50);
  };

  return (
    <div className="w-full bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-hidden">
      <div className={`flex justify-between items-center min-h-[64px] border-b border-gray-800/40 md:border-b-0 transition-all duration-300 p-4 md:p-6 ${isCollapsed ? 'md:px-3 md:py-4' : ''}`}>
        <Link 
          to="/" 
          className="flex items-center gap-2.5 overflow-hidden flex-shrink-0" 
          onClick={onClose}
          title={BRAND_INFO.shortName}
        >
          <img src={BRAND_INFO.logoUrl} alt={BRAND_INFO.shortName} className="h-7 w-auto flex-shrink-0" />
          <span className={`font-bold text-xl tracking-tight text-white whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'md:hidden' : ''}`}>
            {BRAND_INFO.shortName}
          </span>
        </Link>
        
        <div className="flex items-center gap-1 flex-shrink-0">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              className="hidden md:flex p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>
          )}
          <button 
            onClick={onClose}
            className="md:hidden text-gray-400 hover:text-white p-1"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <nav className={`flex-1 px-4 ${isCollapsed ? 'md:px-2' : ''} py-3 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent transition-all duration-300`}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => handleNavigation(item.path)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center justify-between px-4 ${isCollapsed ? 'md:justify-center md:px-3' : ''} py-3 md:py-2.5 rounded-xl transition-all duration-200 text-left relative group ${
                isActive 
                  ? 'bg-blue-600/15 text-blue-400 font-semibold shadow-sm'  
                  : 'text-gray-400 hover:bg-gray-800/80 hover:text-gray-100'
              }`}
            >
              <div className={`flex items-center gap-3.5 ${isCollapsed ? 'md:gap-0 md:justify-center' : ''} overflow-hidden`}>
                  <item.icon className="w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  <span className={`font-medium whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'md:hidden' : ''}`}>
                    {item.label}
                  </span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                  isCollapsed ? (
                    <span className="hidden md:flex absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center shadow-sm border border-gray-900">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  ) : null
              )}
              {item.badge !== undefined && item.badge > 0 && (
                  <span className={`bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full ${isCollapsed ? 'md:hidden' : ''}`}>
                      {item.badge > 99 ? '99+' : item.badge}
                  </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className={`pt-3 pb-4 px-4 ${isCollapsed ? 'md:px-2' : ''} border-t border-gray-800/80 mb-4 md:mb-20 space-y-1.5 transition-all duration-300`}>
        <button 
            type="button"
            onClick={() => setShowBugReport(true)}
            title={isCollapsed ? "Report Bug" : undefined}
            className={`w-full text-left px-4 ${isCollapsed ? 'md:justify-center md:px-3' : ''} py-2.5 text-gray-400 hover:text-white hover:bg-gray-800/80 rounded-xl transition-all duration-200 text-sm font-medium flex items-center gap-3 ${isCollapsed ? 'md:justify-center md:gap-0' : ''} group`}
        >
            <Bug className="w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
            <span className={`whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'md:hidden' : ''}`}>Report Bug</span>
        </button>
      </div>
      
      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
    </div>
  );
}

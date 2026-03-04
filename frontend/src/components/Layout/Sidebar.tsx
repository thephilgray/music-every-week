import { useState, useEffect } from 'react';
import { Home, Inbox, Layers, Users, User, Settings, X, ListMusic, Bug, Globe } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BugReportModal } from '../BugReportModal';
import { db } from '../../lib/firebase'; // Added Firebase import
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore'; // Added Firestore imports

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, participantEmail } = useAuth(); // Destructure profile
  const [unreadCount, setUnreadCount] = useState(0);
  const [communityUnreadCount, setCommunityUnreadCount] = useState(0);
  const [showBugReport, setShowBugReport] = useState(false);

  useEffect(() => {
    // If auth is loading, or no user/participantEmail, return
    if (!user && !participantEmail) {
        setUnreadCount(0); 
        setCommunityUnreadCount(0);
        return;
    }

    const unsubs: (() => void)[] = [];
    const idsByQuery: Record<string, Set<string>> = {};
    
    const updateCount = () => {
        const combinedIds = new Set<string>();
        Object.values(idsByQuery).forEach(set => {
            set.forEach(id => combinedIds.add(id));
        });
        setUnreadCount(combinedIds.size);
    };

    if (user?.uid) {
        const q = query(
            collection(db, 'notifications'),
            where('recipientUid', '==', user.uid),
            where('read', '==', false)
        );
        unsubs.push(onSnapshot(q, (snapshot) => {
            idsByQuery['uid'] = new Set(snapshot.docs.map(d => d.id));
            updateCount();
        }, (error) => {
            console.error("Error fetching unread notifications (UID):", error);
        }));
    }

    const email = user?.email || participantEmail;
    if (email) {
        const q = query(
            collection(db, 'notifications'),
            where('recipientEmail', '==', email),
            where('read', '==', false)
        );
        unsubs.push(onSnapshot(q, (snapshot) => {
            idsByQuery['email'] = new Set(snapshot.docs.map(d => d.id));
            updateCount();
        }, (error) => {
            console.error("Error fetching unread notifications (Email):", error);
        }));
    }

    // Community Unread Logic
    if (user || participantEmail) {
        // Only start counting from March 3, 2026 to avoid 99+ on first load for old activity
        const START_DATE = new Date('2026-03-03T00:00:00Z').getTime();
        const readItems = profile?.readCommunityItems || {};

        const subQuery = query(
            collection(db, 'submissions'),
            where('createdAt', '>', new Date(START_DATE)),
            orderBy('createdAt', 'desc')
        );

        const commQuery = query(
            collection(db, 'comments'),
            where('createdAt', '>', new Date(START_DATE)),
            orderBy('createdAt', 'desc')
        );

        let subIds = new Set<string>();
        let commIds = new Set<string>();

        const updateCommCount = () => {
            // Count items that are NOT in the readItems map
            const unreadSubs = Array.from(subIds).filter(id => !readItems[id]).length;
            const unreadComms = Array.from(commIds).filter(id => !readItems[id]).length;
            setCommunityUnreadCount(unreadSubs + unreadComms);
        };

        unsubs.push(onSnapshot(subQuery, (snap) => {
            subIds = new Set(snap.docs.map(d => d.id));
            updateCommCount();
        }));

        unsubs.push(onSnapshot(commQuery, (snap) => {
            commIds = new Set(snap.docs.map(d => d.id));
            updateCommCount();
        }));
    }

    return () => unsubs.forEach(unsub => unsub());
  }, [user, participantEmail, profile?.readCommunityItems]); // Depend on readCommunityItems

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
      // Small delay to ensure sidebar close animation starts/state clears before heavy routing
      setTimeout(() => navigate(path), 50);
  };

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      <div className="p-6 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-3" onClick={onClose}>
          <img src="/mewlogo.png" alt="MEW" className="h-8 w-auto" />
          <span className="font-bold text-xl tracking-tight text-white">MEW</span>
        </Link>
        {/* Mobile Close Button */}
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

      <div className="pt-6 pb-4 px-4 border-t border-gray-800 mb-20">
        <button 
            onClick={() => setShowBugReport(true)}
            className="w-full text-left px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition mb-1 text-sm font-medium flex items-center gap-3"
        >
            <Bug className="w-5 h-5" />
            Report Bug
        </button>
      </div>
      
      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
    </div>
  );
}

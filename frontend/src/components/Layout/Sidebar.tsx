import { useState, useEffect } from 'react';
import { Home, Inbox, Layers, Users, Archive, User, Settings, X, ListMusic, Bug, LogOut, Globe } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useGun } from '../../contexts/GunContext';
import { BugReportModal } from '../BugReportModal';

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();
  const { user, pubKey, gun } = useGun();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showBugReport, setShowBugReport] = useState(false);

  useEffect(() => {
    if (!user || !pubKey) return;
    
    // Subscribe to inbox to count unread
    // We can't easily "count" without iterating in Gun, 
    // but for UI badge we can maintain a Set of unread IDs
    const unreadIds = new Set<string>();

    // Use public 'inboxes' graph
    gun.get('inboxes').get(pubKey).map().on((data: any, key: string) => {
        if (data && !data.read) {
            unreadIds.add(key);
        } else {
            unreadIds.delete(key);
        }
        setUnreadCount(unreadIds.size);
    });
    
    return () => {
        setUnreadCount(0);
    };
  }, [user, pubKey]);
  
  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Globe, label: 'Community', path: '/feed' },
    { icon: Inbox, label: 'Inbox', path: '/inbox', badge: unreadCount },
    { icon: Users, label: 'Directory', path: '/directory' },
    { icon: ListMusic, label: 'Playlists', path: '/playlists' },
    { icon: Archive, label: 'Archive', path: '/archive' },
    { icon: Layers, label: 'Creator Tools', path: '/creator' },
    { icon: User, label: 'Profile', path: '/profile' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      <div className="p-6 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-3">
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
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
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
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <button 
            onClick={() => setShowBugReport(true)}
            className="w-full text-left px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition mb-1 text-sm font-medium flex items-center gap-3"
        >
            <Bug className="w-5 h-5" />
            Report Bug
        </button>
        <button 
            onClick={() => {
                if (window.confirm("Log out?")) {
                    user.leave();
                    window.location.reload();
                }
            }}
            className="w-full text-left px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/10 rounded transition mb-2 text-sm font-medium flex items-center gap-3"
        >
            <LogOut className="w-5 h-5" />
            Log Out
        </button>
      </div>
      
      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
    </div>
  );
}

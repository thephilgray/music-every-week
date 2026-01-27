import { useState, useEffect } from 'react';
import { Home, Inbox, Layers, Music, Users, Archive, User, Settings, X, ListMusic } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useGun } from '../../contexts/GunContext';

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();
  const { user, pubKey, gun } = useGun();
  const [unreadCount, setUnreadCount] = useState(0);

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
        <div className="flex items-center gap-2 text-blue-500 font-bold text-2xl">
          <Music className="w-8 h-8" />
          <span>MEW2</span>
        </div>
        {/* Mobile Close Button */}
        <button 
          onClick={onClose}
          className="md:hidden text-gray-400 hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-2">
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
        <div className="text-xs text-gray-500 font-mono">
          v2.0.0-alpha
        </div>
      </div>
    </div>
  );
}

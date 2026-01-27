import { Home, Inbox, Layers, Music, Users, Archive, User, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function Sidebar() {
  const location = useLocation();
  
  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Inbox, label: 'Inbox', path: '/inbox' },
    { icon: Users, label: 'Directory', path: '/directory' },
    { icon: Archive, label: 'Archive', path: '/archive' },
    { icon: Layers, label: 'Creator Tools', path: '/creator' },
    { icon: User, label: 'Profile', path: '/profile' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      <div className="p-6">
        <div className="flex items-center gap-2 text-blue-500 font-bold text-2xl">
          <Music className="w-8 h-8" />
          <span>MEW2</span>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-blue-600/10 text-blue-500' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
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

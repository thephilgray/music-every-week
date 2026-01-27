import { LogOut, User as UserIcon, ChevronRight, Home } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useGun } from '../../contexts/GunContext';

export function ContextBar() {
  const { user, pubKey } = useGun();
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  const handleLogout = () => {
    user.leave();
    window.location.reload();
  };

  return (
    <div className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
            <Link to="/" className="hover:text-white flex items-center gap-1">
                <Home className="w-4 h-4"/>
                <span className="sr-only">Home</span>
            </Link>
            {pathnames.length === 0 && (
                <div className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                    <span className="text-white font-medium">Dashboard</span>
                </div>
            )}
            {pathnames.map((name, index) => {
                const routeTo = `/${pathnames.slice(0, index + 1).join('/')}`;
                const isLast = index === pathnames.length - 1;
                // Simple capitalization and truncation for IDs
                let label = name;
                if (label.length > 24) {
                    label = label.substring(0, 8) + '...';
                } else {
                    label = label.charAt(0).toUpperCase() + label.slice(1);
                }
                
                return (
                <div key={name} className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                    {isLast ? (
                        <span className="text-white font-medium">{label}</span>
                    ) : (
                        <Link to={routeTo} className="hover:text-white transition-colors">{label}</Link>
                    )}
                </div>
                )
            })}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 bg-gray-800 rounded-full px-4 py-1.5 border border-gray-700">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-mono text-gray-300">
                {pubKey?.substring(0, 8)}...
            </span>
        </div>
        
        <button 
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-full transition-colors"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

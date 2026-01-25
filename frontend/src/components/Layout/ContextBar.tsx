import { LogOut, User as UserIcon } from 'lucide-react';
import { useGun } from '../../contexts/GunContext';

export function ContextBar() {
  const { user, pubKey } = useGun();

  const handleLogout = () => {
    user.leave();
    window.location.reload();
  };

  return (
    <div className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {/* Dynamic Title / Breadcrumb could go here */}
        <h2 className="text-gray-100 font-semibold text-lg">Dashboard</h2>
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

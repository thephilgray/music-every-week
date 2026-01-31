import { useState } from 'react';
import { LogOut, User as UserIcon, ChevronRight, Home, Menu, Edit, UserPlus, Copy, X } from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useGun } from '../../contexts/GunContext';

export function ContextBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { gun, user, pubKey, userProfile, isConnected, isIdle, isInternetOnline } = useGun();
  const location = useLocation();
  const navigate = useNavigate();
  const pathnames = location.pathname.split('/').filter((x) => x);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Invite Modal State
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);

  // Status Logic
  let statusClass = "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse-slow";
  let statusTitle = "Online";

  if (!isInternetOnline) {
      statusClass = "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]";
      statusTitle = "Offline";
  } else if (isIdle) {
      statusClass = "bg-gray-500";
      statusTitle = "Idle";
  } else if (!isConnected) {
      statusClass = "bg-yellow-500";
      statusTitle = "Disconnected";
  }

  const handleLogout = () => {
    user.leave();
    window.location.reload();
  };

  const generateInvite = () => {
      const code = crypto.randomUUID().substring(0, 8).toUpperCase();
      // Save to global invites list
      // We don't need strict validation on the invite code for now, just existence.
      gun.get('invites').get(code).put({
          from: pubKey,
          createdAt: Date.now(),
          status: 'active'
      });
      
      // Link to user profile
      if (pubKey) {
          user.get('my_invites').get(code).put(true);
      }
      
      // Generate full URL
      const url = `${window.location.origin}/?inviteCode=${code}`;
      setInviteCode(url);
      setCopied(false);
      setShowInvite(true);
      setDropdownOpen(false);
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
    <div className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 md:px-6 z-20 relative">
      <div className="flex items-center gap-4">
        {/* Mobile Menu Button */}
        <button 
           onClick={onToggleSidebar} 
           className="md:hidden text-gray-400 hover:text-white mr-2"
        >
           <Menu className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-2 text-sm text-gray-400 overflow-x-auto whitespace-nowrap scrollbar-hide">
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

      {/* User Dropdown */}
      <div className="relative flex items-center gap-3">
        {/* Status Indicator */}
        <div className="group relative flex items-center justify-center">
            <div 
                className={`w-2 h-2 rounded-full cursor-help ${statusClass}`}
            />
            {/* Tooltip */}
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-max px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 shadow-lg whitespace-nowrap">
                {statusTitle}
            </div>
        </div>

        <button 
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 rounded-full pl-1 pr-3 py-1 border border-gray-700 transition"
        >
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center overflow-hidden border border-gray-600">
                {userProfile?.avatarUrl ? (
                    <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                    <UserIcon className="w-5 h-5 text-white" />
                )}
            </div>
            <span className="text-xs font-mono text-gray-300 hidden md:inline-block">
                {userProfile?.alias || pubKey?.substring(0, 8)}
            </span>
        </button>
        
        {dropdownOpen && (
            <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)}></div>
                <div className="absolute right-0 top-full mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
                    <div className="px-4 py-3 border-b border-gray-700 md:hidden">
                        <p className="text-sm text-white font-bold truncate">{userProfile?.alias || 'User'}</p>
                        <p className="text-xs text-gray-500 truncate">{pubKey?.substring(0, 12)}...</p>
                    </div>
                    
                    <button 
                        onClick={() => { navigate('/profile'); setDropdownOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                    >
                        <UserIcon className="w-4 h-4" />
                        My Profile
                    </button>
                    
                    <button 
                        onClick={() => { navigate('/profile?edit=true'); setDropdownOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                    >
                        <Edit className="w-4 h-4" />
                        Edit Profile
                    </button>

                    <button 
                        onClick={generateInvite}
                        className="w-full text-left px-4 py-2 text-sm text-blue-400 hover:bg-gray-700 hover:text-blue-300 flex items-center gap-2"
                    >
                        <UserPlus className="w-4 h-4" />
                        Invite a Friend
                    </button>

                    <div className="border-t border-gray-700 my-1"></div>
                    
                    <button 
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 flex items-center gap-2"
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </button>
                </div>
            </>
        )}
      </div>
    </div>

    {/* Invite Modal */}
    {showInvite && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-sm p-6 relative shadow-2xl">
                <button 
                    onClick={() => setShowInvite(false)}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white"
                >
                    <X className="w-5 h-5" />
                </button>
                
                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <UserPlus className="w-6 h-6 text-blue-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Invite a Friend</h3>
                    <p className="text-gray-400 text-sm">
                        Share this link with a friend to let them join the community.
                    </p>
                </div>

                <div className="bg-black/50 border border-gray-700 rounded-lg p-4 flex items-center justify-between mb-4">
                    <span className="font-mono text-sm text-white break-all pr-2">
                        {inviteCode}
                    </span>
                    <button 
                        onClick={copyToClipboard}
                        className="p-2 hover:bg-gray-700 rounded transition text-gray-400 hover:text-white shrink-0"
                        title="Copy Link"
                    >
                        <Copy className="w-5 h-5" />
                    </button>
                </div>

                {copied && (
                    <p className="text-green-400 text-xs text-center mb-4 animate-pulse">
                        Link copied to clipboard!
                    </p>
                )}

                <button 
                    onClick={generateInvite}
                    className="w-full py-2 text-sm text-gray-500 hover:text-white underline"
                >
                    Generate New Link
                </button>
            </div>
        </div>
    )}
    </>
  );
}

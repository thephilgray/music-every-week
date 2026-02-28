import { useState, useEffect } from 'react';
import { LogOut, User as UserIcon, ChevronRight, Home, Menu, Wifi, WifiOff } from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fixUrl } from '../../lib/url';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import type { UserProfile } from '../../types';

export function ContextBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { user, participantEmail, logout, isLoading } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let unsub = () => {};

    const fetchProfile = async () => {
        if (user?.uid) {
            // Subscribe to profile by UID
            unsub = onSnapshot(doc(db, 'profiles', user.uid), (doc) => {
                if (doc.exists()) {
                    setUserProfile(doc.data() as UserProfile);
                } else {
                    setUserProfile(null);
                }
            });
        } else if (participantEmail) {
            // Fetch by email (One-time fetch usually sufficient, or could set up watcher if needed)
            try {
                const q = query(collection(db, 'profiles'), where('email', '==', participantEmail));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    setUserProfile(querySnapshot.docs[0].data() as UserProfile);
                } else {
                    setUserProfile(null);
                }
            } catch (e) {
                console.error("Error fetching participant profile:", e);
            }
        } else {
            setUserProfile(null);
        }
    };

    fetchProfile();

    return () => unsub();
  }, [user, participantEmail]);

  const location = useLocation();
  const navigate = useNavigate();
  const pathnames = location.pathname.split('/').filter((x) => x);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Status Logic (Firebase/General Network Status)
  let statusClass = "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse-slow";
  let statusTitle = "Online";
  let StatusIcon = Wifi;

  if (isLoading) {
      statusClass = "bg-gray-500 animate-pulse";
      statusTitle = "Connecting...";
  } else if (!navigator.onLine) {
      statusClass = "bg-red-500";
      statusTitle = "Offline";
      StatusIcon = WifiOff;
  } else if (!user && !participantEmail) {
      statusClass = "bg-gray-500";
      statusTitle = "Not Logged In";
      StatusIcon = WifiOff; // Or a custom icon for not logged in
  }

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
        await logout();
        navigate('/login'); // Redirect to a general login page after logout
    }
  };

  // Determine display name and avatar
  const displayName = userProfile?.alias || userProfile?.displayName || (user?.displayName) || (user?.email?.split('@')[0]) || (participantEmail?.split('@')[0]) || 'Guest';
  const avatarUrl = userProfile?.avatarUrl || user?.photoURL;

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
        {/* Status Indicator (Firebase/Network) */}
        <div className="group relative flex items-center justify-center">
            <div 
                className={`w-2 h-2 rounded-full cursor-help ${statusClass}`}
            />
            {/* Tooltip */}
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-max px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 shadow-lg whitespace-nowrap">
                <StatusIcon className="w-3 h-3 inline-block mr-1" /> {statusTitle}
            </div>
        </div>

        <button 
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 rounded-full pl-1 pr-3 py-1 border border-gray-700 transition"
        >
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center overflow-hidden border border-gray-600">
                {avatarUrl ? (
                    <img src={fixUrl(avatarUrl)} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                    <UserIcon className="w-5 h-5 text-white" />
                )}
            </div>
            <span className="text-xs font-mono text-gray-300 hidden md:inline-block">
                {displayName}
            </span>
        </button>
        
        {dropdownOpen && (
            <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)}></div>
                <div className="absolute right-0 top-full mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
                    <div className="px-4 py-3 border-b border-gray-700 md:hidden">
                        <p className="text-sm text-white font-bold truncate">{displayName}</p>
                        <p className="text-xs text-gray-500 truncate">{user?.email || participantEmail}</p>
                    </div>
                    
                    <button 
                        onClick={() => { navigate('/profile'); setDropdownOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                    >
                        <UserIcon className="w-4 h-4" />
                        My Profile
                    </button>

                    <div className="border-t border-gray-700 my-1"></div>

                    <button 
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 flex items-center gap-2"
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </button>                </div>
            </>
        )}
      </div>
    </div>

    {/* Invite Modal (Removed as functionality is being migrated/disabled) */}
    </>
  );
}

import { useState, useEffect } from 'react';
import { LogOut, User as UserIcon, ChevronRight, Home, Menu, Edit, UserPlus, Copy, X } from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useGun } from '../../contexts/GunContext';
import { useAuth } from '../../contexts/AuthContext';
import { fixUrl } from '../../lib/url';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import type { UserProfile } from '../../types';

export function ContextBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { gun, pubKey, isConnected, isIdle, isInternetOnline, user: gunUser } = useGun(); // Aliased Gun user to avoid conflict if needed, or just let it be.
  // Actually, useAuth provides 'user' (Firebase) and 'logout'. 
  // useGun provides 'user' (Gun SEA). 
  // Let's destructure what we need carefully.
  const { user, participantEmail, logout } = useAuth();
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
            // For participants, profile might not change often or doesn't exist yet.
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
  
  // Invite Modal State
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);

  // Status Logic
  let statusClass = "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse-slow";
  let statusTitle = "Online";

  if (!isInternetOnline) {
      statusClass = "bg-gray-500";
      statusTitle = "Offline";
  } else if (isIdle) {
      statusClass = "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]";
      statusTitle = "Idle";
  } else if (!isConnected) {
      statusClass = "bg-gray-500";
      statusTitle = "Disconnected";
  }

  const handleLogout = async () => {
    if (window.confirm("Log out?")) {
        await logout();
        navigate('/login');
    }
  };

  const generateInvite = () => {
      // Use Firebase UID if available, otherwise fallback to PubKey if still using Gun for invites
      const fromId = user?.uid || pubKey;
      if (!fromId) return;

      const code = crypto.randomUUID().substring(0, 8).toUpperCase();
      
      // Save to global invites list (Gun - kept for compatibility or needs migration?)
      // Assuming we are migrating, we should probably write to Firestore 'invites' collection?
      // For now, let's keep Gun logic if invites are still Gun-based, or just disable if not.
      // The prompt didn't ask to migrate invites yet, so I'll leave it but guard against missing objects.
      
      if (gun && gunUser) {
        gun.get('invites').get(code).put({
            from: fromId,
            createdAt: Date.now(),
            status: 'active'
        });
        
        // Link to user profile (Scoped)
        gunUser.get('my_invites').get(code).put(true);
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
                    
                    <button 
                        onClick={() => { navigate('/profile?edit=true'); setDropdownOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                    >
                        <Edit className="w-4 h-4" />
                        Edit Profile
                    </button>

                    {userProfile?.isHost && (
                    <button 
                        onClick={generateInvite}
                        className="w-full text-left px-4 py-2 text-sm text-blue-400 hover:bg-gray-700 hover:text-blue-300 flex items-center gap-2"
                    >
                        <UserPlus className="w-4 h-4" />
                        Invite a Friend
                    </button>
                    )}

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

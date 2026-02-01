import React, { useState } from 'react';
import { useGun } from '../contexts/GunContext';
import { BRAND_INFO } from '../config/appConfig';
import { Loader2, LogOut, Check } from 'lucide-react';
import { LandingPage } from '../pages/LandingPage';

interface GatekeeperProps {
  children: React.ReactNode;
}

export function Gatekeeper({ children }: GatekeeperProps) {
  const { gun, user, isLoggedIn, isAuthorized, isAuthLoading, pubKey } = useGun();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 1. Loading State
  if (isAuthLoading || (isLoggedIn && isAuthorized === undefined)) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-900 text-white">
        <Loader2 className="animate-spin h-12 w-12 text-blue-500" />
      </div>
    );
  }

  // 2. Not Logged In -> Show Landing / Login
  if (!isLoggedIn) {
    return <LandingPage />;
  }

  // 3. Authorized (Member) -> Show Dashboard
  if (isAuthorized) {
    return <>{children}</>;
  }

  // 4. Logged In but Unauthorized -> Show Join Screen
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    
    setLoading(true);
    setError(null);

    const code = inviteCode.trim();

    // Verify Invite Code
    gun.get('invites').get(code).once((data: any) => {
        if (data && (data.valid || data.status === 'active')) {
            // Valid Invite!
            console.log("Invite Valid! Joining community...");
            
            // 1. Add to Members List (Prompt Requirement)
            if (pubKey) {
                gun.get('members').get(pubKey).put(true);
                
                // 2. Add to User Directory (System Requirement for isAuthorized)
                // We need to fetch the alias from the user graph first ideally, 
                // but usually user.is.alias is available locally if logged in.
                // @ts-ignore
                const alias = user.is?.alias || 'Unknown Member';
                
                gun.get('all_users').get(pubKey).put({
                    alias,
                    pub: pubKey,
                    joinedAt: Date.now(),
                    invitedBy: data.createdBy || 'Unknown' 
                }, (ack: any) => {
                    if (ack.err) {
                        setError("Failed to write membership data. Try again.");
                        setLoading(false);
                    } else {
                        // Success!
                        setSuccess(true);
                        // Optional: Consume Invite (if not infinite)
                        // gun.get('invites').get(code).put(null); 
                        
                        // Force reload or let the reactive GunContext handle it?
                        // GunContext watches 'all_users', so it should update automatically.
                        // We set success to show a brief message before the children render
                    }
                });
            } else {
                setError("Error: Public Key missing. Try logging out and back in.");
                setLoading(false);
            }
        } else {
            setError("Invalid or expired invite code.");
            setLoading(false);
        }
    });
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-2xl">
        <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">
                {BRAND_INFO.name}
            </h1>
            <p className="text-gray-400">
                Community Access
            </p>
        </div>

        {!success ? (
            <>
                <div className="mb-6 text-center">
                    <p className="text-gray-300 mb-2">
                        Welcome! You are logged in, but you haven't joined the {BRAND_INFO.name} community yet.
                    </p>
                    <p className="text-sm text-gray-500">
                        Please enter your invite code to unlock the dashboard.
                    </p>
                </div>

                <form onSubmit={handleJoin} className="space-y-4">
                    <div>
                        <input 
                            type="text" 
                            value={inviteCode}
                            onChange={e => setInviteCode(e.target.value)}
                            placeholder="Enter Invite Code"
                            className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-center tracking-widest uppercase focus:border-blue-500 outline-none transition"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded border border-red-900/50">
                            {error}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={loading || !inviteCode}
                        className={`w-full py-3 rounded-lg font-bold transition flex items-center justify-center gap-2
                            ${loading || !inviteCode 
                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
                            }`}
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? 'Verifying...' : 'Join Community'}
                    </button>
                </form>
            </>
        ) : (
            <div className="text-center py-8 animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500 text-green-400">
                    <Check className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Access Granted!</h3>
                <p className="text-gray-400">Entering the studio...</p>
            </div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-800 flex justify-center">
            <button 
                onClick={() => {
                    user.leave();
                    window.location.reload();
                }}
                className="text-gray-500 hover:text-white text-sm flex items-center gap-2 transition"
            >
                <LogOut className="w-4 h-4" /> Sign Out
            </button>
        </div>
      </div>
    </div>
  );
}

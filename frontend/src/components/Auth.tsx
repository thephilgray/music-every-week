import React, { useState, useEffect } from 'react';
import { useGun } from '../contexts/GunContext';

export function Auth() {
  const { gun, user } = useGun();
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse URL for invite code and request ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('inviteCode');
    if (code) {
        setInviteCode(code);
        setIsSignup(true);
    }
  }, []);

  const checkPendingInvites = (pub: string, userEmail: string) => {
      // Check if we are landing on a request page
      const match = window.location.pathname.match(/\/request\/([^/]+)/);
      if (match && match[1]) {
          const requestId = match[1];
          gun.get('file_requests').get(requestId).once((req: any) => {
              if (req && req.pending_emails) {
                  let pending: string[] = [];
                  try {
                      pending = JSON.parse(req.pending_emails);
                  } catch (e) {}

                  if (pending.includes(userEmail)) {
                      console.log("Auto-joining request:", requestId);
                      // Add to participants with accepted status
                      // We write to the Request's participants node (assuming open write or owner will process)
                      // Actually, if participants is a node, we can write our own entry.
                      gun.get('file_requests').get(requestId).get('participants').get(pub).put({
                          alias,
                          status: 'accepted',
                          email: userEmail,
                          joinedAt: Date.now()
                      });
                  }
              }
          });
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSignup) {
      // @ts-ignore
      const adminSecret = import.meta.env.VITE_ADMIN_SECRET || 'secret';

      const proceedWithSignup = (isAdmin = false, inviterPub?: string) => {
        user.create(alias, pass, (ack: any) => {
          if (ack.err) {
            setError(ack.err);
            return;
          }
          // Auto login after signup
          user.auth(alias, pass, (authAck: any) => {
             if (authAck.err) {
                 setError(authAck.err);
                 return;
             }
             // Add to Directory
             // @ts-ignore
             const pub = user.is?.pub;
             if (pub) {
                 gun.get('all_users').get(pub).put({
                     alias,
                     pub,
                     email, // Save email to profile
                     joinedAt: Date.now(),
                     isAdmin,
                     invitedBy: inviterPub
                 });

                 // Update Inviter's Invite Graph
                 if (inviterPub) {
                     gun.get('all_users').get(inviterPub).get('invites').get(pub).put(true);
                 }
                 
                 // If invite used, consume it (unless admin/genesis)
                 if (!isAdmin && inviteCode) {
                     gun.get('invites').get(inviteCode).put(null); 
                 }

                 // Check for Auto-Join
                 if (email) checkPendingInvites(pub, email);
             }
          });
        });
      };

      if (inviteCode && inviteCode === adminSecret) {
          proceedWithSignup(true);
      } else if (inviteCode) {
          gun.get('invites').get(inviteCode).once((data: any) => {
              if (data && data.status === 'active') {
                  proceedWithSignup(false, data.createdBy);
              } else {
                  setError("Invalid or Expired Invite Code");
              }
          });
      } else {
          setError("Invite Code is required");
      }

    } else {
      // Clear any stale session data before auth
      sessionStorage.clear();
      
      user.auth(alias, pass, (ack: any) => {
        if (ack.err) {
          setError(ack.err);
        } else {
           console.log("Auth Ack:", ack);
           
           // Force injection if Gun failed to set it but Ack has it
           // @ts-ignore
           if ((!user.is || !user.is.priv) && ack.sea && ack.sea.priv) {
               console.warn("Manually injecting keys from Ack into user.is");
               // @ts-ignore
               user.is = { ...user.is, ...ack.sea };
               // @ts-ignore
               user._.is = user.is; // Gun internal reference
           }

           // Verify Private Key Decryption
           // @ts-ignore
           if (!user.is || !user.is.priv) {
               console.error("Login 'success' but private key missing. User state:", user.is, "Ack:", ack);
               setError("Login failed: Password correct but could not decrypt private key. Try clearing local data in Settings or creating a new account if the password was lost.");
               user.leave();
           } else {
               // Success path
               console.log("Login successful with full key pair.");
               // Optional: Update last login or similar, but for now just let the state update trigger the UI
           }
        }
      });
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-gray-800 rounded-lg shadow-xl border border-gray-700">
      <h2 className="text-2xl font-bold mb-6 text-center text-white">
        {isSignup ? 'Create Account' : 'Login'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Username (Alias)</label>
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        {isSignup && (
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email (for invites)</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="you@example.com"
                    required
                />
            </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        {isSignup && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Invite Code</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter invite code"
              required
            />
          </div>
        )}

        {error && (
            <div className="bg-red-900/50 border border-red-800 text-red-200 p-3 rounded text-sm text-center">
                {error}
            </div>
        )}

        <button
          type="submit"
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition shadow-lg shadow-blue-900/20"
        >
          {isSignup ? 'Sign Up' : 'Log In'}
        </button>
      </form>
      
      <div className="mt-4 pt-4 border-t border-gray-700 text-center">
          <button 
            type="button"
            onClick={async () => {
                if (confirm("This will delete ALL local data (IndexedDB, LocalStorage) to fix corruption. Continue?")) {
                    localStorage.clear();
                    sessionStorage.clear();
                    const dbs = await window.indexedDB.databases();
                    for (const db of dbs) {
                        if (db.name) window.indexedDB.deleteDatabase(db.name);
                    }
                    window.location.reload();
                }
            }}
            className="text-xs text-red-500 hover:text-red-400 underline"
          >
              Troubleshoot: Hard Reset / Clear Data
          </button>
      </div>

      <div className="mt-2 text-center">
        <button
          onClick={() => {
              setIsSignup(!isSignup);
              setError(null);
          }}
          className="text-sm text-gray-400 hover:text-white transition"
        >
          {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  );
}

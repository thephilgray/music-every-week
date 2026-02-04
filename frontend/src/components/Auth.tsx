import React, { useState } from 'react';
import { useGun } from '../contexts/GunContext';

export function Auth() {
  const { gun, user } = useGun();
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [inviteCode, setInviteCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('inviteCode') || params.get('requestInvite') || '';
  });
  const [isSignup, setIsSignup] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    // Explicit 'inviteCode' implies a direct invite link -> Signup
    // 'requestInvite' implies a request share link -> Default to Login (returning users)
    return !!params.get('inviteCode');
  });
  const [error, setError] = useState<string | null>(null);

  // Parse URL for invite code and request ID
  const checkPendingInvites = (pub: string, userEmail?: string) => {
      // Check if we are landing on a request page
      const match = window.location.pathname.match(/\/request\/([^/]+)/);
      if (match && match[1]) {
          const requestId = match[1];
          gun.get('file_requests').get(requestId).once((req: any) => {
              if (!req) return;
              
              let shouldJoin = false;

              // Check 1: Invite Code Match
              if (inviteCode && req.inviteCode === inviteCode) {
                  console.log("Auto-joining via Invite Code Match");
                  shouldJoin = true;
              }

              // Check 2: Email Match
              if (!shouldJoin && userEmail && req.pending_emails) {
                  let pending: string[] = [];
                  try {
                      pending = JSON.parse(req.pending_emails);
                  } catch (e) {}

                  if (pending.includes(userEmail)) {
                      console.log("Auto-joining via Email Match");
                      shouldJoin = true;
                  }
              }

              if (shouldJoin) {
                  console.log("Auto-joining request:", requestId);
                  gun.get('file_requests').get(requestId).get('participants').get(pub).put({
                      alias,
                      status: 'accepted',
                      email: userEmail || '',
                      joinedAt: Date.now()
                  });
              }
          });
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Auth: handleSubmit initiated.");
    setError(null);

    if (isSignup) {
      console.log("Auth: Entering Signup flow.");
      if (pass !== confirmPass) {
          setError("Passwords do not match.");
          console.log("Auth: Signup validation failed - Passwords do not match.");
          return;
      }

      // @ts-ignore
      const adminSecret = import.meta.env.VITE_ADMIN_SECRET || 'secret';
      console.log(`Auth: Signup with alias: ${alias}, email: ${email}, inviteCode: ${inviteCode}`);

      const proceedWithSignup = (isAdmin = false, inviterPub?: string, requestToJoinId?: string) => {
        console.log("Auth: Calling user.create().");
        user.create(alias, pass, (ack: any) => {
          console.log("Auth: user.create() ack received:", ack);
          if (ack.err) {
            setError(ack.err);
            console.error("Auth: user.create() failed:", ack.err);
            return;
          }
          console.log("Auth: user.create() successful. Auto-logging in.");
          // Auto login after signup
          user.auth(alias, pass, (authAck: any) => {
            console.log("Auth: user.auth() (after create) authAck received:", authAck);
             if (authAck.err) {
                 setError(authAck.err);
                 console.error("Auth: user.auth() (after create) failed:", authAck.err);
                 return;
             }
             console.log("Auth: Auto-login successful after create.");
             // Add to Directory
             // @ts-ignore
             const pub = user.is?.pub || authAck?.sea?.pub || authAck?.pub;
             console.log(`Auth: Detected Pub Key: ${pub}`);
             if (pub) {
                 gun.get('all_users').get(pub).put({
                     alias,
                     pub,
                     email, // Save email to profile
                     joinedAt: Date.now(),
                     isAdmin,
                     invitedBy: inviterPub || null
                 }, (putAck: any) => {
                     if (putAck.err) console.error("Auth: Error putting to all_users:", putAck.err);
                     else console.log("Auth: User added to all_users directory.");
                 });

                 // Update Inviter's Invite Graph
                 if (inviterPub) {
                     gun.get('all_users').get(inviterPub).get('invites').get(pub).put(true, (putAck: any) => {
                         if (putAck.err) console.error("Auth: Error updating inviter's graph:", putAck.err);
                         else console.log(`Auth: Inviter ${inviterPub} graph updated.`);
                     });
                 }
                 
                 // If invite used, consume it (unless admin/genesis)
                 if (!isAdmin && inviteCode) {
                     gun.get('invites').get(inviteCode).put(null, (putAck: any) => {
                         if (putAck.err) console.error("Auth: Error consuming invite:", putAck.err);
                         else console.log(`Auth: Invite code ${inviteCode} consumed.`);
                     }); 
                 }

                 // Check for Auto-Join
                 if (requestToJoinId) {
                     console.log(`Auth: Setting pendingJoinRequest in sessionStorage for request: ${requestToJoinId}`);
                     // Defer write to App.tsx to ensure session is fully ready and component doesn't unmount
                     sessionStorage.setItem('pendingJoinRequest', requestToJoinId);
                 } else if (email) {
                     console.log("Auth: Checking pending invites based on email.");
                     checkPendingInvites(pub, email);
                 }
             } else {
                 console.error("Auth: Could not get pub key after successful create and auth.");
             }
          });
        });
      };

      const verifyGlobalInvite = (code: string) => {
          console.log(`Auth: Verifying global invite code: ${code}`);
          gun.get('invites').get(code).once((data: any) => {
              console.log(`Auth: Global invite code ${code} data received:`, data);
              if (data && data.status === 'active') {
                  const inviter = data.from || data.createdBy;
                  console.log(`Auth: Global invite code ${code} is active. Inviter: ${inviter}`);
                  proceedWithSignup(false, inviter, data.forRequest);
              } else {
                  setError("Invalid or Expired Invite Code");
                  console.error(`Auth: Global invite code ${code} invalid or expired.`);
              }
          });
      };

      if (inviteCode && inviteCode === adminSecret) {
          console.log("Auth: Admin signup via inviteCode.");
          proceedWithSignup(true);
      } else if (inviteCode) {
          const code = inviteCode.trim();
          
          // Check if this is a Request-Specific invite (from URL)
          const match = window.location.pathname.match(/\/request\/([^/]+)/);
          const requestIdFromUrl = match ? match[1] : null;
          console.log(`Auth: Invite code: ${code}. Request ID from URL: ${requestIdFromUrl}`);

          if (requestIdFromUrl) {
              console.log(`Auth: Checking request-specific invite for request ID: ${requestIdFromUrl}`);
              gun.get('file_requests').get(requestIdFromUrl).once((req: any) => {
                  console.log(`Auth: Request ${requestIdFromUrl} data for invite check:`, req);
                  if (req && req.inviteCode === code) {
                      // Valid!
                      console.log(`Auth: Request-specific invite ${code} is valid.`);
                      proceedWithSignup(false, req.ownerPub, requestIdFromUrl);
                  } else {
                      // Fallback to global check
                      console.log(`Auth: Request-specific invite ${code} invalid. Falling back to global check.`);
                      verifyGlobalInvite(code);
                  }
              });
          } else {
            verifyGlobalInvite(code);
          }
      } else {
          setError("Invite Code is required");
          console.log("Auth: Signup validation failed - Invite Code is required.");
      }

    } else {
      // Login Flow
      console.log(`Auth: Entering Login flow for alias: ${alias}.`);
      
      user.auth(alias, pass, (ack: any) => {
        console.log("Auth: user.auth() ack received:", ack);
        if (ack.err) {
          setError(ack.err);
          console.error("Auth: user.auth() failed:", ack.err);
        } else {
           console.log("Auth: user.auth() successful (ack.err is null).");
           console.log("Auth Ack:", ack);
           
           // Force injection if Gun failed to set it but Ack has it
           // @ts-ignore
           if ((!user.is || !user.is.priv) && ack.sea && ack.sea.priv) {
               console.warn("Auth: Manually injecting keys from Ack into user.is.");
               // @ts-ignore
               user.is = { ...user.is, ...ack.sea, alias };
               // @ts-ignore
               user._.is = user.is; // Gun internal reference
               console.log("Auth: Injected keys, new user.is:", user.is);
           }

           // Verify Private Key Decryption
           // @ts-ignore
           if (!user.is || !user.is.priv) {
               console.error("Auth: Login 'success' but private key missing. User state:", user.is, "Ack:", ack);
               setError("Login failed: Password correct but could not decrypt private key. Try clearing local data in Settings or creating a new account if the password was lost.");
               user.leave();
           } else {
               // Success path
               console.log("Auth: Login successful with full key pair. Current user.is:", user.is);
               
               // Ensure we write to Directory (robust pub check)
               // @ts-ignore
               const pub = user.is?.pub || ack?.sea?.pub || ack?.pub;
               console.log(`Auth: Detected Pub Key for directory write: ${pub}`);
               
               if (pub) {
                   // On Login: Only ensure existence and update alias.
                   gun.get('all_users').get(pub).put({
                       alias,
                       pub
                   }, (putAck: any) => {
                       if (putAck.err) console.error("Auth: Error putting to all_users on login:", putAck.err);
                       else console.log("Auth: User ensured in all_users directory on login.");
                   });
                   
                   // Check for Auto-Join
                   if (email) { // only check if email is provided, otherwise no point
                     console.log("Auth: Checking pending invites based on email.");
                     checkPendingInvites(pub, email);
                   } else {
                     console.log("Auth: No email provided for pending invite check.");
                   }
               } else {
                   console.error("Auth: Could not write to Directory: Pub key missing despite successful login.");
               }
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
                <label className="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
                <input
                    type="password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
                <p className="text-xs text-yellow-500 mt-1">
                    Warning: Passwords cannot be reset. Don't forget it!
                </p>
            </div>
        )}
        
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
              setConfirmPass('');
          }}
          className="text-sm text-gray-400 hover:text-white transition"
        >
          {isSignup ? 'Already have an account? Log in' : "Have a signup code?"}
        </button>
      </div>
    </div>
  );
}
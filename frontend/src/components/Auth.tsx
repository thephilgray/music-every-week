import React, { useState } from 'react';
import { useGun } from '../contexts/GunContext';
import { Key, Database } from 'lucide-react';

export function Auth() {
  const { gun, user, refreshAuth } = useGun();
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
    return !!params.get('inviteCode');
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  
  // Import State
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState('');

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

  const handleRecoverLegacyData = async () => {
    if (!confirm("This will read data from the old IndexedDB AND LocalStorage and attempt to sync it to the new server. Use this if you are unable to login but have data on this device.")) return;
    setIsRecovering(true);
    let count = 0;

    const processObject = (obj: any, prefix = '') => {
        if (!obj || typeof obj !== 'object') return;
        
        Object.keys(obj).forEach(key => {
            const val = obj[key];
            if (key === '_' || key === '#') return; // Skip metadata
            
            // If it looks like a graph node (has an ID/soul)
            if (val && typeof val === 'object' && val._ && val._['#']) {
                 try {
                     // We found a node! Inject it directly into Gun's wire protocol.
                     // This bypasses 'put' authorship checks and treats it as a data sync/merge.
                     const soul = val._['#'];
                     console.log("Injecting node:", soul);
                     
                     // Direct wire injection
                     // @ts-ignore
                     gun._.on('in', {
                         '@': val._['>'] ? undefined : '#', // ack if needed, but mostly fire & forget
                         put: { [soul]: val }
                     });
                     
                     count++;
                 } catch (e) {
                     console.warn("Error injecting node:", val, e);
                 }
            } else if (val && typeof val === 'object') {
                // Recurse deeper
                processObject(val, prefix + key + '/');
            } else if (typeof val === 'string' && val.startsWith('{')) {
                // Try parsing stringified JSON (common in localStorage)
                try {
                    const parsed = JSON.parse(val);
                    processObject(parsed, prefix + key + '/');
                } catch (e) {}
            }
        });
    };

    try {
        // 1. Recover from LocalStorage (Big Keys)
        console.log("Starting LocalStorage recovery...");
        
        // Scan ALL keys, because sometimes prefixes vary
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            const val = localStorage.getItem(key);
            if (!val) continue;

            // Targeted keys we suspect hold the graph
            if (key === 'gun/' || key === 'mew-radata-v1' || key.startsWith('mew-radata-v1')) {
                console.log(`Scanning large LS key: ${key} (${(val.length/1024).toFixed(2)} KB)`);
                try {
                    const parsed = JSON.parse(val);
                    processObject(parsed);
                } catch (e) {
                    console.warn(`Failed to parse LS key ${key}`, e);
                }
            }
        }

        // 2. Recover from IndexedDB
        const dbName = 'mew-radata-v1';
        const req = window.indexedDB.open(dbName);
        
        req.onerror = () => { 
            // If IDB fails, we still report LS success
            if (count > 0) alert(`Recovered ${count} nodes from LocalStorage. IndexedDB skipped.`);
            else alert("Could not open legacy database."); 
            setIsRecovering(false); 
        };

        req.onsuccess = async (e: any) => {
            const db = e.target.result;
            if (db.objectStoreNames.length === 0) {
                 if (count > 0) alert(`Recovered ${count} nodes from LocalStorage. IndexedDB was empty.`);
                 else alert("Legacy database is empty.");
                 setIsRecovering(false);
                 return;
            }
            
            const storeName = db.objectStoreNames[0]; 
            console.log("Found legacy store:", storeName);
            
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const cursorReq = store.openCursor();
            
            cursorReq.onsuccess = (ev: any) => {
                const cursor = ev.target.result;
                if (cursor) {
                    const key = cursor.key;
                    const val = cursor.value;
                    
                    if (val && typeof val === 'object') {
                        try {
                             if (typeof key === 'string' && !key.startsWith('!')) {
                                  gun.get(key).put(val);
                                  count++;
                             }
                        } catch (err) {
                            console.warn("Failed to migrate key:", key, err);
                        }
                    }
                    cursor.continue();
                } else {
                    alert(`Migration finished. Processed ${count} nodes (LocalStorage + IndexedDB). Please try logging in now.`);
                    setIsRecovering(false);
                }
            };
            cursorReq.onerror = () => {
                alert("Error reading legacy data.");
                setIsRecovering(false);
            };
        };
    } catch (e) {
        console.error(e);
        alert("Recovery failed.");
        setIsRecovering(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    console.log("Auth: handleSubmit initiated.");
    setError(null);
    setIsLoading(true);

    const finalize = () => setIsLoading(false);

    if (isSignup) {
      console.log("Auth: Entering Signup flow.");
      if (pass !== confirmPass) {
          setError("Passwords do not match.");
          console.log("Auth: Signup validation failed - Passwords do not match.");
          finalize();
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
            finalize();
            return;
          }
          console.log("Auth: user.create() successful. Auto-logging in.");
          // Auto login after signup
          user.auth(alias, pass, (authAck: any) => {
            console.log("Auth: user.auth() (after create) authAck received:", authAck);
             if (authAck.err) {
                 setError(authAck.err);
                 console.error("Auth: user.auth() (after create) failed:", authAck.err);
                 finalize();
                 return;
             }
             console.log("Auth: Auto-login successful after create.");

             // Force injection if Gun failed to set it but Ack has it (Robustness Fix)
             // @ts-ignore
             if ((!user.is || !user.is.priv) && authAck.sea && authAck.sea.priv) {
                console.warn("Auth: Manually injecting keys from authAck into user.is (Signup Flow).");
                // @ts-ignore
                user.is = { ...user.is, ...authAck.sea, alias };
                // @ts-ignore
                user._.is = user.is; // Gun internal reference
             }

             // Explicitly persist session for robust recovery
             // @ts-ignore
             if (user.is && user.is.priv) {
                try {
                    // @ts-ignore
                    localStorage.setItem('mew_user_session', JSON.stringify(user.is));
                    console.log("Auth: Explicitly saved session to localStorage (Signup Flow).");
                } catch (e) {
                    console.error("Auth: Failed to save session to localStorage:", e);
                }
             }

             // Force GunContext to refresh userPair
             refreshAuth();

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
             finalize();
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
                  finalize();
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
          finalize();
      }

    } else {
      // Login Flow
      console.log(`Auth: Entering Login flow for alias: ${alias}.`);
      
      // Safety Timeout
      const timeout = setTimeout(() => {
          if (isLoading) {
              console.error("Auth: Login timed out.");
              setError("Login timed out. The server may be offline or corrupted.");
              finalize();
          }
      }, 15000);

      user.auth(alias, pass, (ack: any) => {
        clearTimeout(timeout);
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
               
               // Explicitly persist session for robust recovery
               try {
                   localStorage.setItem('mew_user_session', JSON.stringify(user.is));
                   console.log("Auth: Explicitly saved session to localStorage.");
               } catch (e) {
                   console.error("Auth: Failed to save session to localStorage:", e);
               }

               // Force GunContext to refresh userPair
               refreshAuth();

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
        finalize();
      });
    }
  };

  const handleImportSession = () => {
      try {
          const session = JSON.parse(importData);
          if (session && session.priv && session.pub) {
              localStorage.setItem('mew_user_session', JSON.stringify(session));
              window.location.reload();
          } else {
              setError("Invalid session data. Ensure it contains 'priv' and 'pub' keys.");
          }
      } catch (e) {
          setError("Invalid JSON format.");
      }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-gray-800 rounded-lg shadow-xl border border-gray-700">
      <h2 className="text-2xl font-bold mb-6 text-center text-white">
        {showImport ? 'Restore Session' : (isSignup ? 'Create Account' : 'Member Login')}
      </h2>
      
      {!showImport ? (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Username (Alias)</label>
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            required
            disabled={isLoading}
          />
        </div>
        
        {isSignup && (
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email (for invites)</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    placeholder="you@example.com"
                    required
                    disabled={isLoading}
                />
            </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            required
            disabled={isLoading}
          />
        </div>

        {isSignup && (
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
                <input
                    type="password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    required
                    disabled={isLoading}
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
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              placeholder="Enter invite code"
              required
              disabled={isLoading}
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
          disabled={isLoading}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {isSignup ? 'Sign Up' : 'Log In'}
        </button>
      </form>
      ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div className="text-center">
                  <Key className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                  <h3 className="text-white font-bold">Restore Session</h3>
                  <p className="text-xs text-gray-400">Paste your session keypair (JSON) exported from another device to log in without password.</p>
              </div>
              
              <textarea 
                  value={importData}
                  onChange={e => setImportData(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-md p-3 text-xs text-white font-mono h-32 focus:border-blue-500 outline-none"
                  placeholder='{"pub":"...","priv":"...","epub":"...","epriv":"..."}'
              />
              
              {error && (
                <div className="bg-red-900/50 border border-red-800 text-red-200 p-3 rounded text-sm text-center">
                    {error}
                </div>
              )}

              <button
                  onClick={handleImportSession}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition"
              >
                  Restore Session
              </button>
              
              <button
                  onClick={() => setShowImport(false)}
                  className="w-full text-gray-400 hover:text-white text-sm"
              >
                  Cancel
              </button>
          </div>
      )}
      
      {!showImport && (
      <div className="mt-4 pt-4 border-t border-gray-700 text-center space-y-3">
          <button 
            type="button"
            onClick={handleRecoverLegacyData}
            disabled={isRecovering}
            className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 mx-auto disabled:opacity-50"
          >
             {isRecovering ? <div className="w-3 h-3 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" /> : <Database className="w-3 h-3" />}
             Recover Legacy Data (Fix "User Not Found")
          </button>

          {/* <button 
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
            className="text-xs text-red-500 hover:text-red-400 underline block mx-auto"
          >
              Troubleshoot: Hard Reset / Clear Data
          </button>
          
          <button
              onClick={() => { setShowImport(true); setError(null); }}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mx-auto"
          >
              <Key className="w-3 h-3" /> Restore from Backup
          </button> */}
      </div>
      )}

      {!showImport && (
      <div className="mt-2 text-center">
        <button
          onClick={() => {
              setIsSignup(!isSignup);
              setError(null);
              setConfirmPass('');
          }}
          className="text-sm text-gray-400 hover:text-white transition"
        >
          {isSignup ? 'Already have an account? Log in' : "Have an invite? Sign up"}
        </button>
      </div>
      )}
    </div>
  );
}

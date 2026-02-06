import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import gun, { user as gunUser, PEERS } from '../lib/gun';
import type { IGunUserInstance } from 'gun';
import type { UserProfile } from '../types';

interface GunContextType {
  gun: typeof gun;
  user: IGunUserInstance;
  isLoggedIn: boolean;
  pubKey: string | undefined;
  userPair: { pub: string, priv: string } | null; // Added userPair
  userProfile: UserProfile | null;
  isAuthorized: boolean | undefined;
  isAdmin: boolean;
  disconnect: () => void;
  reconnect: () => void;
  isConnected: boolean;
  isAuthLoading: boolean;
  isIdle: boolean;
  isInternetOnline: boolean;
  setIdle: (idle: boolean) => void;
}

const GunContext = createContext<GunContextType>({
  gun,
  user: gunUser,
  isLoggedIn: false,
  pubKey: undefined,
  userPair: null, // Initialized userPair
  userProfile: null,
  isAuthorized: undefined,
  isAdmin: false,
  disconnect: () => {},
  reconnect: () => {},
  isConnected: true,
  isAuthLoading: true,
  isIdle: false,
  isInternetOnline: true,
  setIdle: () => {},
});

export const useGun = () => useContext(GunContext);

export const GunProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // @ts-ignore
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!gunUser.is);
  // @ts-ignore
  const [pubKey, setPubKey] = useState<string | undefined>(() => gunUser.is?.pub);
  // Add userPair state
  // @ts-ignore
  const [userPair, setUserPair] = useState<{ pub: string, priv: string } | null>(() => (gunUser.is && gunUser.is.priv) ? { pub: gunUser.is.pub, priv: gunUser.is.priv } : null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isIdle, setIsIdle] = useState(false);
  const [isInternetOnline, setIsInternetOnline] = useState(navigator.onLine);
  const hasAuthorizedRef = useRef(false); // Ref to track authorization to prevent flapping

  useEffect(() => {
    const handleOnline = () => setIsInternetOnline(true);
    const handleOffline = () => setIsInternetOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const setIdle = (idle: boolean) => {
    setIsIdle(idle);
  };

  const disconnect = () => {
    console.log('Disconnecting Gun peers...');
    setIsConnected(false);
    // @ts-ignore
    gun.opt({ peers: [] });
    // Forcefully close existing connections if possible
    // @ts-ignore
    const peers = gun._.opt.peers;
    if (peers) {
        Object.values(peers).forEach((peer: any) => {
            if (peer.wire && peer.wire.close) {
                peer.wire.close();
            }
        });
    }
  };

  const reconnect = () => {
    console.log('Reconnecting Gun peers...');
    setIsConnected(true);
    // @ts-ignore
    gun.opt({ peers: PEERS });
  };

  useEffect(() => {
    const checkAuthorization = (pub: string) => {
      gun.get('all_users').get(pub).on((data: any) => {
        // If data exists, the user is in the directory
        if (data) {
          hasAuthorizedRef.current = true;
          setIsAuthorized(true);
          setIsAdmin(!!data.isAdmin);
          setUserProfile({
            pub,
            alias: data.alias || 'Unknown',
            displayName: data.displayName,
            bio: data.bio,
            avatarUrl: data.avatarUrl,
            email: data.email,
            isAdmin: !!data.isAdmin,
            isVolunteer: !!data.isVolunteer,
            isHost: !!data.isHost,
            submissions: data.submissions,
          });
        } else {
          // Only deny access if we haven't successfully authorized yet
          // This prevents "flashing" to Access Restricted screen if Gun sync glitches
          if (!hasAuthorizedRef.current) {
              setIsAuthorized(false);
              setIsAdmin(false);
              setUserProfile(null);
          }
        }
      });
    };

    const resolveUserPairAndAuth = (ack?: any) => {
        // We will determine final login state at the end
        // setIsLoggedIn(true); // DON'T assume true yet

        let resolvedPubKey: string | undefined;
        let resolvedPrivKey: string | undefined;
        let resolvedPair: { pub: string, priv: string } | null = null;

        // 1. Try to get from gunUser.is (most direct if already recalled)
        // @ts-ignore
        if (gunUser.is && gunUser.is.pub) {
            // @ts-ignore
            resolvedPubKey = gunUser.is.pub;
            // @ts-ignore
            resolvedPrivKey = gunUser.is.priv;
            if (resolvedPrivKey) {
                resolvedPair = { pub: resolvedPubKey as string, priv: resolvedPrivKey as string };
            }
        } 
        // 2. Fallback to ack object if provided (from auth event)
        else if (ack) {
            // @ts-ignore
            if (ack.sea && ack.sea.pub && ack.sea.priv) {
                // @ts-ignore
                resolvedPubKey = ack.sea.pub;
                // @ts-ignore
                resolvedPrivKey = ack.sea.priv;
                resolvedPair = { pub: ack.sea.pub as string, priv: ack.sea.priv as string };
            } 
            // @ts-ignore
            else if (ack.pub && ack.priv) { // Direct pair in ack
                resolvedPubKey = ack.pub;
                resolvedPrivKey = ack.priv;
                resolvedPair = { pub: ack.pub as string, priv: ack.priv as string };
            }
            // @ts-ignore
            else if (ack.pub) { // Only pub in ack, might try other sources for priv
                resolvedPubKey = ack.pub;
            }
        }

        // 3. Fallback to localStorage if we are missing either key
        // This is robust against partial loads or corrupted in-memory state
        if (!resolvedPrivKey || !resolvedPubKey) { 
            // 3a. Try explicit backup key (Added for reliability)
            try {
                const backup = localStorage.getItem('mew_user_session');
                if (backup) {
                    const sess = JSON.parse(backup);
                    if (sess && sess.pub && sess.priv) {
                         // Only use if it matches our partial load (or if we have nothing)
                         if (!resolvedPubKey || resolvedPubKey === sess.pub) {
                             resolvedPubKey = sess.pub;
                             resolvedPrivKey = sess.priv;
                             resolvedPair = { pub: sess.pub as string, priv: sess.priv as string };
                             console.log("Recovered private key from explicit 'mew_user_session' backup.");
                         }
                    }
                }
            } catch (e) { console.warn("Backup session check failed", e); }

            // 3b. Scan all storage if backup failed
            if (!resolvedPair) {
                try {
                    // Iterate through localStorage to find the correct pair
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key) {
                            const val = localStorage.getItem(key);
                            if (val) {
                                try {
                                    const storedPair = JSON.parse(val);
                                    // Determine potential keys from this item
                                    const p = storedPair.sea ? storedPair.sea.pub : storedPair.pub;
                                    const k = storedPair.sea ? storedPair.sea.priv : storedPair.priv;

                                    if (p && k) {
                                        // If we already have a pub key (partially loaded), this item MUST match it
                                        if (resolvedPubKey && resolvedPubKey !== p) continue;

                                        // Found a valid pair!
                                        resolvedPubKey = p;
                                        resolvedPrivKey = k;
                                        resolvedPair = { pub: p as string, priv: k as string };
                                        console.log("Recovered private key from localStorage scan.");
                                        break; // Found the pair, no need to continue iterating
                                    }
                                } catch (e) {
                                    // Not JSON, skip
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error attempting to retrieve pair from localStorage:", e);
                }
            }

            // If we found a pair, re-hydrate gunUser.is
            if (resolvedPair) {
                 // @ts-ignore
                 if (gunUser.is && (!gunUser.is.priv || !gunUser.is.pub)) {
                    // @ts-ignore
                    gunUser.is = { ...(gunUser.is || {}), ...resolvedPair };
                    // @ts-ignore
                    gunUser._.is = gunUser.is; // Internal update for Gun instance
                    console.log("Re-hydrated gunUser.is with recovered pair.");
                }
            }
        }

        if (resolvedPubKey && resolvedPrivKey && resolvedPair) {
            setIsLoggedIn(true);
            setPubKey(resolvedPubKey);
            setUserPair(resolvedPair);
            checkAuthorization(resolvedPubKey);
        } else if (resolvedPubKey) {
            setIsLoggedIn(true);
            setPubKey(resolvedPubKey);
            setUserPair(null); // Explicitly null if priv is missing
            console.warn("Authentication confirmed, but private key not fully available. User might be in a read-only state for some operations.");
            checkAuthorization(resolvedPubKey);
        } else {
            // Failed to resolve a user.
            setIsLoggedIn(false);
            setPubKey(undefined);
            setUserPair(null);
            console.error("Authentication check failed: No public key found. Redirecting to login.");
        }
        
        setIsAuthLoading(false);
    };

    // Check authentication status on mount and when it changes
    gun.on('auth', (ack) => {
      console.log('Authentication confirmed:', ack);
      resolveUserPairAndAuth(ack);
    });

    // Also check if already logged in (recalled from session)
    // @ts-ignore
    if (gunUser.is) {
      console.log('User session found on initial load.');
      resolveUserPairAndAuth(); // Call without ack if checking initial load
    } else {
      setIsAuthLoading(false);
    }
  }, []); // Depend on nothing to run once on mount

  return (
    <GunContext.Provider value={{ gun, user: gunUser, isLoggedIn, pubKey, userProfile, isAuthorized, isAdmin, disconnect, reconnect, isConnected, isAuthLoading, isIdle, isInternetOnline, setIdle, userPair }}>
      {children}
    </GunContext.Provider>
  );
};
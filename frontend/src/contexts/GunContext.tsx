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
        setIsLoggedIn(true); // Assume logged in if auth event fires or user.is exists
        setIsAuthLoading(false);

        let resolvedPubKey: string | undefined;
        let resolvedPrivKey: string | undefined;
        let resolvedPair: { pub: string, priv: string } | null = null;

        // 1. Try to get from gunUser.is (most direct if already recalled)
        // @ts-ignore
        if (gunUser.is && gunUser.is.pub && gunUser.is.priv) {
            // @ts-ignore
            resolvedPubKey = gunUser.is.pub;
            // @ts-ignore
            resolvedPrivKey = gunUser.is.priv;
            resolvedPair = { pub: resolvedPubKey, priv: resolvedPrivKey };
        } 
        // 2. Fallback to ack object if provided (from auth event)
        else if (ack) {
            // @ts-ignore
            if (ack.sea && ack.sea.pub && ack.sea.priv) {
                // @ts-ignore
                resolvedPubKey = ack.sea.pub;
                // @ts-ignore
                resolvedPrivKey = ack.sea.priv;
                resolvedPair = { pub: ack.sea.pub, priv: ack.sea.priv };
            } 
            // @ts-ignore
            else if (ack.pub && ack.priv) { // Direct pair in ack
                resolvedPubKey = ack.pub;
                resolvedPrivKey = ack.priv;
                resolvedPair = { pub: ack.pub, priv: ack.priv };
            }
            // @ts-ignore
            else if (ack.pub) { // Only pub in ack, might try other sources for priv
                resolvedPubKey = ack.pub;
            }
        }

        // 3. Fallback to localStorage if a complete pair is still not found
        // This allows for persistent login across tabs and browser restarts.
        if (!resolvedPrivKey && resolvedPubKey) { // Only search if we have a pub key but no priv
            try {
                // Iterate through localStorage to find the correct pair
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                        const val = localStorage.getItem(key);
                        if (val) {
                            try {
                                const storedPair = JSON.parse(val);
                                // Check if this session matches our pub key AND has a private key
                                // Gun often stores the pair under a key like "pair" or a pub key hash
                                if ((storedPair.sea && storedPair.sea.pub === resolvedPubKey && storedPair.sea.priv) ||
                                    (storedPair.pub === resolvedPubKey && storedPair.priv)) {
                                    resolvedPrivKey = storedPair.sea ? storedPair.sea.priv : storedPair.priv;
                                    resolvedPair = { pub: resolvedPubKey, priv: resolvedPrivKey };
                                    console.log("Recovered private key from localStorage.");
                                    
                                    // Crucially, re-assign to gunUser.is if it's currently incomplete
                                    // @ts-ignore
                                    if (gunUser.is && !gunUser.is.priv) {
                                        // @ts-ignore
                                        gunUser.is = { ...gunUser.is, ...resolvedPair };
                                        // @ts-ignore
                                        gunUser._.is = gunUser.is; // Internal update for Gun instance
                                        console.log("Re-hydrated gunUser.is with private key from localStorage.");
                                    }
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

        if (resolvedPubKey && resolvedPrivKey && resolvedPair) {
            setPubKey(resolvedPubKey);
            setUserPair(resolvedPair);
            checkAuthorization(resolvedPubKey);
        } else if (resolvedPubKey) {
            setPubKey(resolvedPubKey);
            setUserPair(null); // Explicitly null if priv is missing
            console.warn("Authentication confirmed, but private key not fully available. User might be in a read-only state for some operations.");
            checkAuthorization(resolvedPubKey);
        } else {
            setPubKey(undefined);
            setUserPair(null);
            console.error("Authentication confirmed but no public key found.");
        }
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

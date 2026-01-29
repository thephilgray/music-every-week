import React, { createContext, useContext, useEffect, useState } from 'react';
import gun, { user as gunUser, PEERS } from '../lib/gun';
import type { IGunUserInstance } from 'gun';
import type { UserProfile } from '../types';

interface GunContextType {
  gun: typeof gun;
  user: IGunUserInstance;
  isLoggedIn: boolean;
  pubKey: string | undefined;
  userProfile: UserProfile | null;
  isAuthorized: boolean | undefined;
  isAdmin: boolean;
  disconnect: () => void;
  reconnect: () => void;
  isConnected: boolean;
  isAuthLoading: boolean;
}

const GunContext = createContext<GunContextType>({
  gun,
  user: gunUser,
  isLoggedIn: false,
  pubKey: undefined,
  userProfile: null,
  isAuthorized: undefined,
  isAdmin: false,
  disconnect: () => {},
  reconnect: () => {},
  isConnected: true,
  isAuthLoading: true,
});

export const useGun = () => useContext(GunContext);

export const GunProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // @ts-ignore
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!gunUser.is);
  // @ts-ignore
  const [pubKey, setPubKey] = useState<string | undefined>(() => gunUser.is?.pub);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

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
          setIsAuthorized(true);
          setIsAdmin(!!data.isAdmin);
          setUserProfile({
            pub,
            alias: data.alias || 'Unknown',
            bio: data.bio,
            avatarUrl: data.avatarUrl,
            email: data.email,
            isAdmin: !!data.isAdmin,
            submissions: data.submissions,
          });
        } else {
          setIsAuthorized(false);
          setIsAdmin(false);
          setUserProfile(null);
        }
      });
    };

    // Check authentication status on mount and when it changes
    gun.on('auth', async (ack) => {
      console.log('Authentication confirmed:', ack);
      setIsLoggedIn(true);
      setIsAuthLoading(false);
      
      // Robustly determine pub key
      // @ts-ignore
      let pub = gunUser.is?.pub;
      
      // Fallback to ack if user.is isn't populated yet (common timing issue)
      if (!pub && ack) {
          // @ts-ignore
          if (ack.sea && ack.sea.pub) {
              // @ts-ignore
              pub = ack.sea.pub;
          } else if (ack.pub) {
              pub = ack.pub;
          }
      }

      console.log('Detected Pub Key:', pub);

      if (pub) {
          setPubKey(pub);
          checkAuthorization(pub);
      } else {
          console.error("Auth confirmed but no public key found in 'user.is' or 'ack'.");
      }
    });

    // Also check if already logged in (recalled from session)
    // @ts-ignore
    if (gunUser.is) {
      setIsAuthLoading(false);
      // @ts-ignore
      const pub = gunUser.is.pub;
      if (pub) {
          setPubKey(pub);
          checkAuthorization(pub);
      }
    } else {
      // If not immediately logged in, give it a moment to recall from session storage
      // If 'auth' doesn't fire within a short window, assume strictly logged out.
      const timer = setTimeout(() => {
         setIsAuthLoading(false);
      }, 500); 
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <GunContext.Provider value={{ gun, user: gunUser, isLoggedIn, pubKey, userProfile, isAuthorized, isAdmin, disconnect, reconnect, isConnected, isAuthLoading }}>
      {children}
    </GunContext.Provider>
  );
};

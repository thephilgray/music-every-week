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
});

export const useGun = () => useContext(GunContext);

export const GunProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pubKey, setPubKey] = useState<string | undefined>(undefined);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

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
      // @ts-ignore
      const pub = gunUser.is?.pub;
      setPubKey(pub);
      if (pub) checkAuthorization(pub);
    });

    // Also check if already logged in (recalled from session)
    // @ts-ignore
    if (gunUser.is) {
      setIsLoggedIn(true);
      // @ts-ignore
      const pub = gunUser.is.pub;
      setPubKey(pub);
      if (pub) checkAuthorization(pub);
    }
  }, []);

  return (
    <GunContext.Provider value={{ gun, user: gunUser, isLoggedIn, pubKey, userProfile, isAuthorized, isAdmin, disconnect, reconnect, isConnected }}>
      {children}
    </GunContext.Provider>
  );
};

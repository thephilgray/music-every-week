import React, { createContext, useContext, useEffect, useState } from 'react';
import gun, { user as gunUser } from '../lib/gun';
import type { IGunUserInstance } from 'gun';

interface GunContextType {
  gun: typeof gun;
  user: IGunUserInstance;
  isLoggedIn: boolean;
  pubKey: string | undefined;
}

const GunContext = createContext<GunContextType>({
  gun,
  user: gunUser,
  isLoggedIn: false,
  pubKey: undefined,
});

export const useGun = () => useContext(GunContext);

export const GunProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pubKey, setPubKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Check authentication status on mount and when it changes
    gun.on('auth', async (ack) => {
      console.log('Authentication confirmed:', ack);
      setIsLoggedIn(true);
      // @ts-ignore
      setPubKey(gunUser.is?.pub);
    });

    // Also check if already logged in (recalled from session)
    // @ts-ignore
    if (gunUser.is) {
      setIsLoggedIn(true);
      // @ts-ignore
      setPubKey(gunUser.is.pub);
    }
  }, []);

  return (
    <GunContext.Provider value={{ gun, user: gunUser, isLoggedIn, pubKey }}>
      {children}
    </GunContext.Provider>
  );
};

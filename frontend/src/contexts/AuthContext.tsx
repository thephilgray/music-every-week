import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, query, where, getDocs, deleteDoc, collection, onSnapshot, updateDoc, increment } from 'firebase/firestore';

import { type UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  participantEmail: string | null;
  isAdmin: boolean;
  isHost: boolean;
  settings: any;
  isLoading: boolean;
  loginAdmin: () => Promise<void>;
  loginWithGoogle: (skipAccessCheck?: boolean) => Promise<void>;
  sendMagicLink: (email: string, redirectPath?: string, skipAccessCheck?: boolean) => Promise<void>;
  completeMagicLinkSignIn: (url: string, email: string) => Promise<void>;
  logout: () => Promise<void>;
  addPoints: (amount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [participantEmail, setParticipantEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const allowedEmails = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map((e: string) => e.trim().toLowerCase());

  // 1. Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser?.email) {
        setParticipantEmail(currentUser.email);
      } else {
        setParticipantEmail(null);
        setIsAdmin(false);
        setSettings(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Profile Subscription
  useEffect(() => {
    if (!user) return;

    let unsub = () => {};
    let isCancelled = false;

    const isAllowedEmail = !!user.email && allowedEmails.includes(user.email.toLowerCase());

    const initProfile = async () => {
        setIsLoading(true);
        const profileRef = doc(db, 'profiles', user.uid);

        try {
            const profileSnap = await getDoc(profileRef);
            
            if (isCancelled) return;

            if (!profileSnap.exists()) {
                 // Creation / Migration Logic
                 let existingData = {};
                 if (user.email) {
                      const q = query(collection(db, 'profiles'), where('email', '==', user.email));
                      const querySnapshot = await getDocs(q);
                      
                      // Merge all duplicate profiles and delete them
                      const oldDocs = querySnapshot.docs;
                      for (const oldDoc of oldDocs) {
                          const docData = oldDoc.data();
                          // Strip sensitive flags that might have been erroneously given to regular users
                          delete docData.isAdmin;
                          delete docData.isHost;
                          
                          existingData = { ...docData, ...existingData };
                          await deleteDoc(oldDoc.ref);
                      }
                  }
                  
                  if (isCancelled) return;

                  const mergedProfile: any = {
                      uid: user.uid,
                      email: user.email,
                      createdAt: serverTimestamp(),
                      ...existingData,
                      isAdmin: isAllowedEmail, 
                      isHost: isAllowedEmail,
                  };

                  // Fallback to Google defaults ONLY if the user hasn't explicitly set them
                  if (!mergedProfile.displayName) mergedProfile.displayName = user.displayName || '';
                  if (!mergedProfile.alias) mergedProfile.alias = user.displayName?.replace(/\s+/g, '') || 'User' + user.uid.substring(0, 5);
                  if (!mergedProfile.avatarUrl) mergedProfile.avatarUrl = user.photoURL || '';

                  await setDoc(profileRef, mergedProfile);
            } else {
                // If profile exists, ensure isAdmin is synced with the .env file in the database
                const data = profileSnap.data();
                if (!!data.isAdmin !== isAllowedEmail) {
                    await updateDoc(profileRef, { isAdmin: isAllowedEmail });
                }
            }

            if (isCancelled) return;

            // Subscribe
            unsub = onSnapshot(profileRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    // Hardcode isAdmin to .env for absolute security, regardless of what's in DB
                    
                    
                    setIsAdmin(isAllowedEmail); // Strictly enforce .env
                    setIsHost(isAllowedEmail ? !!data.isHost : false); // Only admins can be hosts based on current setup, or you can allow data.isHost if users can be hosts
                    
                    // Actually, if users can be hosts independently of admins, we should use data.isHost. 
                    // Let's use data.isHost but ONLY if they didn't accidentally get it. 
                    // Since we stripped it during migration, if they have it now, an admin gave it to them.
                    setIsHost(!!data.isHost); 
                    
                    setSettings(data.settings || {});
                    setProfile(data as UserProfile);
                } else {
                    setIsAdmin(false);
                    setIsHost(false);
                    setSettings({});
                    setProfile(null);
                }
                setIsLoading(false);
            }, (err) => {
                console.error("Profile subscription error:", err);
                setIsLoading(false);
            });

        } catch (e) {
            console.error("Error ensuring profile:", e);
            if (!isCancelled) setIsLoading(false);
        }
    };

    initProfile();

    return () => {
        isCancelled = true;
        unsub();
    };
  }, [user]);

  const loginAdmin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
          await firebaseSignOut(auth);
          window.alert("Access Denied: Only administrators can log in here."); 
          throw new Error("Non-admin user attempted admin login.");
      }
    } catch (error: any) {
      console.error("Admin login failed", error);
      if (!(error instanceof Error && error.message.includes("Non-admin user"))) {
         window.alert(`Login failed: ${error.message}`);
      }
      throw error;
    }
  };

  const checkEmailAccess = async (email: string): Promise<boolean> => {
    const normalizedEmail = email.toLowerCase().trim();
    let isAllowed = allowedEmails.includes(normalizedEmail);

    if (!isAllowed) {
      const profileQ = query(collection(db, 'profiles'), where('email', 'in', [email, normalizedEmail]));
      const profileSnap = await getDocs(profileQ);
      if (!profileSnap.empty) isAllowed = true;
    }

    if (!isAllowed) {
      const reqQ = query(collection(db, 'requests'), where('accessList', 'array-contains-any', [email, normalizedEmail]));
      const reqSnap = await getDocs(reqQ);
      if (!reqSnap.empty) isAllowed = true;
    }

    if (!isAllowed) {
      const plQ = query(collection(db, 'playlists'), where('accessList', 'array-contains-any', [email, normalizedEmail]));
      const plSnap = await getDocs(plQ);
      if (!plSnap.empty) isAllowed = true;
    }

    return isAllowed;
  };

  const loginWithGoogle = async (skipAccessCheck: boolean = false) => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      if (!user.email) {
          await firebaseSignOut(auth);
          throw new Error("Google account must have an email address.");
      }

      if (!skipAccessCheck) {
          const isAllowed = await checkEmailAccess(user.email);
          if (!isAllowed) {
              await firebaseSignOut(auth);
              throw new Error("Access Denied: Your email is not registered or invited to any content.");
          }
      }
    } catch (error) {
      console.error("Google sign in failed", error);
      throw error;
    }
  };

  const sendMagicLink = async (email: string, redirectPath?: string, skipAccessCheck: boolean = false) => {
    const normalizedEmail = email.toLowerCase().trim();

    if (!skipAccessCheck) {
      const isAllowed = await checkEmailAccess(email);
      if (!isAllowed) {
        throw new Error("Access Denied: Your email is not registered or invited to any content.");
      }
    }

    const actionCodeSettings = {
      url: `${window.location.origin}/finish-sign-in${redirectPath ? `?redirectPath=${encodeURIComponent(redirectPath)}` : ''}`,
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, normalizedEmail, actionCodeSettings);
    window.localStorage.setItem('emailForSignIn', normalizedEmail);
  };

  const completeMagicLinkSignIn = async (url: string, email: string) => {
    if (isSignInWithEmailLink(auth, url)) {
      await signInWithEmailLink(auth, email, url);
      window.localStorage.removeItem('emailForSignIn');
    } else {
      throw new Error("Invalid magic link URL.");
    }
  };

  const addPoints = async (amount: number) => {
      if (!user?.uid) return;
      try {
          const profileRef = doc(db, 'profiles', user.uid);
          await updateDoc(profileRef, {
              points: increment(amount)
          });
      } catch (e) {
          console.error("Failed to add points:", e);
      }
  };

  const logout = async () => {
    if (user) {
      await firebaseSignOut(auth);
    }
    window.localStorage.removeItem('emailForSignIn');
    setParticipantEmail(null);
    setIsAdmin(false);
    setSettings(null);
  };

  const value = {
    user,
    profile,
    participantEmail,
    isAdmin,
    isHost,
    settings,
    isLoading,
    loginAdmin,
    loginWithGoogle,
    sendMagicLink,
    completeMagicLinkSignIn,
    logout,
    addPoints
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

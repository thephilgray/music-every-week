import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, query, where, getDocs, deleteDoc, collection, onSnapshot, updateDoc, increment, arrayUnion, arrayRemove } from 'firebase/firestore';

import { type UserProfile } from '../types';
import { safeSetItem, safeRemoveItem } from '../lib/storage';

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
  toggleFollow: (targetUid: string) => Promise<void>;
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

  const allowedEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter((e: string) => e.length > 0);

  // 1. Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser?.email) {
        setParticipantEmail(currentUser.email);
        const isEmailAdmin = allowedEmails.includes(currentUser.email.toLowerCase());
        setIsAdmin(isEmailAdmin);
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

            let existingData = profileSnap.exists() ? profileSnap.data() : {};
            let shouldMerge = !profileSnap.exists();
            
            // Check for potential duplicate profiles with different email casing
            // This also catches profiles with the same email but different UID (e.g. from GunDB migration)
            if (user.email) {
                const normalizedEmail = user.email.toLowerCase();
                // Query for any profiles with the same email (exact or case-mismatch)
                // Firestore 'in' query can match up to 10 values; we use [raw, lowercase]
                const q = query(
                    collection(db, 'profiles'), 
                    where('email', 'in', Array.from(new Set([user.email, normalizedEmail])))
                );
                const querySnapshot = await getDocs(q);
                
                for (const oldDoc of querySnapshot.docs) {
                    if (oldDoc.id === user.uid) continue;
                    
                    const docData = oldDoc.data();
                    // Merge old profile data into our current profile object
                    // We prefer current user data over old data if there's a conflict
                    existingData = { ...docData, ...existingData };
                    // Delete the duplicate
                    await deleteDoc(oldDoc.ref);
                    shouldMerge = true;
                    console.log(`Merged duplicate profile: ${oldDoc.id} into ${user.uid}`);
                }
            }

            if (shouldMerge || !profileSnap.exists()) {
                const mergedProfile: any = {
                    uid: user.uid,
                    email: user.email?.toLowerCase() || user.email, // Always store as lowercase
                    createdAt: existingData.createdAt || serverTimestamp(),
                    ...existingData,
                    isAdmin: isAllowedEmail, 
                    isHost: isAllowedEmail,
                    updatedAt: serverTimestamp()
                };

                // Fallback to Google defaults ONLY if the user hasn't explicitly set them
                if (!mergedProfile.displayName) mergedProfile.displayName = user.displayName || '';
                if (!mergedProfile.alias) mergedProfile.alias = user.displayName?.replace(/\s+/g, '') || 'User' + user.uid.substring(0, 5);
                if (!mergedProfile.avatarUrl) mergedProfile.avatarUrl = user.photoURL || '';

                await setDoc(profileRef, mergedProfile);
            } else {
                // If profile exists and no merge needed, ensure isAdmin is synced
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
                    
                    // isAdmin is strictly tied to the .env file for security
                    const adminStatus = isAllowedEmail;
                    setIsAdmin(adminStatus);
                    
                    // isHost is true if user is admin OR if they have the isHost flag in Firestore
                    // We use nullish coalescing to allow an explicit 'false' to override the admin default
                    setIsHost(data.isHost ?? adminStatus); 

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
    safeSetItem('emailForSignIn', normalizedEmail);
  };

  const completeMagicLinkSignIn = async (url: string, email: string) => {
    if (isSignInWithEmailLink(auth, url)) {
      await signInWithEmailLink(auth, email, url);
      safeRemoveItem('emailForSignIn');
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
          // Dispatch event for UI animation
          window.dispatchEvent(new CustomEvent('pointsAdded', { detail: { amount } }));
      } catch (e) {
          console.error("Failed to add points:", e);
      }
  };

  const toggleFollow = async (targetUid: string) => {
      if (!user?.uid) throw new Error("Must be logged in to follow users.");
      if (user.uid === targetUid) throw new Error("You cannot follow yourself.");
      
      const profileRef = doc(db, 'profiles', user.uid);
      const isFollowing = profile?.following?.includes(targetUid);
      
      try {
          await updateDoc(profileRef, {
              following: isFollowing ? arrayRemove(targetUid) : arrayUnion(targetUid)
          });
      } catch (e) {
          console.error("Failed to toggle follow:", e);
          throw e;
      }
  };

  const logout = async () => {
    if (user) {
      await firebaseSignOut(auth);
    }
    safeRemoveItem('emailForSignIn');
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
    addPoints,
    toggleFollow
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

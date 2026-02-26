import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, query, where, getDocs, deleteDoc, collection, addDoc, onSnapshot } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  participantEmail: string | null;
  isAdmin: boolean;
  isHost: boolean; // Added isHost to AuthContextType
  settings: any;
  isLoading: boolean;
  loginAdmin: () => Promise<void>;
  loginParticipant: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [participantEmail, setParticipantEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHost, setIsHost] = useState(false); // Added isHost state
  const [settings, setSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
          setIsAdmin(false);
          setSettings(null);
          setIsLoading(false);
      }
    });

    // Load Participant Email
    const storedEmail = localStorage.getItem('mew_participant_email') || sessionStorage.getItem('mew_auth_email');
    if (storedEmail) {
      setParticipantEmail(storedEmail);
      localStorage.setItem('mew_participant_email', storedEmail);
    }

    return () => unsubscribe();
  }, []);

  // 2. Profile Subscription
  useEffect(() => {
    if (!user) return;

    let unsub = () => {};
    let isCancelled = false;

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
                      if (!querySnapshot.empty) {
                          const oldDoc = querySnapshot.docs[0];
                          existingData = oldDoc.data();
                          await deleteDoc(oldDoc.ref);
                      }
                  }
                  
                  if (isCancelled) return;

                  await setDoc(profileRef, {
                      uid: user.uid,
                      email: user.email,
                      displayName: user.displayName,
                      alias: user.displayName?.replace(/\s+/g, '') || 'User' + user.uid.substring(0, 5),
                      avatarUrl: user.photoURL,
                      createdAt: serverTimestamp(),
                      isAdmin: false, 
                      isHost: false, // Changed from true to false for security
                      ...existingData
                  });
            }

            if (isCancelled) return;

            // Subscribe
            unsub = onSnapshot(profileRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setIsAdmin(!!data.isAdmin);
                    setIsHost(!!data.isHost); // Set isHost state
                    setSettings(data.settings || {});
                } else {
                    setIsAdmin(false);
                    setIsHost(false); // Reset isHost on no profile
                    setSettings({});
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

      // Check if user is an admin by fetching their profile
      const profileRef = doc(db, 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);

      if (profileSnap.exists()) {
        const profileData = profileSnap.data();
        if (!profileData.isAdmin) {
          await firebaseSignOut(auth);
          // Temporarily use window.alert as useToast is not available here easily.
          // For a robust solution, consider passing a toast function or using a global event.
          window.alert("Access Denied: Only administrators can log in here."); 
          throw new Error("Non-admin user attempted admin login.");
        }
      } else {
        // If no profile exists, assume not an admin and log out
        await firebaseSignOut(auth);
        window.alert("Access Denied: Your profile does not have administrator privileges.");
        throw new Error("Profile not found, non-admin user attempted admin login.");
      }
    } catch (error: any) {
      console.error("Admin login failed", error);
      // Only show alert for Firebase auth errors, not for our custom access denied errors
      if (!(error instanceof Error && (error.message.includes("Non-admin user") || error.message.includes("Profile not found")))) {
         window.alert(`Login failed: ${error.message}`);
      }
      throw error;
    }
  };

  const loginParticipant = async (email: string) => {
    try {
      // Check if profile exists by email
      const q = query(collection(db, 'profiles'), where('email', '==', email));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // Create new profile for participant
        const alias = email.split('@')[0] + Math.floor(Math.random() * 1000);
        await addDoc(collection(db, 'profiles'), {
          email: email,
          alias: alias,
          createdAt: serverTimestamp(),
          isAdmin: false,
          isHost: false
        });
      }
    } catch (e) {
      console.error("Error creating participant profile:", e);
    }

    localStorage.setItem('mew_participant_email', email);
    setParticipantEmail(email);
  };

  const logout = async () => {
    if (user) {
      await firebaseSignOut(auth);
    }
    localStorage.removeItem('mew_participant_email');
    sessionStorage.removeItem('mew_auth_email');
    setParticipantEmail(null);
    setIsAdmin(false);
    setSettings(null);
  };

  const value = {
    user,
    participantEmail,
    isAdmin,
    isHost, // Added isHost to context value
    settings,
    isLoading,
    loginAdmin,
    loginParticipant,
    logout
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

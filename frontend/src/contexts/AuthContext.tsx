import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase'; // Added db
import { doc, getDoc, setDoc, serverTimestamp, query, where, getDocs, deleteDoc, collection, addDoc } from 'firebase/firestore'; // Added Firestore functions

interface AuthContextType {
  user: User | null;
  participantEmail: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  loginAdmin: () => Promise<void>;
  loginParticipant: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [participantEmail, setParticipantEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Firebase Auth Listener (Admins)
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
          // Ensure Profile Exists
          try {
              const profileRef = doc(db, 'profiles', currentUser.uid);
              const profileSnap = await getDoc(profileRef);
              
              if (!profileSnap.exists()) {
                  // Check if a "migrated" profile exists with this email but a random ID
                  let existingData = {};
                  if (currentUser.email) {
                      const q = query(collection(db, 'profiles'), where('email', '==', currentUser.email));
                      const querySnapshot = await getDocs(q);
                      if (!querySnapshot.empty) {
                          const oldDoc = querySnapshot.docs[0];
                          existingData = oldDoc.data();
                          // Delete the old doc to "move" it to the new UID
                          await deleteDoc(oldDoc.ref);
                          console.log("Migrated existing profile data to new UID for:", currentUser.email);
                      }
                  }

                  // Create profile at UID with merged data
                  await setDoc(profileRef, {
                      uid: currentUser.uid,
                      email: currentUser.email,
                      displayName: currentUser.displayName,
                      alias: currentUser.displayName?.replace(/\s+/g, '') || 'User' + currentUser.uid.substring(0, 5),
                      avatarUrl: currentUser.photoURL,
                      createdAt: serverTimestamp(),
                      isAdmin: false, 
                      isHost: true,
                      ...existingData // Merge migrated data (overwrites defaults if present)
                      // Ensure critical Auth fields aren't overwritten by potentially stale migration data if necessary,
                      // but usually migration data (like bio, links) is preferred.
                      // We ensure UID matches the auth UID.
                  });
                  console.log("Created/Merged profile for user:", currentUser.uid);
              }
          } catch (e) {
              console.error("Error creating/checking profile:", e);
          }
      }

      setIsLoading(false);
    });

    // 2. Participant Email (LocalStorage/SessionStorage)
    // Check localStorage first, then sessionStorage (migration support)
    const storedEmail = localStorage.getItem('mew_participant_email') || sessionStorage.getItem('mew_auth_email');
    if (storedEmail) {
      setParticipantEmail(storedEmail);
      // Ensure it's in localStorage for future
      localStorage.setItem('mew_participant_email', storedEmail);
    }

    return () => unsubscribe();
  }, []);

  const loginAdmin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Admin login failed", error);
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
        console.log("Created basic profile for participant:", email);
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
    sessionStorage.removeItem('mew_auth_email'); // Clean up legacy
    setParticipantEmail(null);
  };

  const value = {
    user,
    participantEmail,
    isAdmin: !!user,
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

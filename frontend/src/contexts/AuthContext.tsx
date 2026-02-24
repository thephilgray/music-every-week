import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  participantEmail: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  loginAdmin: () => Promise<void>;
  loginParticipant: (email: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [participantEmail, setParticipantEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Firebase Auth Listener (Admins)
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // Only set loading to false if we're not waiting for something else?
      // Actually, onAuthStateChanged fires pretty quickly.
      // We might want to handle the initial load better if needed.
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

  const loginParticipant = (email: string) => {
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

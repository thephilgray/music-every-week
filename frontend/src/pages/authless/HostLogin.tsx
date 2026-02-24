import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, googleProvider } from '../../lib/firebase';
import { signInWithPopup } from 'firebase/auth';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HostLoginProps {
  redirectTo?: string;
}

export function HostLogin({ redirectTo }: HostLoginProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginParticipant } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedEmails = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map((e: string) => e.trim().toLowerCase());

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
        // Automatically log in as participant
        loginParticipant(user.email);
        
        const dest = (location.state as any)?.from?.pathname || redirectTo || '/host/dashboard';
        navigate(dest);
      } else {
        await auth.signOut();
        setError('Unauthorized email. Please use an allowed admin account.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-900 p-8 rounded-lg border border-gray-800">
        <h1 className="text-2xl font-bold mb-6 text-center">Host Access</h1>
        
        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 p-4 rounded mb-6 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full bg-white text-gray-900 font-bold py-3 px-4 rounded transition hover:bg-gray-100 flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="animate-spin w-5 h-5" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </>
          )}
        </button>
      </div>
    </div>
  );
}

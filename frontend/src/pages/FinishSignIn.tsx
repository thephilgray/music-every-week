import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, AlertCircle } from 'lucide-react';
import { safeGetItem } from '../lib/storage';

export function FinishSignIn() {
  const { completeMagicLinkSignIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  

  useEffect(() => {
    async function handleSignIn() {
      // If user is already logged in, navigate away
      if (user) {
        navigate('/');
        return;
      }

      try {
        let email = safeGetItem('emailForSignIn');
        
        if (!email) {
          // Cross-device logic: User opened the link on a different device
          email = window.prompt('Please provide your email for confirmation');
        }

        if (email) {
          await completeMagicLinkSignIn(window.location.href, email);
          
          // Redirect to the originally intended path if specified, else root
          const searchParams = new URLSearchParams(location.search);
          const redirectPath = searchParams.get('redirectPath');
          navigate(redirectPath || '/');
        } else {
          setError('Email is required to complete sign in.');
          
        }
      } catch (err: any) {
        console.error("Error during magic link sign in:", err);
        setError(err.message || "Failed to sign in. The link may be invalid or expired.");
        
      }
    }

    handleSignIn();
  }, [completeMagicLinkSignIn, navigate, location, user]);

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-900 p-8 rounded-lg border border-red-800 text-center">
          <div className="flex justify-center mb-4">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-white">Sign In Failed</h2>
          <p className="text-red-300 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
      <Loader2 className="animate-spin w-12 h-12 text-blue-500 mb-4" />
      <h2 className="text-xl font-semibold">Completing sign in...</h2>
      <p className="text-gray-400 mt-2">Please wait while we verify your secure link.</p>
    </div>
  );
}
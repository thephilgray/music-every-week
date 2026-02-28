import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, MailCheck } from 'lucide-react';

export function ParticipantAuth() {
  const { sendMagicLink, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || isGoogleLoading) return;
    
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
        setError("Email is required.");
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setError("Please enter a valid email address.");
        return;
    }

    setIsLoading(true);
    setError(null);

    try {
        await sendMagicLink(trimmedEmail);
        setLinkSent(true);
    } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to send magic link. Please try again.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isLoading || isGoogleLoading) return;
    setIsGoogleLoading(true);
    setError(null);

    try {
      await loginWithGoogle();
      // Navigation will be handled by AuthGuard responding to auth state change
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Google sign-in failed. Please try again.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  if (linkSent) {
    return (
      <div className="max-w-md mx-auto mt-10 p-8 bg-gray-800 rounded-lg shadow-xl border border-gray-700 text-center">
        <div className="flex justify-center mb-4">
          <MailCheck className="w-16 h-16 text-blue-500" />
        </div>
        <h2 className="text-2xl font-bold mb-4 text-white">Check Your Email</h2>
        <p className="text-gray-300 mb-4">
          We've sent a magic link to <span className="font-semibold text-white">{email}</span>. Click the link in the email to sign in.
        </p>
        <p className="text-sm text-yellow-500/90 bg-yellow-500/10 p-3 rounded border border-yellow-500/20 mb-6">
          <strong>Don't see it?</strong> Please check your spam or junk folder.
        </p>
        <button
          onClick={() => setLinkSent(false)}
          className="text-sm text-blue-400 hover:text-blue-300 underline"
        >
          Try a different email address
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-gray-800 rounded-lg shadow-xl border border-gray-700">
      <h2 className="text-2xl font-bold mb-6 text-center text-white">
        Member Access
      </h2>
      
      <div className="space-y-4">
        <div>
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading || isGoogleLoading}
            className="w-full bg-white text-gray-900 font-bold py-2.5 px-4 rounded-md transition hover:bg-gray-100 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            {isGoogleLoading ? (
              <Loader2 className="animate-spin w-5 h-5" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Sign in with Google
              </>
            )}
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            Use the Google account associated with your invited email.
          </p>
        </div>

        <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-700"></div>
            <span className="flex-shrink-0 mx-4 text-gray-500 text-sm">or</span>
            <div className="flex-grow border-t border-gray-700"></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="you@example.com"
                  required
                  disabled={isLoading || isGoogleLoading}
              />
              <p className="text-xs text-gray-500 mt-2">
                  We'll send you a magic link to securely sign in without a password.
              </p>
          </div>

          {error && (
              <div className="bg-red-900/50 border border-red-800 text-red-200 p-3 rounded text-sm text-center">
                  {error}
              </div>
          )}

          <button
            type="submit"
            disabled={isLoading || isGoogleLoading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Send Magic Link
          </button>
        </form>
      </div>
    </div>
  );
}

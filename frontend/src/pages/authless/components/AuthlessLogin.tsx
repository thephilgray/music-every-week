import React, { useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';

interface AuthlessLoginProps {
  onLogin: (email: string) => Promise<void>;
  isVerifying?: boolean;
  error?: string;
}

export function AuthlessLogin({ onLogin, isVerifying, error }: AuthlessLoginProps) {
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (email.trim()) {
      try {
        await onLogin(email.trim().toLowerCase());
        setLinkSent(true);
      } catch (err: any) {
        setLocalError(err.message || 'Failed to send login link.');
      }
    }
  };

  if (linkSent) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-900 p-8 rounded-lg border border-gray-800 shadow-xl text-center">
          <div className="flex justify-center mb-4">
            <MailCheck className="w-16 h-16 text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-white">Check Your Email</h2>
          <p className="text-gray-300 mb-4">
            We've sent a magic link to <span className="font-semibold text-white">{email}</span>. Click the link in the email to access this page.
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-900 p-8 rounded-lg border border-gray-800 shadow-xl">
        <h2 className="text-2xl font-bold mb-2 text-center text-white">Welcome</h2>
        <p className="text-gray-400 text-center mb-8">Please enter your email to access this content. We will send you a secure login link.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white focus:outline-none focus:border-blue-500 transition placeholder-gray-600"
              placeholder="you@example.com"
              autoFocus
            />
          </div>
          
          {(error || localError) && (
            <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-2 rounded text-sm">
              {error || localError}
            </div>
          )}

          <button
            type="submit"
            disabled={isVerifying}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <Loader2 className="animate-spin w-5 h-5" />
                <span>Sending Link...</span>
              </>
            ) : (
              'Send Magic Link'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

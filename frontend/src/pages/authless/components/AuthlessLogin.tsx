import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface AuthlessLoginProps {
  onLogin: (email: string) => void;
  isVerifying?: boolean;
  error?: string;
}

export function AuthlessLogin({ onLogin, isVerifying, error }: AuthlessLoginProps) {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      onLogin(email.trim().toLowerCase());
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-900 p-8 rounded-lg border border-gray-800 shadow-xl">
        <h2 className="text-2xl font-bold mb-2 text-center text-white">Welcome</h2>
        <p className="text-gray-400 text-center mb-8">Please enter your email to access this content.</p>
        
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
          
          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-2 rounded text-sm">
              {error}
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
                <span>Verifying Access...</span>
              </>
            ) : (
              'Enter'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function ParticipantAuth() {
  const { loginParticipant } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
        setError("Email is required.");
        return;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setError("Please enter a valid email address.");
        return;
    }

    setIsLoading(true);
    setError(null);

    try {
        // In the future, this might involve an actual backend check or magic link.
        // For now, it's just setting the context.
        await loginParticipant(trimmedEmail);
        // Navigation will be handled by the parent/router logic responding to auth state change
    } catch (err) {
        console.error(err);
        setError("Failed to login.");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-gray-800 rounded-lg shadow-xl border border-gray-700">
      <h2 className="text-2xl font-bold mb-6 text-center text-white">
        Member Access
      </h2>
      
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
                disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-2">
                We use your email to identify your contributions. No password required for now.
            </p>
        </div>

        {error && (
            <div className="bg-red-900/50 border border-red-800 text-red-200 p-3 rounded text-sm text-center">
                {error}
            </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          Enter
        </button>
      </form>
    </div>
  );
}

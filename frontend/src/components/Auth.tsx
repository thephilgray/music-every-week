import React, { useState } from 'react';
import { useGun } from '../contexts/GunContext';

export const Auth: React.FC = () => {
  const { gun, user } = useGun();
  const [alias, setAlias] = useState('');
  const [pass, setPass] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSignup) {
      const adminSecret = import.meta.env.VITE_ADMIN_SECRET;

      const proceedWithSignup = (isAdmin = false) => {
        user.create(alias, pass, (ack: any) => {
          if (ack.err) {
            setError(ack.err);
            return;
          }
          // Auto login after signup
          user.auth(alias, pass, (authAck: any) => {
             if (authAck.err) {
                 setError(authAck.err);
                 return;
             }
             // Add to Directory
             // @ts-ignore
             const pub = user.is?.pub;
             if (pub) {
                 gun.get('all_users').get(pub).put({
                     alias,
                     pub,
                     joinedAt: Date.now(),
                     isAdmin
                 });
                 
                 // If invite used, consume it (unless admin/genesis)
                 if (!isAdmin && inviteCode) {
                     gun.get('invites').get(inviteCode).put(null); 
                 }
             }
          });
        });
      };

      if (inviteCode && inviteCode === adminSecret) {
          proceedWithSignup(true);
      } else if (inviteCode) {
          gun.get('invites').get(inviteCode).once((data: any) => {
              if (data) {
                  proceedWithSignup(false);
              } else {
                  setError("Invalid Invite Code");
              }
          });
      } else {
          setError("Invite Code is required");
      }

    } else {
      user.auth(alias, pass, (ack: any) => {
        if (ack.err) {
          setError(ack.err);
        }
      });
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-gray-800 rounded-lg shadow-xl">
      <h2 className="text-2xl font-bold mb-6 text-center text-white">
        {isSignup ? 'Create Account' : 'Login'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300">Username (Alias)</label>
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Password</label>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        {isSignup && (
          <div>
            <label className="block text-sm font-medium text-gray-300">Invite Code</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter invite code"
              required
            />
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-semibold transition"
        >
          {isSignup ? 'Sign Up' : 'Log In'}
        </button>
      </form>
      <div className="mt-4 text-center">
        <button
          onClick={() => setIsSignup(!isSignup)}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  );
};

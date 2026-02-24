import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children?: React.ReactNode;
  require: 'admin' | 'participant';
}

export function AuthGuard({ children, require }: AuthGuardProps) {
  const { user, participantEmail, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (isLoading) return;

    if (require === 'admin') {
      const allowedEmails = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map((e: string) => e.trim().toLowerCase());
      
      if (!user) {
        // Redirect to admin login
        navigate('/host/login', { state: { from: location } });
      } else if (user.email && !allowedEmails.includes(user.email.toLowerCase())) {
        // Logged in but not allowed
        // Ideally show an error, but redirecting to login lets them switch account
        navigate('/host/login', { state: { error: 'Unauthorized email' } });
      } else {
        setIsChecking(false);
      }
    } else if (require === 'participant') {
      if (!participantEmail) {
        // Redirect to participant login (LandingPage)
        navigate('/login', { state: { from: location } });
      } else {
        setIsChecking(false);
      }
    }
  }, [user, participantEmail, isLoading, require, navigate, location]);

  if (isLoading || isChecking) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="animate-spin w-12 h-12 text-blue-500" />
      </div>
    );
  }

  return <>{children || <Outlet />}</>;
}

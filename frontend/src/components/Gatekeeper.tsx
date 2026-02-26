import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface GatekeeperProps {
  children: React.ReactNode;
}

export function Gatekeeper({ children }: GatekeeperProps) {
  const { user, participantEmail, isLoading } = useAuth(); // Destructure participantEmail
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-900 text-white">
        <Loader2 className="animate-spin h-12 w-12 text-blue-500" />
      </div>
    );
  }

  // If neither a Firebase user is logged in nor a participant email is set, redirect to general login
  if (!user && !participantEmail) {
    navigate('/login'); // Assuming /login is the general entry for participants or Firebase auth
    return null; // Don't render anything while redirecting
  }

  // If either Firebase user is logged in OR a participant email is set, render children
  return <>{children}</>;
}

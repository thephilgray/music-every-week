import { useAuth } from '../contexts/AuthContext';
import { PromptCard } from './PromptCard';
import { Skeleton } from './ui/Skeleton';
import { usePrerequisiteCheck } from '../hooks/usePrerequisiteCheck';
import type { Prompt } from '../types';
import { Music } from 'lucide-react';

interface PromptListProps {
  requests: Prompt[];
  loading: boolean;
  filter?: 'active' | 'archived' | 'mine';
}

export function PromptList({ requests, loading, filter = 'active' }: PromptListProps) {
  const { user, participantEmail, isAdmin } = useAuth();

  // Batch-check prerequisite eligibility for all prompts with prerequisites
  const { eligibility: prerequisiteStatus } = usePrerequisiteCheck(
    requests,
    user?.uid ?? null,
    user?.email || participantEmail
  );

  // Filter Logic based on deadline, status, start date, and prerequisites
  const filtered = requests.filter(req => {
      const isExpired = req.deadline ? new Date(req.deadline).getTime() < Date.now() : false;
      
      const currentUserEmail = user?.email || participantEmail;
      
      const isOwner = req.hostEmail && currentUserEmail && req.hostEmail === currentUserEmail;
      const isJoined = currentUserEmail && req.accessList?.includes(currentUserEmail);

      // 1. Privacy Check: Must be Admin, Owner, or in Access List
      if (!isAdmin && !isOwner && !isJoined) return false;

      // 2. Start Date Check: Hide if not yet started (unless host/admin)
      if (req.startDate && new Date(req.startDate).getTime() > Date.now()) {
          if (!isAdmin && !isOwner) return false;
      }

      // 3. Prerequisite Check: Hide if prerequisite not met (unless host/admin)
      if (req.prerequisitePromptId && !isAdmin && !isOwner) {
          if (!prerequisiteStatus.get(req.id!)) return false;
      }
      
      if (filter === 'active') {
          return !isExpired; 
      }
      if (filter === 'archived') {
          return isExpired;
      }
      return true;
  });

  if (loading && filtered.length === 0) {
      return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
      );
  }

  if (filtered.length === 0) {
      return (
          <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-800">
              <Music className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500">No {filter} prompts found.</p>
          </div>
      );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filtered.map(req => {
          const isClosed = req.deadline ? new Date(req.deadline).getTime() < Date.now() : false;
          return (
            <PromptCard 
                key={req.id} 
                request={req} 
                isClosed={isClosed}
            />
          );
      })}
    </div>
  );
}
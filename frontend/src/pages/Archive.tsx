import { useState, useEffect } from 'react';
import { Archive as ArchiveIcon } from 'lucide-react';
import { PromptList } from '../components/PromptList';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import type { Prompt } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getTimestampAsNumber } from '../lib/utils';

export function Archive() {
  const { user, participantEmail } = useAuth();
  const [requests, setRequests] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user && !participantEmail) return;
    
    setLoading(true);
    const email = user?.email || participantEmail;
    const uid = user?.uid;

    const unsubs: (() => void)[] = [];
    const resultsMap = new Map<string, Prompt>();

    const updateState = () => {
        const sorted = Array.from(resultsMap.values())
            .filter(req => !req.deleted)
            .sort((a, b) => getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt));
        setRequests(sorted);
        setLoading(false);
    };

    // 1. Query for Owner
    if (uid) {
        const qOwner = query(collection(db, 'requests'), where('ownerPub', '==', uid));
        unsubs.push(onSnapshot(qOwner, (snap) => {
            snap.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as Prompt));
            updateState();
        }));
    }

    // 2. Query for Invited
    if (email) {
        const qInvited = query(collection(db, 'requests'), where('accessList', 'array-contains', email));
        unsubs.push(onSnapshot(qInvited, (snap) => {
            snap.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as Prompt));
            updateState();
        }));
    }

    // 3. (REMOVED) Public Volunteer Pools and Direct Links are NOT shown here by default.

    return () => unsubs.forEach(unsub => unsub());
  }, [user, participantEmail]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center text-gray-400">
           <ArchiveIcon className="w-6 h-6" />
        </div>
        <div>
           <h1 className="text-3xl font-bold text-white mb-1">Prompt Archive</h1>
           <p className="text-gray-400">Past sessions and collaborations</p>
        </div>
      </div>

      <PromptList requests={requests} loading={loading} filter="archived" />
    </div>
  );
}

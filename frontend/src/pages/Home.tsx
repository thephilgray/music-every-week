import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { CreateRequest } from '../components/CreateRequest';
import { RequestList } from '../components/RequestList';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import type { FileRequest } from '../types';
import { getTimestampAsNumber } from '../lib/utils';

export function Home() {
  const { user, isAdmin, participantEmail } = useAuth(); 
  const [showCreate, setShowCreate] = useState(false);
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only fetch if we have some form of identification
    if (!user && !participantEmail) {
        setLoading(false);
        return;
    }
    
    setLoading(true);
    const email = user?.email || participantEmail;
    const uid = user?.uid;

    const unsubs: (() => void)[] = [];
    const resultsMap = new Map<string, FileRequest>();

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
            snap.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as FileRequest));
            updateState();
        }, (err) => console.error("Owner query error:", err)));
    }

    // 2. Query for Invited
    if (email) {
        const qInvited = query(collection(db, 'requests'), where('accessList', 'array-contains', email));
        unsubs.push(onSnapshot(qInvited, (snap) => {
            snap.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as FileRequest));
            updateState();
        }, (err) => console.error("Invited query error:", err)));
    }

    // 3. (REMOVED) Public Volunteer Pools and Direct Links are NOT shown on Home by default
    // unless you are an owner or invited. They remain accessible via direct link.

    return () => unsubs.forEach(unsub => unsub());
  }, [user, participantEmail]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 p-4">
      <div className="flex items-center justify-between">
        <div>
           <div className="flex items-center gap-3">
               <h1 className="text-3xl font-bold text-white mb-2">Active Requests</h1>
           </div>
           <p className="text-gray-400">Submit tracks, listen, and provide feedback</p>
        </div>
        {user && isAdmin && ( 
        <button 
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20"
        >
          <Plus className={`w-5 h-5 transition-transform ${showCreate ? 'rotate-45' : ''}`} />
          <span className="md:hidden">{showCreate ? 'Cancel' : 'New'}</span>
          <span className="hidden md:inline">{showCreate ? 'Cancel' : 'New Request'}</span>
        </button>
        )}
      </div>

      {showCreate && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4">
           <CreateRequest />
        </div>
      )}

      <RequestList 
          requests={requests} 
          loading={loading} 
          filter="active" 
      />
    </div>
  );
}

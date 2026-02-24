import { useState, useEffect } from 'react';
import { Archive as ArchiveIcon } from 'lucide-react';
import { RequestList } from '../components/RequestList';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import type { FileRequest } from '../types';

export function Archive() {
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const loadedRequests = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as FileRequest));
        setRequests(loadedRequests);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching requests:", error);
        setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center text-gray-400">
           <ArchiveIcon className="w-6 h-6" />
        </div>
        <div>
           <h1 className="text-3xl font-bold text-white mb-1">Request Archive</h1>
           <p className="text-gray-400">Past sessions and collaborations</p>
        </div>
      </div>

      <RequestList requests={requests} loading={loading} filter="archived" />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { CreateRequest } from '../components/CreateRequest';
import { RequestList } from '../components/RequestList';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import type { FileRequest } from '../types';

export function Home() {
  const { user, isHost } = useAuth(); // Destructure isHost
  const [showCreate, setShowCreate] = useState(false);
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to Requests (Real-time)
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
    <div className="max-w-5xl mx-auto space-y-8 pb-20 p-4">
      <div className="flex items-center justify-between">
        <div>
           <div className="flex items-center gap-3">
               <h1 className="text-3xl font-bold text-white mb-2">Active Requests</h1>
           </div>
           <p className="text-gray-400">Submit tracks, listen, and provide feedback</p>
        </div>
        {user && isHost && ( // Conditionally render based on user and isHost
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

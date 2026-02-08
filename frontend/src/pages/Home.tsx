import { useState, useEffect } from 'react';
import { Plus, Music, AlertCircle } from 'lucide-react';
import { CreateRequest } from '../components/CreateRequest';
import { RequestList } from '../components/RequestList';
import { useGun } from '../contexts/GunContext';
import type { FileRequest } from '../types';

export function Home() {
  const { gun, user, pubKey, isInternetOnline, userProfile } = useGun();
  const [showCreate, setShowCreate] = useState(false);
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [participation, setParticipation] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !pubKey) return;

    // 1. Listen to Participation Status (Scoped)
    user.get('participation').map().on((status: any, reqId: string) => {
        setParticipation(prev => ({ ...prev, [reqId]: status }));
    });

    const reqMap = new Map<string, FileRequest>();
    let batchTimeout: ReturnType<typeof setTimeout> | null = null;

    const updateState = () => {
        setRequests(Array.from(reqMap.values()));
        setLoading(false);
        batchTimeout = null;
    };

    // 2. Listen to Global Requests (Public Scoped Graph via useGun)
    gun.get('file_requests').map().on((data: any, key: string) => {
        if (data && data.title) {
            // console.log("Fetched Global Request:", key, data.title, data.ownerPub);
            reqMap.set(key, { ...data, id: key });
            
            // Debounce/Batch update
            if (!batchTimeout) {
                batchTimeout = setTimeout(updateState, 100);
            }
        }
    });
    
    // Fallback: If no requests found within 2s, stop loading
    const timer = setTimeout(() => setLoading(false), 2000);
    
    return () => {
        reqMap.clear();
        if (batchTimeout) clearTimeout(batchTimeout);
        clearTimeout(timer);
    };
  }, [user, pubKey, gun]);

  // Filter for View
  const visibleRequests = requests.filter(req => {
      if (!req.id) return false;
      const isOwner = req.ownerPub === pubKey;
      const isDirect = req.accessMode === 'direct'; 
      
      const myStatus = participation[req.id];
      
      // Logic: Show if I created it, OR if it's public, OR if I have interacted with it (joined/invited)
      return isOwner || isDirect || myStatus === 'accepted' || myStatus === 'joined' || myStatus === 'invited';
  }).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 p-4">
      <div className="flex items-center justify-between">
        <div>
           <div className="flex items-center gap-3">
               <h1 className="text-3xl font-bold text-white mb-2">Active Requests</h1>
               {!isInternetOnline && (
                  <span className="bg-red-900/50 text-red-200 text-xs px-2 py-1 rounded flex items-center gap-1 border border-red-800">
                      <AlertCircle className="w-3 h-3" /> Offline
                  </span>
               )}
           </div>
           <p className="text-gray-400">Manage your collaborative sessions</p>
        </div>
        {userProfile?.isHost && (
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

      {loading && visibleRequests.length === 0 ? (
          <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-800">
              <p className="text-gray-500">Loading requests...</p>
          </div>
      ) : visibleRequests.length === 0 ? (
          <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-800">
              <Music className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500">No active requests found.</p>
              <p className="text-sm text-gray-600 mt-2">Create one to get started!</p>
          </div>
      ) : (
          <RequestList 
              requests={visibleRequests} 
              loading={loading} 
              filter="active" 
          />
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { CreateRequest } from '../components/CreateRequest';
import { RequestList } from '../components/RequestList';
import { useGun } from '../contexts/GunContext';
import type { FileRequest } from '../types';

export function Home() {
  const { gun, user, pubKey } = useGun();
  const [showCreate, setShowCreate] = useState(false);
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [participation, setParticipation] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !pubKey) return;

    // 1. Listen to Participation Status
    user.get('participation').map().on((status: any, reqId: string) => {
        setParticipation(prev => ({ ...prev, [reqId]: status }));
    });

    const reqMap = new Map<string, FileRequest>();

        // 2. Listen to Global Requests

        gun.get('file_requests').map().on((data: any, key: string) => {

            if (data && data.title) {

                reqMap.set(key, { ...data, id: key });

                

                // Debounce/Batch update

                setRequests(Array.from(reqMap.values()));

                setLoading(false);

            }

        });

        

        // Fallback: If no requests found within 2s, stop loading

        const timer = setTimeout(() => setLoading(false), 2000);

        

        return () => {

            reqMap.clear();

            clearTimeout(timer);

        };

      }, [user, pubKey, gun]);

  // Filter for View
  const visibleRequests = requests.filter(req => {
      if (!req.id) return false;
      const isOwner = req.ownerPub === pubKey;
      const isDirect = req.accessMode === 'direct'; // Direct is public
      
      const myStatus = participation[req.id];
      
      // Show if:
      // 1. I created it.
      // 2. I have 'accepted' or 'joined' or 'invited' status.
      // 3. It is 'direct' access (public).
      // 4. It is 'volunteer' access AND I am invited (checked via participation).
      
      return isOwner || isDirect || myStatus === 'accepted' || myStatus === 'joined' || myStatus === 'invited';
  }).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 p-4">
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-3xl font-bold text-white mb-2">Active Requests</h1>
           <p className="text-gray-400">Manage your collaborative sessions</p>
        </div>
        <button 
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20"
        >
          <Plus className={`w-5 h-5 transition-transform ${showCreate ? 'rotate-45' : ''}`} />
          {showCreate ? 'Cancel' : 'New Request'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4">
           <CreateRequest />
        </div>
      )}

      {loading && visibleRequests.length === 0 ? (
          <RequestList requests={[]} loading={true} filter="active" />
      ) : (
          <RequestList requests={visibleRequests} filter="active" />
      )}
      
      {!loading && visibleRequests.length === 0 && (
          <div className="text-center py-20 text-gray-500 bg-gray-900/30 rounded-xl border border-gray-800/50">
              <p>You haven't joined any requests yet.</p>
              <p className="text-sm mt-2">Create one or check your Inbox for invites!</p>
          </div>
      )}
    </div>
  );
}
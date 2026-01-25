import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CreateRequest } from '../components/CreateRequest';
import { RequestList } from '../components/RequestList';

export function Home() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
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

      <RequestList />
    </div>
  );
}

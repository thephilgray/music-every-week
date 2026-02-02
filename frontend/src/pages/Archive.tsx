import { Archive as ArchiveIcon } from 'lucide-react';
import { RequestList } from '../components/RequestList';

export function Archive() {
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

      {/* Auto-fetches archived requests */}
      <RequestList filter="archived" />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { CreatePrompt } from '../components/CreatePrompt';
import { PromptList } from '../components/PromptList';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, where, doc } from 'firebase/firestore';
import type { Prompt, DashboardConfig, DashboardLink } from '../types';
import { getTimestampAsNumber } from '../lib/utils';

const DEFAULT_DASHBOARD_LINKS: DashboardLink[] = [
  { label: 'Discord', url: 'https://discord.com/invite/MJRRwBddKV' },
  { label: 'Patreon', url: 'https://www.patreon.com/MusicEveryWeek' },
  { label: 'FAQ', url: 'https://docs.google.com/document/d/192JE_HXcs_cSJubnf1BEYyjbNr9V5YXeedK-MIJbvlo/edit?tab=t.0#heading=h.45at7kfvym83' },
  { label: 'Ideas & Comments Box', url: 'https://forms.gle/27w4CoSfb6EpssR6A' }
];

function renderFormattedText(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^\)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (match) {
      return (
        <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-medium">
          {match[1]}
        </a>
      );
    }
    return part;
  });
}

export function Home() {
  const { user, isAdmin, isHost, participantEmail } = useAuth(); 
  const [showCreate, setShowCreate] = useState(false);
  const [requests, setRequests] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig>({});

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
        }, (err) => console.error("Owner query error:", err)));
    }

    // 2. Query for Invited
    if (email) {
        const qInvited = query(collection(db, 'requests'), where('accessList', 'array-contains', email));
        unsubs.push(onSnapshot(qInvited, (snap) => {
            snap.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() } as Prompt));
            updateState();
        }, (err) => console.error("Invited query error:", err)));
    }

    // 3. Load Admin Dashboard Config
    const configRef = doc(db, 'config', 'dashboard');
    unsubs.push(onSnapshot(configRef, (snap) => {
        if (snap.exists()) {
            setDashboardConfig(snap.data() as DashboardConfig);
        } else {
            setDashboardConfig({});
        }
    }, (err) => console.error("Dashboard config error:", err)));

    return () => unsubs.forEach(unsub => unsub());
  }, [user, participantEmail]);

  return (
    <div className="max-w-5xl mx-auto space-y-4 md:space-y-8 pb-20 p-4">
      {/* Tertiary Nav */}
      <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2 text-[10px] md:text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-800/50 pb-3 md:pb-4">
          {(dashboardConfig.links && dashboardConfig.links.length > 0 ? dashboardConfig.links : DEFAULT_DASHBOARD_LINKS).map((link, idx, arr) => (
              <span key={idx} className="flex items-center gap-6">
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors flex items-center gap-1.5">
                      {link.label}
                  </a>
                  {idx < arr.length - 1 && <span className="text-gray-800 hidden sm:inline">•</span>}
              </span>
          ))}
      </div>

      {/* Custom Announcement / Content Block */}
      {dashboardConfig.customContent && dashboardConfig.customContent.trim() !== '' && (
          <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-xl p-4 text-sm text-purple-200 shadow-lg">
              <p className="whitespace-pre-line leading-relaxed">
                  {renderFormattedText(dashboardConfig.customContent)}
              </p>
          </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left">
           <div className="flex items-center justify-center sm:justify-start gap-3">
               <h1 className="text-3xl font-bold text-white mb-2">Active Prompts</h1>
           </div>
           <p className="text-gray-400">Submit tracks, listen, and provide feedback</p>
        </div>
        {user && isAdmin && isHost && ( 
        <button 
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20"
        >
          <Plus className={`w-5 h-5 transition-transform ${showCreate ? 'rotate-45' : ''}`} />
          <span className="md:hidden">{showCreate ? 'Cancel' : 'New'}</span>
          <span className="hidden md:inline">{showCreate ? 'Cancel' : 'New Prompt'}</span>
        </button>
        )}
      </div>

      {showCreate && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4">
           <CreatePrompt />
        </div>
      )}

      <PromptList 
          requests={requests} 
          loading={loading} 
          filter="active" 
      />
    </div>
  );
}

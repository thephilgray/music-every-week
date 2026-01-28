import { useState, useEffect } from 'react';
import { Download, Users, ChevronRight, Mail, SkipForward, ArrowLeft } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import type { FileRequest } from '../types';

interface ParticipantRow {
    id: string;
    name: string;
    contact: string;
    status: string;
    type: 'user' | 'email';
    extensionHours?: number;
    hasPass?: boolean;
}

export function CreatorTools() {
  const { gun, user, pubKey, isAdmin } = useGun();
  const [myRequests, setMyRequests] = useState<FileRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<FileRequest | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    
    const reqMap = new Map<string, FileRequest>();
    // Listen to my_requests
    user.get('my_requests').map().on((data: any, key: string) => {
        if (data && data.title) { 
            // Parse fields if they are strings (GunDB quirk or legacy data)
            let parsedParticipants = {};
            let parsedEmails: string[] = [];
            
            if (typeof data.participants === 'string') {
                try { parsedParticipants = JSON.parse(data.participants); } catch (e) {}
            } else if (data.participants) {
                // If it's an object (graph node), we need to load it?
                // Gun.map() usually loads one level. If participants is a node, data.participants might be a reference.
                // However, for this list view, we might not need deep data yet.
                // But for the selected view we do.
                // Let's store what we have.
                parsedParticipants = data.participants;
            }

            if (typeof data.pending_emails === 'string') {
                try { parsedEmails = JSON.parse(data.pending_emails); } catch (e) {}
            } else if (Array.isArray(data.pending_emails)) {
                parsedEmails = data.pending_emails;
            }

            reqMap.set(key, { 
                ...data, 
                id: key, 
                participants: parsedParticipants,
                pending_emails: parsedEmails
            });
            setMyRequests(Array.from(reqMap.values()).sort((a, b) => b.createdAt - a.createdAt));
        }
    });
  }, [user]);

  // Deep load participants when request selected
  useEffect(() => {
      if (!selectedRequest) {
          setParticipants([]);
          return;
      }

      // If participants is a reference (link), we might need to load it explicitly if not already loaded by map()
      // But typically we can just iterate the keys if we have the node.
      
      const rows: ParticipantRow[] = [];
      const participantsData = selectedRequest.participants || {};

      // Process existing participants (Users)
      Object.entries(participantsData).forEach(([pub, data]: [string, any]) => {
          // If data is just a reference (string starting with #), we can't read it directly here without loading.
          // But assuming `map()` or local cache has it, or it was put as an object.
          if (typeof data === 'object' && data !== null) {
              rows.push({
                  id: pub,
                  name: data.alias || 'Unknown User',
                  contact: data.email || pub,
                  status: data.status || 'pending',
                  type: 'user',
                  extensionHours: data.extensionHours || 0,
                  hasPass: data.hasPass || false
              });
          }
      });

      // Process pending emails
      if (selectedRequest.pending_emails) {
          selectedRequest.pending_emails.forEach((email: string) => {
              rows.push({
                  id: email,
                  name: 'Invited Guest',
                  contact: email,
                  status: 'invited',
                  type: 'email'
              });
          });
      }

      setParticipants(rows);

  }, [selectedRequest]);

  const generateInvite = () => {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      gun.get('invites').get(code).put({
          createdBy: pubKey,
          createdAt: Date.now(),
          status: 'active'
      });
      setInviteCode(code);
  };

  const generateSeedData = async () => {
      if (!confirm("Generate seed data? This will add fake users and requests.")) return;
      
      const FAKE_USERS = [
          { alias: 'Alice Songwriter', bio: 'Lofi producer from NY', location: 'New York, USA' },
          { alias: 'Bob Beats', bio: 'Techno enthusiast', location: 'Berlin, DE' },
          { alias: 'Charlie Chords', bio: 'Acoustic vibes', location: 'London, UK' },
      ];

      FAKE_USERS.forEach((u, i) => {
          const fakePub = `fake_pub_${Math.random().toString(36).substring(7)}`;
          gun.get('all_users').get(fakePub).put({
              ...u,
              pub: fakePub,
              joinedAt: Date.now() - (i * 86400000)
          });
          
          // Create a request for each
          const reqId = `fake_req_${Math.random().toString(36).substring(7)}`;
          const deadline = new Date();
          deadline.setDate(deadline.getDate() + 7);
          
          const req = {
              id: reqId,
              title: `${u.alias}'s Challenge`,
              description: `A weekly challenge hosted by ${u.alias}.`,
              deadline: deadline.toISOString(),
              accessMode: 'direct', // Make it visible
              ownerPub: fakePub,
              createdAt: Date.now(),
              participants: {}
          };
          
          gun.get('file_requests').get(reqId).put(req);
      });
      
      alert("Seed data generated!");
  };

  const grantExtension = (pub: string, hours: number) => {
      if (!selectedRequest || !selectedRequest.id) return;
      
      // Update global request node
      // We target the participants node directly.
      // Note: This only works if participants is a node (object), not a string.
      // If it's a string (legacy), we can't easily update.
      if (typeof selectedRequest.participants === 'string') {
          alert("This request uses an old data format. Cannot grant extensions.");
          return;
      }

      gun.get('file_requests').get(selectedRequest.id).get('participants').get(pub).get('extensionHours').put(hours);
      
      // Update local state optimistically
      setParticipants(prev => prev.map(p => 
          p.id === pub ? { ...p, extensionHours: hours } : p
      ));
  };

  const grantPass = (pub: string) => {
      if (!selectedRequest || !selectedRequest.id) return;
      if (typeof selectedRequest.participants === 'string') {
          alert("This request uses an old data format. Cannot grant pass.");
          return;
      }

      const newPassStatus = !participants.find(p => p.id === pub)?.hasPass;
      
      gun.get('file_requests').get(selectedRequest.id).get('participants').get(pub).get('hasPass').put(newPassStatus);

      setParticipants(prev => prev.map(p => 
        p.id === pub ? { ...p, hasPass: newPassStatus } : p
      ));
  };
  
  const exportCSV = () => {
      if (!selectedRequest || participants.length === 0) return;

      const headers = ['Name', 'Contact', 'Status', 'Type', 'Extension (Hours)', 'Has Pass'];
      const csvContent = [
          headers.join(','),
          ...participants.map(p => `"${p.name}","${p.contact}","${p.status}","${p.type}","${p.extensionHours || 0}","${p.hasPass ? 'Yes' : 'No'}"`)
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `participants_${selectedRequest.title.replace(/\s+/g, '_')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (!pubKey) return <div className="text-center py-20 text-gray-500">Please login to access Creator Tools.</div>;

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-theme(spacing.16))]">
        {/* Sidebar List of Requests */}
        <div className={`w-full md:w-80 border-r border-gray-800 p-4 bg-gray-950/50 overflow-y-auto ${selectedRequest ? 'hidden md:block' : 'block'}`}>
            {isAdmin && (
                <div className="mb-6 p-4 bg-blue-900/20 border border-blue-900/50 rounded-lg">
                    <h3 className="text-blue-400 font-bold mb-2 text-sm uppercase">Admin Tools</h3>
                    <button
                        onClick={generateInvite}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition"
                    >
                        Generate Invite Code
                    </button>
                    <button
                        onClick={generateSeedData}
                        className="w-full mt-2 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium transition"
                    >
                        Seed Directory (Dev)
                    </button>
                    {inviteCode && (
                        <div className="mt-3 p-2 bg-gray-900 rounded border border-gray-700 text-center">
                            <span className="text-xl font-mono text-white tracking-widest">{inviteCode}</span>
                            <p className="text-xs text-gray-500 mt-1">Share this code with a new user</p>
                        </div>
                    )}
                </div>
            )}

            <h2 className="text-lg font-bold text-gray-200 mb-4 px-2">Your Requests</h2>
            <div className="space-y-1">
                {myRequests.map(req => (
                    <button
                        key={req.id}
                        onClick={() => setSelectedRequest(req)}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between group transition-colors ${selectedRequest?.id === req.id 
                            ? 'bg-blue-900/30 text-blue-400'
                            : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                        }`}
                    >
                        <span className="truncate">{req.title}</span>
                        <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 ${selectedRequest?.id === req.id ? 'opacity-100' : ''}`} />
                    </button>
                ))}
                {myRequests.length === 0 && (
                    <div className="text-gray-600 text-sm px-2 italic">No requests created yet.</div>
                )}
            </div>
        </div>

        {/* Main Content */}
        <div className={`flex-1 p-4 md:p-8 bg-gray-900/10 overflow-y-auto ${selectedRequest ? 'block' : 'hidden md:block'}`}>
            {selectedRequest ? (
                <div>
                    <button 
                        onClick={() => setSelectedRequest(null)}
                        className="md:hidden mb-4 flex items-center gap-2 text-gray-400 hover:text-white"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to List
                    </button>

                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-white">{selectedRequest.title}</h1>
                            <p className="text-gray-400">Manage participants and exports</p>
                        </div>
                        <button 
                            onClick={exportCSV}
                            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-700 transition"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export CSV</span>
                        </button>
                    </div>

                    <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-900 text-gray-400 text-xs uppercase font-medium">
                                <tr>
                                    <th className="px-6 py-4">Participant</th>
                                    <th className="px-6 py-4">Contact</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Extensions</th>
                                    <th className="px-6 py-4">Pass</th>
                                    <th className="px-6 py-4">Type</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {participants.map((p, i) => (
                                    <tr key={i} className="text-sm hover:bg-gray-900/50 transition-colors">
                                        <td className="px-6 py-4 text-white font-medium">
                                            {p.name}
                                        </td>
                                        <td className="px-6 py-4 text-gray-400 font-mono text-xs">
                                            {p.contact}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs border ${p.status === 'joined' || p.status === 'accepted' 
                                                ? 'bg-green-900/20 text-green-400 border-green-900/50'
                                                : 'bg-yellow-900/20 text-yellow-400 border-yellow-900/50'
                                            }`}>
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {p.type === 'user' && (
                                                <div className="flex items-center gap-1">
                                                    <select 
                                                        value={p.extensionHours || 0}
                                                        onChange={(e) => grantExtension(p.id, Number(e.target.value))}
                                                        className="bg-gray-800 text-white text-xs border border-gray-700 rounded px-2 py-1 outline-none focus:border-blue-500"
                                                    >
                                                        <option value={0}>None</option>
                                                        <option value={12}>+12h</option>
                                                        <option value={24}>+24h</option>
                                                        <option value={48}>+48h</option>
                                                    </select>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {p.type === 'user' && (
                                                <button 
                                                    onClick={() => grantPass(p.id)}
                                                    className={`p-1 rounded transition ${p.hasPass 
                                                        ? 'bg-green-900/30 text-green-400 border border-green-900' 
                                                        : 'text-gray-600 hover:text-gray-400'}`}
                                                    title="Grant Pass (Mark as participated)"
                                                >
                                                    <SkipForward className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500">
                                            {p.type === 'email' ? <Mail className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                                        </td>
                                    </tr>
                                ))}
                                {participants.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                            No participants found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                    <Users className="w-16 h-16 mb-4 opacity-20" />
                    <p>Select a request from the sidebar to manage participants.</p>
                </div>
            )}
        </div>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { Download, Users, ChevronRight, Mail } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import type { FileRequest } from '../types';

export function CreatorTools() {
  const { gun, user, pubKey } = useGun();
  const [myRequests, setMyRequests] = useState<FileRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<FileRequest | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    // Fetch my requests
    const reqMap = new Map<string, FileRequest>();
    user.get('my_requests').map().on((data: any, key: string) => {
        if (data && data.title) { // simple check
            reqMap.set(key, { ...data, id: key });
            setMyRequests(Array.from(reqMap.values()).sort((a, b) => b.createdAt - a.createdAt));
        }
    });
  }, [user]);

  useEffect(() => {
    if (!selectedRequest || !selectedRequest.id) return;
    
    const reqId = selectedRequest.id;
    
    // Subscribe to the request to get participants
    gun.get('file_requests').get(reqId).on((data: any) => {
        if (!data) return;
        
        const parts: any[] = [];
        
        // 1. Process Accepted/Pending PubKeys
        // Gun might return participants as null, or an object
        if (data.participants) {
             Object.entries(data.participants).forEach(([key, val]: [string, any]) => {
                 if (key === '_' || !val) return; // Gun metadata
                 parts.push({
                     type: 'user',
                     id: key,
                     name: key.substring(0, 8), // Placeholder for username
                     status: typeof val === 'object' ? (val.status || 'joined') : 'joined',
                     contact: key // PubKey
                 });
             });
        }
        
        // 2. Process Pending Emails
        if (data.pending_emails) {
             // If it's an object (Gun array-to-object conversion) or standard object
             Object.values(data.pending_emails).forEach((email: any) => {
                 if (typeof email !== 'string') return;
                 parts.push({
                     type: 'email',
                     id: email,
                     name: 'Pending User',
                     status: 'invited',
                     contact: email
                 });
             });
        }
        
        setParticipants(parts);
    });

  }, [selectedRequest, gun]);

  const exportCSV = () => {
     if (!selectedRequest) return;
     
     const headers = ['Type', 'Contact (Email/PubKey)', 'Status'];
     const rows = participants.map(p => [p.type, p.contact, p.status]);
     
     const csvContent = [
         headers.join(','),
         ...rows.map(r => r.join(','))
     ].join('\n');
     
     const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
     const link = document.createElement('a');
     const url = URL.createObjectURL(blob);
     link.setAttribute('href', url);
     link.setAttribute('download', `${selectedRequest.title}_participants.csv`);
     link.style.visibility = 'hidden';
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  if (!pubKey) return <div className="text-center py-20 text-gray-500">Please login to access Creator Tools.</div>;

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))]">
        {/* Sidebar List of Requests */}
        <div className="w-80 border-r border-gray-800 p-4 bg-gray-950/50 overflow-y-auto">
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
        <div className="flex-1 p-8 bg-gray-900/10 overflow-y-auto">
            {selectedRequest ? (
                <div>
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
                            Export CSV
                        </button>
                    </div>

                    <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-900 text-gray-400 text-xs uppercase font-medium">
                                <tr>
                                    <th className="px-6 py-4">Participant</th>
                                    <th className="px-6 py-4">Contact</th>
                                    <th className="px-6 py-4">Status</th>
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
                                        <td className="px-6 py-4 text-gray-500">
                                            {p.type === 'email' ? <Mail className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                                        </td>
                                    </tr>
                                ))}
                                {participants.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
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
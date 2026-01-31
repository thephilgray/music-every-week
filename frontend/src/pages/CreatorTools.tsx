import { useState, useEffect } from 'react';
import { Download, Users, ChevronRight, Mail, SkipForward, ArrowLeft, ExternalLink, Edit, Music, List } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGun } from '../contexts/GunContext';
import { EditRequest } from '../components/EditRequest';
import { SubmitTrack } from '../components/SubmitTrack'; // For editing submissions
import type { FileRequest, Submission } from '../types';

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
  const { gun, user, pubKey } = useGun();
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'requests' | 'submissions'>('requests');

  // Requests Data
  const [myRequests, setMyRequests] = useState<FileRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<FileRequest | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [isEditRequestOpen, setIsEditRequestOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Submissions Data
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isEditSubmissionOpen, setIsEditSubmissionOpen] = useState(false);

  // Fetch Requests
  useEffect(() => {
    if (!user) return;
    const reqMap = new Map<string, FileRequest>();
    user.get('my_requests').map().on((data: any, key: string) => {
        if (data && data.title) { 
            // ... (keep parsing logic)
            let parsedParticipants = {};
            let parsedEmails: string[] = [];
            
            if (typeof data.participants === 'string') {
                try { parsedParticipants = JSON.parse(data.participants); } catch (e) {}
            } else if (data.participants) {
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

  // Fetch Submissions
  useEffect(() => {
      if (!user) return;
      const subMap = new Map<string, Submission>();
      
      // Listen to my_submissions (private reference) OR submissions (public reference, usually same data)
      user.get('my_submissions').map().on((data: any, key: string) => {
          if (data && data.title) {
              subMap.set(key, { ...data, id: key });
              setMySubmissions(Array.from(subMap.values()).sort((a, b) => b.createdAt - a.createdAt));
          } else if (data === null) {
              // Handle deletion
              subMap.delete(key);
              setMySubmissions(Array.from(subMap.values()).sort((a, b) => b.createdAt - a.createdAt));
          }
      });
  }, [user]);

  // ... (Keep existing fetch logic for selectedRequest)
  useEffect(() => {
      if (!selectedRequest || !selectedRequest.id) return;

      const reqId = selectedRequest.id;
      const reqNode = gun.get('file_requests').get(reqId);

      // Subscribe to Root Metadata
      reqNode.on((data: any) => {
          if (!data) return;
          
          setSelectedRequest(prev => {
              if (!prev || prev.id !== reqId) return prev;

              let parsedEmails: string[] = [];
              if (typeof data.pending_emails === 'string') {
                  try { parsedEmails = JSON.parse(data.pending_emails); } catch (e) {}
              } else if (Array.isArray(data.pending_emails)) {
                  parsedEmails = data.pending_emails;
              }

              // Update metadata only, preserve existing participants if already loaded from separate node
              // We create a clean update object
              const update: any = { ...data, pending_emails: parsedEmails };
              
              // Remove participants from metadata update to avoid overwriting the detailed list
              delete update.participants;

              return { ...prev, ...update };
          });
      });

      // Subscribe to Participants Node (Separate Root)
      gun.get('request_participants').get(reqId).map().on((data: any, pub: string) => {
          if (data) {
              setSelectedRequest(prev => {
                  if (!prev || prev.id !== reqId) return prev;
                  const prevParticipants = prev.participants || {};
                  
                  // Merge new participant data
                  return {
                      ...prev,
                      participants: {
                          ...prevParticipants,
                          [pub]: data
                      }
                  };
              });
          }
      });
  }, [selectedRequest?.id, gun]);

  // 2. Process Data into Rows
  useEffect(() => {
      if (!selectedRequest) {
          setParticipants([]);
          return;
      }

      const rows = new Map<string, ParticipantRow>();
      
      const updateParticipants = () => {
          setParticipants(Array.from(rows.values()));
      };

      // Process Participants
      const participantsData = selectedRequest.participants || {};
      Object.entries(participantsData).forEach(([pub, data]: [string, any]) => {
          if (typeof data === 'object' && data !== null) {
              rows.set(pub, {
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

      // Process Pending Emails
      if (selectedRequest.pending_emails) {
          selectedRequest.pending_emails.forEach((email: string) => {
              if (!rows.has(email)) {
                  rows.set(email, {
                      id: email,
                      name: email,
                      contact: email,
                      status: 'invited',
                      type: 'email'
                  });
              }
          });
      }

      updateParticipants();

      // Fetch Submissions to update status (from public node)
      gun.get('request_submissions').get(selectedRequest.id!).map().on((sub: any) => {
          if (!sub || !sub.uploaderPub) return;
          const pub = sub.uploaderPub;
          
          if (!rows.has(pub)) {
              rows.set(pub, {
                  id: pub,
                  name: 'Loading...',
                  contact: pub,
                  status: 'submitted',
                  type: 'user',
                  extensionHours: 0,
                  hasPass: false
              });
              gun.get('all_users').get(pub).once((u: any) => {
                  if (u && u.alias) {
                      const p = rows.get(pub);
                      if (p) {
                          rows.set(pub, { ...p, name: u.alias });
                          updateParticipants();
                      }
                  }
              });
              updateParticipants();
          } else {
             const p = rows.get(pub);
             if (p && p.status !== 'submitted') {
                 rows.set(pub, { ...p, status: 'submitted' });
                 updateParticipants();
             }
          }
      });

      // Fetch Profiles
      rows.forEach((row, pub) => {
          if (row.type === 'user') {
              gun.get('all_users').get(pub).once((u: any) => {
                  if (u) {
                       let changed = false;
                       let newName = row.name;
                       let newContact = row.contact;

                       if (u.alias && (row.name !== u.alias || row.name === 'Loading...')) {
                           newName = u.alias;
                           changed = true;
                       }
                       if (u.email && (row.contact === pub || !row.contact)) {
                           newContact = u.email;
                           changed = true;
                       }

                       if (changed) {
                           rows.set(pub, { ...row, name: newName, contact: newContact });
                           updateParticipants();
                       }
                  }
              });
          }
      });

  }, [selectedRequest, gun]);

  const grantExtension = (pub: string, hours: number) => {
      if (!selectedRequest || !selectedRequest.id) return;
      
      // Update global request node (using new participants root)
      gun.get('request_participants').get(selectedRequest.id).get(pub).get('extensionHours').put(hours);
      
      // Update local state optimistically
      setParticipants(prev => prev.map(p => 
          p.id === pub ? { ...p, extensionHours: hours } : p
      ));
  };

  const grantPass = (pub: string) => {
      if (!selectedRequest || !selectedRequest.id) return;
      
      const newPassStatus = !participants.find(p => p.id === pub)?.hasPass;

      // Standard Graph Update (New Architecture)
      gun.get('request_participants').get(selectedRequest.id).get(pub).get('hasPass').put(newPassStatus);

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
    <div className="flex flex-col lg:flex-row h-[calc(100vh-theme(spacing.16))]">
        {/* Sidebar */}
        <div className={`w-full lg:w-80 border-r border-gray-800 bg-gray-950/50 overflow-y-auto flex flex-col ${selectedRequest || selectedSubmission ? 'hidden lg:flex' : 'flex'}`}>
            {/* Tabs */}
            <div className="flex border-b border-gray-800">
                <button
                    onClick={() => { setActiveTab('requests'); setSelectedSubmission(null); }}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition ${activeTab === 'requests' ? 'text-white bg-gray-900 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    <List className="w-4 h-4" /> Requests
                </button>
                <button
                    onClick={() => { setActiveTab('submissions'); setSelectedRequest(null); }}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition ${activeTab === 'submissions' ? 'text-white bg-gray-900 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    <Music className="w-4 h-4" /> Submissions
                </button>
            </div>

            <div className="p-4 space-y-1 flex-1 overflow-y-auto">
                {activeTab === 'requests' ? (
                    <>
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
                        {myRequests.length === 0 && <div className="text-gray-600 text-sm px-2 italic">No requests created.</div>}
                    </>
                ) : (
                    <>
                        {mySubmissions.map(sub => (
                            <button
                                key={sub.id}
                                onClick={() => setSelectedSubmission(sub)}
                                className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between group transition-colors ${selectedSubmission?.id === sub.id 
                                    ? 'bg-blue-900/30 text-blue-400'
                                    : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                                }`}
                            >
                                <span className="truncate">{sub.title}</span>
                                <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 ${selectedSubmission?.id === sub.id ? 'opacity-100' : ''}`} />
                            </button>
                        ))}
                        {mySubmissions.length === 0 && <div className="text-gray-600 text-sm px-2 italic">No submissions yet.</div>}
                    </>
                )}
            </div>
        </div>

        {/* Main Content */}
        <div className={`flex-1 p-4 md:p-8 bg-gray-900/10 overflow-y-auto ${selectedRequest || selectedSubmission ? 'block' : 'hidden lg:block'}`}>
            {activeTab === 'requests' && selectedRequest ? (
                <div>
                    <button 
                        onClick={() => setSelectedRequest(null)}
                        className="lg:hidden mb-4 flex items-center gap-2 text-gray-400 hover:text-white"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to List
                    </button>

                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-white">{selectedRequest.title}</h1>
                                <Link 
                                    to={`/request/${selectedRequest.id}`} 
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                                    title="Open Request Page"
                                >
                                    <ExternalLink className="w-5 h-5" />
                                </Link>
                                <button 
                                    onClick={() => setIsEditRequestOpen(true)}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                                    title="Edit Request"
                                >
                                    <Edit className="w-5 h-5" />
                                </button>
                            </div>
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
                        <div className="p-4 border-b border-gray-800 flex justify-end">
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:border-blue-500 outline-none"
                            >
                                <option value="all">All Statuses</option>
                                <option value="submitted">Submitted</option>
                                <option value="pending">Pending / Invited</option>
                                <option value="accepted">Accepted</option>
                            </select>
                        </div>
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-900 text-gray-400 text-xs uppercase font-medium">
                                <tr>
                                    <th className="px-6 py-4">Participant</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Extensions</th>
                                    <th className="px-6 py-4">Pass</th>
                                    <th className="px-6 py-4">Type</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {participants.filter(p => {
                                    if (filterStatus === 'all') return true;
                                    if (filterStatus === 'submitted') return p.status === 'submitted';
                                    if (filterStatus === 'pending') return p.status === 'pending' || p.status === 'invited';
                                    return p.status === filterStatus;
                                }).map((p, i) => (
                                    <tr key={i} className="text-sm hover:bg-gray-900/50 transition-colors">
                                        <td className="px-6 py-4 text-white font-medium">
                                            {p.type === 'user' ? (
                                                <Link to={`/profile/${p.id}`} className="hover:text-blue-400 hover:underline">
                                                    {p.name}
                                                </Link>
                                            ) : (
                                                <span className="text-gray-300">{p.name}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs border ${p.status === 'joined' || p.status === 'accepted' || p.status === 'submitted'
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
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                            <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                            No participants found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : activeTab === 'submissions' && selectedSubmission ? (
                <div>
                    <button 
                        onClick={() => setSelectedSubmission(null)}
                        className="lg:hidden mb-4 flex items-center gap-2 text-gray-400 hover:text-white"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to List
                    </button>

                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-white">{selectedSubmission.title}</h1>
                                <button 
                                    onClick={() => setIsEditSubmissionOpen(true)}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                                    title="Edit Submission"
                                >
                                    <Edit className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-gray-400 text-sm">
                                Submitted on {new Date(selectedSubmission.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                    </div>

                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                        <div className="flex items-start gap-6">
                            <div className="w-32 h-32 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                                {selectedSubmission.artworkUrl ? (
                                    <img src={selectedSubmission.artworkUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600"><Music className="w-12 h-12" /></div>
                                )}
                            </div>
                            <div className="space-y-4 flex-1">
                                <div>
                                    <label className="text-xs text-gray-500 uppercase font-bold">Byline</label>
                                    <p className="text-white">{selectedSubmission.byline || 'Unknown'}</p>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase font-bold">Request</label>
                                    <p>
                                        <Link to={`/request/${selectedSubmission.requestId}`} className="text-blue-400 hover:underline flex items-center gap-1">
                                            View Request <ExternalLink className="w-3 h-3" />
                                        </Link>
                                    </p>
                                </div>
                                {selectedSubmission.lyrics && (
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold">Lyrics / Notes</label>
                                        <p className="text-gray-300 text-sm whitespace-pre-wrap mt-1">{selectedSubmission.lyrics}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                    {activeTab === 'requests' ? <Users className="w-16 h-16 mb-4 opacity-20" /> : <Music className="w-16 h-16 mb-4 opacity-20" />}
                    <p>Select a {activeTab === 'requests' ? 'request' : 'submission'} from the sidebar to manage it.</p>
                </div>
            )}
        </div>
        
        {isEditRequestOpen && selectedRequest && (
            <EditRequest 
                request={selectedRequest}
                onClose={() => setIsEditRequestOpen(false)}
                onUpdate={() => {
                    setSelectedRequest({ ...selectedRequest }); 
                }}
            />
        )}

        {isEditSubmissionOpen && selectedSubmission && (
            <SubmitTrack
                requestId={selectedSubmission.requestId}
                existingSubmission={selectedSubmission}
                onClose={() => setIsEditSubmissionOpen(false)}
                onSuccess={() => {
                    // Refresh not needed as Gun is realtime, but maybe update local list if changed
                    setIsEditSubmissionOpen(false);
                    // Re-select to show updates? Handled by gun subscriptions generally.
                }}
            />
        )}
    </div>
  );
}
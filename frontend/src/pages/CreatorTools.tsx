import { useState, useEffect } from 'react';
import { Download, Users, ChevronRight, Mail, SkipForward, ArrowLeft, ExternalLink, Edit, Music, List, RotateCw, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; 
import { useToast } from '../contexts/ToastContext';
import { EditRequest } from '../components/EditRequest';
import { SubmitTrack } from '../components/SubmitTrack'; 
import type { FileRequest, Submission, UserProfile } from '../types';
import { getTimestampAsNumber } from '../lib/utils';
import { db } from '../lib/firebase'; 
import { collection, query, where, getDocs, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, getDoc } from 'firebase/firestore'; 

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
  const { user, participantEmail } = useAuth(); 
  const { success, error } = useToast();
  
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

  const [, setLoading] = useState(false);

  // Fetch Requests
  useEffect(() => {
    if (!user?.uid && !participantEmail) return;
    
    // Prefer Email for broader matching
    const identifierField = (user?.email || participantEmail) ? 'ownerEmail' : 'ownerPub';
    const identifierValue = user?.email || participantEmail || user?.uid;

    const requestsQuery = query(
      collection(db, 'requests'),
      where(identifierField, '==', identifierValue),
      where('deleted', '!=', true) 
    );

    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const fetchedRequests: FileRequest[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.title) {
            fetchedRequests.push({ 
                id: docSnap.id, 
                ...data,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : data.createdAt 
            } as FileRequest);
        }
      });
      fetchedRequests.sort((a, b) => getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt));
      setMyRequests(fetchedRequests);
    });

    return () => unsubscribe(); 
  }, [user, participantEmail]);

  // Fetch Submissions
  useEffect(() => {
      if (!user?.uid && !participantEmail) return;
      
      const identifierField = (user?.email || participantEmail) ? 'uploaderEmail' : 'uploaderUid';
      const identifierValue = user?.email || participantEmail || user?.uid;

      const submissionsQuery = query(
        collection(db, 'submissions'), 
        where(identifierField, '==', identifierValue),
        where('deleted', '!=', true) 
      );

      const unsubscribe = onSnapshot(submissionsQuery, (snapshot) => {
        const fetchedSubmissions: Submission[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && data.title) {
            fetchedSubmissions.push({ 
                id: docSnap.id, 
                ...data,
                createdAt: getTimestampAsNumber(data.createdAt)
            } as Submission);
          }
        });
        fetchedSubmissions.sort((a, b) => getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt));
        setMySubmissions(fetchedSubmissions);
      });

      return () => unsubscribe(); 
  }, [user, participantEmail]);

  // Fetch details for selectedRequest
  useEffect(() => {
      if (!selectedRequest?.id) return;

      const reqId = selectedRequest.id;
      const requestDocRef = doc(db, 'requests', reqId);

      // Subscribe to Request Document
      const unsubscribe = onSnapshot(requestDocRef, (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data() as FileRequest;
              setSelectedRequest(prev => {
                  if (!prev || prev.id !== reqId) return prev;
                  return {
                      ...prev,
                      ...data,
                      createdAt: getTimestampAsNumber(data.createdAt)
                  };
              });
          } else {
              // Request was deleted or doesn't exist
              setSelectedRequest(null);
          }
      });

      return () => unsubscribe(); // Cleanup the listener
  }, [selectedRequest?.id]);

  // Process Data into Rows & Fetch Submissions/Profiles
  useEffect(() => {
      if (!selectedRequest || !selectedRequest.id) {
          setParticipants([]);
          return;
      }

      const rows = new Map<string, ParticipantRow>();
      
      const processData = async () => {
          // Process Participants from selectedRequest
          const participantsData = selectedRequest.participants || {};
          for (const pub of Object.keys(participantsData)) {
              const data = participantsData[pub];
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
          }

          // Process Pending Emails (accessList)
          if (selectedRequest.accessList) {
              selectedRequest.accessList.forEach((email: string) => {
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

          // Ensure Host is Listed
          if (selectedRequest.ownerPub && !rows.has(selectedRequest.ownerPub)) {
              rows.set(selectedRequest.ownerPub, {
                  id: selectedRequest.ownerPub,
                  name: 'Host (You)',
                  contact: selectedRequest.ownerPub,
                  status: 'joined', 
                  type: 'user',
                  extensionHours: 0,
                  hasPass: true
              });
          }

          // Fetch Submissions to update status
          if (selectedRequest.id) {
              const submissionsQuery = query(
                  collection(db, 'requests', selectedRequest.id, 'submissions'),
                  where('deleted', '!=', true)
              );
              const submissionSnapshot = await getDocs(submissionsQuery);
              submissionSnapshot.forEach(subDoc => {
                  const subData = subDoc.data();
                  if (subData.uploaderUid) {
                      const p = rows.get(subData.uploaderUid);
                      if (p && p.status !== 'submitted') {
                          rows.set(subData.uploaderUid, { ...p, status: 'submitted' });
                      } else if (!p) {
                          rows.set(subData.uploaderUid, {
                              id: subData.uploaderUid,
                              name: 'Loading...', 
                              contact: subData.uploaderUid,
                              status: 'submitted',
                              type: 'user',
                              extensionHours: 0,
                              hasPass: false
                          });
                      }
                  }
              });
          }

          // Fetch Profiles (aliases) for user participants
          const profilePromises: Promise<void>[] = [];
          rows.forEach((row, id) => {
              if (row.type === 'user' && row.name === 'Loading...') { 
                  profilePromises.push((async () => {
                      try {
                          const profileDoc = await getDoc(doc(db, 'profiles', id));
                          if (profileDoc.exists()) {
                              const profileData = profileDoc.data() as UserProfile;
                              if (profileData.alias) {
                                  rows.set(id, { ...row, name: profileData.alias, contact: profileData.email || profileData.uid });
                              }
                          }
                      } catch (e) {
                          console.error("Error fetching profile for", id, e);
                      }
                  })());
              }
          });
          await Promise.all(profilePromises);
          
          setParticipants(Array.from(rows.values()));
      };

      processData();

  }, [selectedRequest, user]);

  const grantExtension = async (pub: string, hours: number) => {
      if (!selectedRequest || !selectedRequest.id) return;
      
      try {
          const requestDocRef = doc(db, 'requests', selectedRequest.id);
          await updateDoc(requestDocRef, {
              [`participants.${pub}.extensionHours`]: hours
          });
          
          setParticipants(prev => prev.map(p => 
              p.id === pub ? { ...p, extensionHours: hours } : p
          ));
      } catch (e) {
          console.error("Error granting extension:", e);
          error("Failed to grant extension.");
      }
  };

  const grantPass = async (pub: string) => {
      if (!selectedRequest || !selectedRequest.id) return;
      
      try {
          const newPassStatus = !participants.find(p => p.id === pub)?.hasPass;
          const requestDocRef = doc(db, 'requests', selectedRequest.id);
          
          await updateDoc(requestDocRef, {
              [`participants.${pub}.hasPass`]: newPassStatus
          });

          setParticipants(prev => prev.map(p => 
            p.id === pub ? { ...p, hasPass: newPassStatus } : p
          ));
      } catch (e) {
          console.error("Error granting pass:", e);
          error("Failed to grant pass.");
      }
  };

  const handleBulkExtend = async (hours: number) => { 
      if (!selectedRequest || !selectedRequest.id) return;
      if (!confirm(`Are you sure you want to grant a ${hours} hour extension to ALL ${participants.length} participants?`)) return;
      setLoading(true); 
      try {
          const requestDocRef = doc(db, 'requests', selectedRequest.id);
          const updatePromises: Promise<void>[] = [];

          participants.forEach(p => {
              if (p.type === 'user' && p.id) {
                  updatePromises.push(
                      updateDoc(requestDocRef, {
                          [`participants.${p.id}.extensionHours`]: hours
                      })
                  );
              }
          });

          await Promise.all(updatePromises);
          
          setParticipants(prev => prev.map(p => ({ ...p, extensionHours: hours })));
          success(`Granted +${hours}h extension to all participants.`);
      } catch (e) {
          console.error("Error bulk granting extension:", e);
          error("Failed to grant bulk extension.");
      } finally {
          setLoading(false);
      }
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

  const handleGenerateExtensionLink = async () => {
      if (!selectedRequest || !selectedRequest.id || !user?.uid) return;
      
      const hoursStr = prompt("Enter extension hours (e.g. 24, 48):", "24");
      if (!hoursStr) return;
      
      const hours = parseInt(hoursStr);
      if (isNaN(hours) || hours <= 0) {
          error("Invalid hours.");
          return;
      }

      setLoading(true); 
      try {
          const code = crypto.randomUUID().substring(0, 8).toUpperCase();
          
          await addDoc(collection(db, 'extension_codes'), {
              code, 
              hours,
              requestId: selectedRequest.id,
              createdAt: serverTimestamp(),
              createdBy: user.uid
          });

          const url = `${window.location.origin}/request/${selectedRequest.id}?extension=${code}`;
          navigator.clipboard.writeText(url);
          success(`Extension link (+${hours}h) copied to clipboard!`);
      } catch (e) {
          console.error("Error generating extension link:", e);
          error("Failed to generate extension link.");
      } finally {
          setLoading(false);
      }
  };

  const handleRepublish = async () => {
      if (!selectedRequest || !selectedRequest.id || !user?.uid) return;
      
      setLoading(true);
      try {
          const requestDocRef = doc(db, 'requests', selectedRequest.id);
          
          const updates: Partial<FileRequest> = {
              ownerPub: user.uid,
              deleted: false, 
              updatedAt: serverTimestamp()
          };

          if (!Array.isArray(selectedRequest.accessList)) {
              updates.accessList = [];
          }

          await updateDoc(requestDocRef, updates);
          
          success("Request republished!");
      } catch (e) {
          console.error("Republish failed", e);
          error("Failed to republish request: " + (e as Error).message);
      } finally {
          setLoading(false);
      }
  };

  const handleRepublishSubmission = async (subToPublish: Submission | null = selectedSubmission) => {
      if (!subToPublish || !subToPublish.id || !subToPublish.requestId || !user?.uid) return;
      
      setLoading(true);
      try {
          const subData: any = { ...subToPublish };
          delete subData._;
          
          if (typeof subData.waveform === 'string') subData.waveform = JSON.parse(subData.waveform);
          if (typeof subData.feedbackFocus === 'string') subData.feedbackFocus = JSON.parse(subData.feedbackFocus);
          if (typeof subData.collaborators === 'string') subData.collaborators = JSON.parse(subData.collaborators);
          
          const updates = {
              ...subData,
              uploaderUid: user.uid, 
              deleted: false,
              updatedAt: serverTimestamp()
          };

          const requestSubmissionsDocRef = doc(db, 'requests', subToPublish.requestId, 'submissions', subToPublish.id);
          await updateDoc(requestSubmissionsDocRef, updates);
          
          const globalSubmissionsDocRef = doc(db, 'submissions', subToPublish.id);
          await updateDoc(globalSubmissionsDocRef, updates);
          
          success("Submission republished!");
      } catch (e) {
          console.error("Republish submission failed", e);
          error("Failed to republish submission: " + (e as Error).message);
      } finally {
          setLoading(false);
      }
  };


  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-theme(spacing.16))]">
        {
/* Sidebar */}
        <div className={`w-full lg:w-80 border-r border-gray-800 bg-gray-950/50 overflow-y-auto flex flex-col ${selectedRequest || selectedSubmission ? 'hidden lg:flex' : 'flex'}`}>
            {
/* Tabs */}
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
            
            {/* Sync Button - REMOVED (Migration Tool) */}
            
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

        {
/* Main Content */}
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
                                <button 
                                    onClick={handleGenerateExtensionLink}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                                    title="Generate Extension Link"
                                >
                                    <LinkIcon className="w-5 h-5" />
                                </button>
                                <button 
                                    onClick={handleRepublish}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                                    title="Republish to Global Feed (Fix Missing)"
                                >
                                    <RotateCw className="w-5 h-5" />
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
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center flex-wrap gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 text-sm">Bulk Actions:</span>
                                <button 
                                    onClick={() => handleBulkExtend(24)}
                                    className="px-3 py-1.5 bg-blue-900/30 text-blue-400 border border-blue-800 rounded text-xs hover:bg-blue-900/50 transition"
                                >
                                    +24h All
                                </button>
                                <button 
                                    onClick={() => handleBulkExtend(48)}
                                    className="px-3 py-1.5 bg-blue-900/30 text-blue-400 border border-blue-800 rounded text-xs hover:bg-blue-900/50 transition"
                                >
                                    +48h All
                                </button>
                            </div>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:border-blue-500 outline-none"
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
                                <button 
                                    onClick={() => handleRepublishSubmission(selectedSubmission)}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                                    title="Republish Submission (Fix Missing)"
                                >
                                    <RotateCw className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-gray-400 text-sm">
                                Submitted on {new Date(getTimestampAsNumber(selectedSubmission.createdAt)).toLocaleDateString()}
                            </p>
                        </div>
                    </div>

                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                        <div className="flex flex-col md:flex-row items-start gap-6">
                            <div className="w-full md:w-32 aspect-square md:h-32 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                                {selectedSubmission.artworkUrl ? (
                                    <img src={selectedSubmission.artworkUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600"><Music className="w-12 h-12" /></div>
                                )}
                            </div>
                            <div className="space-y-4 flex-1 w-full">
                                <div>
                                    <label className="text-xs text-gray-500 uppercase font-bold">Artist Name</label>
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
                    // Refetch submissions after successful edit if not using real-time listener for this specific submission
                    // Currently, the parent CreatorTools component has an onSnapshot listener for submissions,
                    // so changes should be reflected automatically.
                    setIsEditSubmissionOpen(false);
                }}
            />
        )}
    </div>
  );
}

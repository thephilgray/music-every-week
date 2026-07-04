import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2, Trash2, UserPlus, ArrowRight, ArrowLeft, Settings, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; 
import { useToast } from '../contexts/ToastContext';
import { uploadToR2 } from '../lib/r2'; 
import { db } from '../lib/firebase';
import { doc, updateDoc, setDoc, collection, query, where, getDocs, getDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import type { Prompt, UserProfile, Notification, Session } from '../types';
import { ConfirmModal } from './ui/ConfirmModal';
import { Tooltip } from './ui/Tooltip';
import { getTimestampAsNumber } from '../lib/utils';

interface EditPromptProps {
  request: Prompt;
  onClose: () => void;
  onUpdate: () => void;
}

export function EditPrompt({ request, onClose, onUpdate }: EditPromptProps) {
  const { user } = useAuth(); 
  const { success, error } = useToast();
  const navigate = useNavigate();
  
  const [step, setStep] = useState<1 | 2>(1);
  const [stepTransitioning, setStepTransitioning] = useState(false);
  const [title, setTitle] = useState(request.title);
  const [desc, setDesc] = useState(request.description);
  
  // Initialize deadline
  const [deadline, setDeadline] = useState(() => {
      if (!request.deadline) return '';
      if (request.deadline.endsWith('Z')) {
          const d = new Date(request.deadline);
          const offset = d.getTimezoneOffset() * 60000;
          const localTime = new Date(d.getTime() - offset);
          return localTime.toISOString().slice(0, 16);
      }
      return request.deadline;
  });
  
  const [playlistLiveDate, setPlaylistLiveDate] = useState(() => {
      if (!request.playlistLiveDate) return '';
      if (request.playlistLiveDate.endsWith('Z')) {
          const d = new Date(request.playlistLiveDate);
          const offset = d.getTimezoneOffset() * 60000;
          const localTime = new Date(d.getTime() - offset);
          return localTime.toISOString().slice(0, 16);
      }
      return request.playlistLiveDate;
  });

  const [accessMode, setAccessMode] = useState<'direct' | 'invite' | 'volunteer'>(
      (request.accessMode === 'public' ? 'direct' : request.accessMode) as 'direct' | 'invite' | 'volunteer' || 'direct'
  );
  const [file, setFile] = useState<File | null>(null);
  const [currentArtworkUrl] = useState(request.artworkUrl || '');
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Advanced Settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [poolSeats, setPoolSeats] = useState(request.poolSeats || 3);
  const [allowSubmissions, setAllowSubmissions] = useState(request.allowParticipantSubmissions !== undefined ? request.allowParticipantSubmissions : true);
  const [previewTrackCount, setPreviewTrackCount] = useState<number>(request.previewTrackCount !== undefined ? request.previewTrackCount : 5);

  // Session Grouping
  const [existingSessions, setExistingSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(request.sessionId || '');
  const [newSessionName, setNewSessionName] = useState<string>('');

  // Import Logic
  const [existingRequests, setExistingRequests] = useState<Prompt[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string>('');
  const [importFilter, setImportFilter] = useState<'all' | 'accepted' | 'submitted'>('all');

  // Participant Management
  const [selectedParticipants, setSelectedParticipants] = useState<Record<string, any>>(request.participants || {});
  const [emailInput, setEmailInput] = useState('');
  const [pendingEmails, setPendingEmails] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [playlistDocId, setPlaylistDocId] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  // Fetch Existing Requests and Sessions
  useEffect(() => {
    if (!user || !user.uid) return; 
    
    const fetchRequests = async () => {
      try {
        const q = query(collection(db, 'requests'), where('ownerPub', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const list: Prompt[] = [];
        querySnapshot.forEach((docSnap) => {
          if (docSnap.exists() && docSnap.id !== request.id) { 
            list.push({ id: docSnap.id, ...docSnap.data() } as Prompt);
          }
        });
        list.sort((a, b) => getTimestampAsNumber(a.createdAt) - getTimestampAsNumber(b.createdAt));
        setExistingRequests(list);
      } catch (e) {
        console.error("Error fetching existing requests for import:", e);
      }
    };

    const fetchSessions = async () => {
      try {
        const q = query(collection(db, 'sessions'), where('ownerPub', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const sessList: Session[] = [];
        querySnapshot.forEach((docSnap) => {
          sessList.push({ id: docSnap.id, ...docSnap.data() } as Session);
        });
        sessList.sort((a, b) => getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt));
        setExistingSessions(sessList);
      } catch (e) {
        console.error("Error fetching existing sessions:", e);
      }
    };

    fetchRequests();
    fetchSessions();
  }, [user, request.id]);

  const handleImportSelect = async (importId: string) => {
    setSelectedImportId(importId);
    if (!importId) return;

    try {
      const importRequestDocRef = doc(db, 'requests', importId);
      const importRequestSnap = await getDoc(importRequestDocRef);

      if (!importRequestSnap.exists()) return;

      const importRequestData = importRequestSnap.data() as Prompt;
      const newParticipants: Record<string, any> = {};
      const submitters = new Set<string>();

      if (importFilter === 'submitted') {
        const submissionsQuery = query(collection(importRequestDocRef, 'submissions'));
        const submissionsSnapshot = await getDocs(submissionsQuery);
        submissionsSnapshot.forEach(subDoc => {
          const subData = subDoc.data();
          if (subData.uploaderUid) {
            submitters.add(subData.uploaderUid);
          }
        });
      }
      
      const participantsData = importRequestData.participants || {}; 
      const accessListEmails = importRequestData.accessList || []; 

      for (const uid of Object.keys(participantsData)) {
        const participant = participantsData[uid];
        if (!participant || uid === user?.uid) continue;
        if (selectedParticipants[uid]) continue; 

        if (importFilter === 'accepted' && participant.status !== 'accepted') continue;
        if (importFilter === 'submitted') {
            const hasSubmitted = submitters.has(uid);
            if (!hasSubmitted) continue; 
        }
        
        newParticipants[uid] = { 
            status: 'pending', 
            alias: participant.alias || 'Unknown' 
        };
      }

      const newPendingEmails = new Set(pendingEmails);
      accessListEmails.forEach(email => {
        if (!newPendingEmails.has(email)) {
          newPendingEmails.add(email);
        }
      });
      setPendingEmails(Array.from(newPendingEmails));
      setSelectedParticipants(prev => ({ ...prev, ...newParticipants }));
    } catch (e) {
      console.error("Error importing participants:", e);
      error("Failed to import participants.");
    }
  };

  useEffect(() => {
      if (selectedImportId) {
          handleImportSelect(selectedImportId);
      }
  }, [importFilter]);

  useEffect(() => {
      const newHasData = request.participants && Object.keys(request.participants).length > 0;
      if (!selectedParticipants || Object.keys(selectedParticipants).length === 0 || newHasData) {
          setSelectedParticipants(request.participants || {});
      }
  }, [request.participants]);

  useEffect(() => {
      if (request.accessList && Array.isArray(request.accessList)) {
          setPendingEmails(request.accessList);
      } else {
        setPendingEmails([]);
      }
      
      const fetchAliases = async () => {
        const participantUids = Object.keys(selectedParticipants);
        if (participantUids.length === 0) return;

        for (const uid of participantUids) {
            if (!selectedParticipants[uid].alias) {
                try {
                    const profileDoc = await getDoc(doc(db, 'profiles', uid));
                    if (profileDoc.exists()) {
                        const profileData = profileDoc.data() as UserProfile;
                        if (profileData.alias) {
                            setSelectedParticipants(prev => {
                                if (prev[uid]) return { ...prev[uid], alias: profileData.alias };
                                return prev;
                            });
                        }
                    }
                } catch (e) {
                    console.error("Error fetching alias for", uid, e);
                }
            }
        }
      };
      fetchAliases();
  }, [request.accessList, request.participants]);

  useEffect(() => {
    if (request.playlistId) {
        const fetchPlaylist = async () => {
            try {
                const playlistDocRef = doc(db, 'playlists', request.playlistId as string);
                const playlistSnap = await getDoc(playlistDocRef);
                if (playlistSnap.exists()) {
                    setPlaylistDocId(playlistSnap.id);
                } else {
                    setPlaylistDocId(null);
                }
            } catch (e) {
                setPlaylistDocId(null);
            }
        };
        fetchPlaylist();
    } else {
        setPlaylistDocId(null);
    }
  }, [request.playlistId]);

  const searchUsers = async (term: string) => { 
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const q = query(collection(db, 'profiles'), 
                      where('alias', '>=', term), 
                      where('alias', '<=', term + '\uf8ff'));
      const querySnapshot = await getDocs(q);
      const results: UserProfile[] = [];
      querySnapshot.forEach((docSnap) => {
        const profile = docSnap.data() as UserProfile;
        if (profile.alias && profile.alias.toLowerCase().includes(term.toLowerCase()) && !selectedParticipants[docSnap.id]) {
          results.push({ ...profile, uid: docSnap.id }); 
        }
      });
      setSearchResults(results);
    } catch (e) {
      console.error("Error searching users:", e);
      setSearchResults([]);
    }
  };

  const addParticipant = (userProfile: UserProfile) => {
    setSelectedParticipants(prev => ({
      ...prev,
      [userProfile.uid]: { alias: userProfile.alias, status: accessMode === 'direct' ? 'accepted' : 'pending' }
    }));
    setSearchTerm('');
    setSearchResults([]);
  };

  const removeParticipant = (uid: string) => {
      const newParticipants = { ...selectedParticipants };
      delete newParticipants[uid];
      setSelectedParticipants(newParticipants);
  };

  const removeEmail = (email: string) => {
      setPendingEmails(prev => prev.filter(e => e !== email));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
        if (!title.trim() || !desc.trim()) {
            error("Title and Description are required.");
            return;
        }
        setStep(2);
        setStepTransitioning(true);
        setTimeout(() => setStepTransitioning(false), 500);
        return;
    }
    if (!title.trim() || !desc.trim()) {
        error("Title and Description are required.");
        return;
    }

    setLoading(true);
    let finalPendingEmails = [...pendingEmails].map(e => e.toLowerCase());
    if (emailInput.trim()) {
        const lingering = emailInput
            .split(/[\s,]+/)
            .map(s => s.trim().toLowerCase())
            .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !finalPendingEmails.includes(s));
        if (lingering.length > 0) {
            finalPendingEmails = Array.from(new Set([...finalPendingEmails, ...lingering]));
            setPendingEmails(finalPendingEmails);
            setEmailInput('');
        }
    }

    try {
      let artworkUrl = currentArtworkUrl;
      if (file) {
        const result = await uploadToR2(file);
        artworkUrl = result.url;
      }

      let inviteCode = request.inviteCode;
      if (!inviteCode) {
          inviteCode = crypto.randomUUID().substring(0, 8).toUpperCase();
          await setDoc(doc(db, 'invites', inviteCode), {
              fromUid: user?.uid || 'participant',
              createdAt: serverTimestamp(),
              status: 'active',
              forRequest: request.id
          });
      }

      let finalDeadline = deadline;
      if (deadline) {
          finalDeadline = new Date(deadline).toISOString();
      }
      
      let finalPlaylistLiveDate = playlistLiveDate;
      if (playlistLiveDate) {
          finalPlaylistLiveDate = new Date(playlistLiveDate).toISOString();
      }

      // Handle session grouping
      let finalSessionId = selectedSessionId === 'NEW' ? '' : selectedSessionId;
      if (selectedSessionId === 'NEW' && newSessionName.trim()) {
          const newSessRef = doc(collection(db, 'sessions'));
          finalSessionId = newSessRef.id;
          await setDoc(newSessRef, {
              name: newSessionName.trim(),
              ownerPub: user?.uid || request.ownerPub,
              ownerEmail: user?.email?.toLowerCase() || request.hostEmail || '',
              createdAt: serverTimestamp(),
              promptIds: [request.id!]
          });
      } else if (finalSessionId && finalSessionId !== request.sessionId) {
          try {
              const sessRef = doc(db, 'sessions', finalSessionId);
              await updateDoc(sessRef, {
                  promptIds: arrayUnion(request.id!)
              });
          } catch (err) {
              console.error("Failed to update session promptIds:", err);
          }
      }

      const updates: any = {
        title,
        description: desc,
        deadline: finalDeadline,
        playlistLiveDate: finalPlaylistLiveDate,
        accessMode,
        artworkUrl,
        inviteCode,
        accessList: finalPendingEmails,
        poolSeats: accessMode === 'volunteer' ? poolSeats : null,
        allowParticipantSubmissions: accessMode === 'volunteer' ? allowSubmissions : true,
        previewTrackCount: previewTrackCount,
        participants: selectedParticipants,
        sessionId: finalSessionId || null,
        updatedAt: serverTimestamp()
      };

      if (!request.ownerPub && user?.uid) {
          updates.ownerPub = user.uid;
      }
      
      const requestDocRef = doc(db, 'requests', request.id!);
      const updatePromises: Promise<any>[] = [];
      updatePromises.push(updateDoc(requestDocRef, updates));

      if (playlistDocId) {
          const playlistDocRef = doc(db, 'playlists', playlistDocId);
          const playlistUpdates: any = {
              title: updates.title,
              description: updates.description,
              artworkUrl: updates.artworkUrl,
              liveDate: finalPlaylistLiveDate ? new Date(finalPlaylistLiveDate).toISOString() : (finalDeadline ? new Date(finalDeadline).toISOString() : null),
              accessList: finalPendingEmails,
              accessMode: (accessMode === 'direct') ? 'public' : 'private',
              updatedAt: serverTimestamp()
          };
          updatePromises.push(updateDoc(playlistDocRef, playlistUpdates));
      }

      await Promise.all(updatePromises);
      
      // Notify New Participants
      const oldParticipants = request.participants || {};
      const existingKeys = Object.keys(oldParticipants);
      const addedParticipants = Object.keys(selectedParticipants).filter(uid => !existingKeys.includes(uid)); 
      
      const notificationPromises: Promise<any>[] = [];
      addedParticipants.forEach(async (partUid: string) => { 
          if (user?.uid && partUid === user.uid) return; 
          if (partUid.includes('@')) return;
          
          const notifId = crypto.randomUUID();
          const message = accessMode === 'direct' 
              ? `You were added to "${title}"`
              : `You've been invited to contribute to "${title}"`;

          const notification: Notification = {
              id: notifId,
              type: 'invite',
              message,
              link: `/request/${request.id}`,
              fromUid: user?.uid || 'participant', 
              createdAt: Date.now(), 
              read: false,
              requestId: request.id!
          };
          
          notificationPromises.push(
              updateDoc(doc(db, 'profiles', partUid), {
                  notifications: arrayUnion(notification)
              })
          );
      });
      
      await Promise.all(notificationPromises);
      success("Prompt updated!");
      onUpdate();
      onClose();
    } catch (err: any) {
      console.error("EditRequest: Save failed.", err);
      error(err.message || "Failed to update prompt.");
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async () => {
      if (!request.id) return;
      setIsDeleting(true);
      setShowConfirmDelete(false);
      
      try {
          const requestDocRef = doc(db, 'requests', request.id);
          await updateDoc(requestDocRef, {
              deleted: true,
              deletedAt: serverTimestamp()
          });
          
          success("Prompt deleted.");
          onUpdate();
          onClose();
          navigate('/');
      } catch (err: any) {
          console.error("Failed to delete request:", err);
          error("Failed to delete prompt: " + err.message);
          setIsDeleting(false);
      }
  };

  return createPortal(
    <div className="fixed top-0 left-0 w-full h-[100dvh] z-[9999] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm overscroll-none touch-none">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-xl shadow-2xl relative max-h-[90vh] overflow-y-auto overscroll-contain touch-auto">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg transition"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400" /> Edit Prompt
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Step {step} of 2: {step === 1 ? 'Basic Info & Deadlines' : 'Participants & Settings'}
              </p>
            </div>
            <div className="flex gap-1.5 mr-6">
              <div className={`w-5 h-1.5 rounded-full transition-colors ${step === 1 ? 'bg-blue-500' : 'bg-gray-700'}`} />
              <div className={`w-5 h-1.5 rounded-full transition-colors ${step === 2 ? 'bg-blue-500' : 'bg-gray-700'}`} />
            </div>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5">
            {step === 1 ? (
              /* STEP 1: BASICS */
              <div className="space-y-4 animate-in fade-in duration-200">
                <div>
                  <label className="block text-gray-300 text-sm mb-1 font-semibold">Title</label>
                  <input 
                      type="text" 
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded p-2.5 text-white focus:border-blue-500 outline-none text-sm"
                      required
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm mb-1 font-semibold">Description</label>
                  <textarea 
                      value={desc}
                      onChange={e => setDesc(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded p-2.5 text-white focus:border-blue-500 outline-none h-28 text-sm"
                      required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label className="block text-gray-300 text-sm mb-1 font-semibold flex items-center gap-2">
                          Deadline
                          <Tooltip content="The cut-off time for new submissions. Comments and interactions will remain open after this time." icon />
                      </label>
                      <input 
                          type="datetime-local" 
                          value={deadline}
                          onChange={e => setDeadline(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded p-2.5 text-white focus:border-blue-500 outline-none text-sm"
                      />
                  </div>
                  <div>
                      <label className="block text-gray-300 text-sm mb-1 font-semibold flex items-center gap-2">
                          Reveal Date (Optional)
                          <Tooltip content="If set, submissions remain hidden until this date." icon />
                      </label>
                      <input 
                          type="datetime-local" 
                          value={playlistLiveDate}
                          onChange={e => setPlaylistLiveDate(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded p-2.5 text-white focus:border-blue-500 outline-none text-sm"
                      />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 text-sm mb-1 font-semibold">Update Artwork (Optional)</label>
                  {(file || currentArtworkUrl) && (
                      <div className="mb-2 w-20 h-20 bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
                          <img 
                              src={file ? URL.createObjectURL(file) : currentArtworkUrl} 
                              alt="Artwork Preview" 
                              className="w-full h-full object-cover"
                          />
                      </div>
                  )}
                  <input 
                      type="file" 
                      onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                      className="w-full text-gray-400 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                  />
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                  <button
                      type="button"
                      onClick={() => setShowConfirmDelete(true)}
                      className="text-red-500 hover:text-red-400 text-sm font-semibold flex items-center gap-1.5 transition"
                      disabled={loading || isDeleting}
                  >
                      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Delete Prompt
                  </button>
                  
                  <div className="flex gap-2">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white text-sm font-semibold transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          if (!title.trim() || !desc.trim()) {
                            error("Please enter a title and description.");
                            return;
                          }
                          setStep(2);
                          setStepTransitioning(true);
                          setTimeout(() => setStepTransitioning(false), 500);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-semibold flex items-center gap-2 text-sm shadow-md transition"
                    >
                        Next: Participants <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* STEP 2: PARTICIPANTS & SETTINGS */
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* Session Selector */}
                <div>
                    <label className="block text-gray-300 text-sm mb-1 font-semibold flex items-center gap-2">
                        Assign to Session (Optional)
                        <Tooltip content="Group multiple related prompts together in Creator Tools." icon />
                    </label>
                    <select
                        value={selectedSessionId}
                        onChange={(e) => setSelectedSessionId(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2.5 text-white focus:border-blue-500 outline-none text-sm"
                    >
                        <option value="">-- No Session (Standalone Prompt) --</option>
                        {existingSessions.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                        <option value="NEW">+ Create New Session...</option>
                    </select>
                    {selectedSessionId === 'NEW' && (
                        <div className="mt-2.5 bg-gray-800/60 p-3 rounded border border-blue-500/50">
                            <label className="block text-xs text-blue-300 font-semibold mb-1">New Session Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Fall 2025 Songwriting Session"
                                value={newSessionName}
                                onChange={(e) => setNewSessionName(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white outline-none text-sm focus:border-blue-500"
                                required
                            />
                        </div>
                    )}
                </div>

                {/* Access Mode */}
                <div>
                    <label className="block text-gray-300 text-sm mb-1 font-semibold flex items-center gap-2">
                        Access Mode
                        <Tooltip content="Open: Anyone with the link can view and submit. Invite Only: Users must be explicitly invited." icon />
                    </label>
                    <select 
                        value={accessMode}
                        onChange={(e: any) => {
                            const newMode = e.target.value;
                            setAccessMode(newMode);
                            if (newMode === 'volunteer') {
                                setPendingEmails([]);
                                setEmailInput('');
                            }
                        }}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2.5 text-white focus:border-blue-500 outline-none text-sm"
                    >
                        <option value="direct">Open (Anyone with the link can view & submit)</option>
                        <option value="invite">Invite Only (Private participant list)</option>
                        {accessMode === 'volunteer' && <option value="volunteer">Volunteer Pool</option>}
                    </select>
                </div>

                {/* Participants Management */}
                {accessMode !== 'volunteer' && (
                  <div className="border-t border-gray-800 pt-4 space-y-4">
                     <label className="block text-gray-300 text-sm font-semibold flex items-center gap-2">
                       <UserPlus className="w-4 h-4 text-blue-400" />
                       Manage Participants
                       <Tooltip content="Build your invite list here. Users must be invited to see this prompt if set to Invite Only." icon />
                     </label>

                     {/* Import from previous */}
                     <div className="flex gap-2 items-end">
                       <div className="flex-1">
                           <label className="block text-gray-400 text-xs mb-1 flex items-center gap-1.5">
                               Import from Previous
                               <Tooltip content="Quickly copy the participant list from a past prompt." icon />
                           </label>
                           <select
                               value={selectedImportId}
                               onChange={(e) => handleImportSelect(e.target.value)}
                               className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                           >
                               <option value="">-- Select prompt --</option>
                               {existingRequests.map(req => (
                                   <option key={req.id} value={req.id}>{req.title}</option>
                               ))}
                           </select>
                       </div>
                       <div className="w-1/3">
                           <label className="block text-gray-400 text-xs mb-1 flex items-center gap-1.5">
                               Filter
                           </label>
                           <select
                               value={importFilter}
                               onChange={(e: any) => setImportFilter(e.target.value)}
                               className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                           >
                               <option value="all">All</option>
                               <option value="accepted">Accepted</option>
                               <option value="submitted">Submitted</option>
                           </select>
                       </div>
                     </div>

                     {/* Search Directory */}
                     <div className="relative">
                       <input
                         type="text"
                         value={searchTerm}
                         onChange={(e) => searchUsers(e.target.value)}
                         className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                         placeholder="Add user from member directory..."
                       />
                       {searchResults.length > 0 && (
                         <div className="absolute z-10 w-full bg-gray-800 border border-gray-600 rounded mt-1 max-h-40 overflow-y-auto shadow-xl">
                           {searchResults.map(u => (
                             <div 
                               key={u.uid}
                               onClick={() => addParticipant(u)}
                               className="p-2 hover:bg-gray-700 cursor-pointer text-white text-sm flex justify-between items-center"
                             >
                               <span>{u.alias}</span>
                               <span className="text-xs text-blue-400 font-semibold">+ Add</span>
                             </div>
                           ))}
                         </div>
                       )}
                     </div>

                     {/* Email Invites */}
                     <div>
                       <label className="block text-gray-400 text-xs mb-1 flex items-center gap-1.5">
                           Invite by Email (Comma or newline separated)
                       </label>
                       <textarea 
                         value={emailInput}
                         onChange={e => {
                            const val = e.target.value;
                            setEmailInput(val);
                            
                            if (val.includes(',') || val.includes('\n')) {
                                const raw = val.split(/[\s,]+/);
                                const valid: string[] = [];
                                let remaining = '';

                                raw.forEach((s, i) => {
                                    const trimmed = s.trim();
                                    const endsWithDelimiter = val.trimEnd().match(/[`,]$/);
                                    const hasInternalSpace = trimmed.includes(' ');

                                    if (i === raw.length - 1 && !endsWithDelimiter) { 
                                        remaining = s; 
                                    } else if (trimmed.length > 5 && trimmed.includes('@') && !hasInternalSpace && !pendingEmails.includes(trimmed)) {
                                        valid.push(trimmed);
                                    }
                                });
                                
                                if (valid.length > 0) {
                                    setPendingEmails(prev => Array.from(new Set([...prev, ...valid])));
                                    setEmailInput(remaining); 
                                }
                            }
                         }}
                         onBlur={() => {
                            if (!emailInput.trim()) return;
                            const valid = emailInput
                                .split(/[\s,]+/)
                                .map(s => s.trim())
                                .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !pendingEmails.includes(s));
                            
                            if (valid.length > 0) {
                                setPendingEmails(prev => Array.from(new Set([...prev, ...valid])));
                                setEmailInput(''); 
                            }
                         }}
                         className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none h-16 text-sm"
                         placeholder="friend@example.com"
                       />
                     </div>

                     {/* Selected Participants List */}
                     {(Object.keys(selectedParticipants).length > 0 || pendingEmails.length > 0) && (
                        <div className="bg-gray-800/80 p-3 rounded border border-gray-700">
                           <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide font-semibold">Selected Participants</label>
                           <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                              {Object.entries(selectedParticipants).map(([uid, p]: [string, any]) => (
                                 <span key={uid} className="bg-indigo-900/80 text-indigo-200 text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-indigo-700">
                                   <span title={uid}>{p.alias || 'User'}</span>
                                   <button type="button" onClick={() => removeParticipant(uid)} className="hover:text-white font-bold px-1 ml-0.5">×</button>
                                 </span>
                              ))}
                              {pendingEmails.map(email => (
                                <span key={email} className="bg-blue-900/80 text-blue-200 text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-blue-700">
                                  {email}
                                  <button type="button" onClick={() => removeEmail(email)} className="hover:text-white font-bold px-1 ml-0.5">×</button>
                                </span>
                              ))}
                           </div>
                        </div>
                     )}
                  </div>
                )}

                {/* Advanced Settings Section */}
                <div className="border border-gray-800 rounded-lg overflow-hidden pt-2">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full bg-gray-800/60 hover:bg-gray-800 px-4 py-3 text-left text-xs font-semibold text-gray-300 flex items-center justify-between transition"
                    >
                        <span className="flex items-center gap-2">
                            <Settings className="w-4 h-4 text-gray-400" /> Advanced Settings (Volunteer Pool, Preview Track Limit)
                        </span>
                        <span className="text-base font-bold text-gray-400">{showAdvanced ? '−' : '+'}</span>
                    </button>
                    {showAdvanced && (
                        <div className="p-4 bg-gray-800/30 space-y-4 border-t border-gray-800">
                            <div className="flex items-center justify-between pb-3 border-b border-gray-700/60">
                                <div>
                                    <span className="text-sm font-semibold text-gray-300">Volunteer Pool Mode</span>
                                    <p className="text-xs text-gray-400">Limit open seats for community members to give feedback.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAccessMode(accessMode === 'volunteer' ? 'direct' : 'volunteer')}
                                    className={`px-3 py-1.5 rounded text-xs font-semibold transition ${accessMode === 'volunteer' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    {accessMode === 'volunteer' ? 'Enabled' : 'Switch to Volunteer Pool'}
                                </button>
                            </div>
                            {accessMode === 'volunteer' && (
                                <div className="p-3 bg-gray-900 rounded border border-gray-700 space-y-3">
                                    <div className="flex items-center gap-4">
                                        <label className="text-gray-300 text-sm">Open Seats:</label>
                                        <input 
                                            type="number" 
                                            min={2} 
                                            value={poolSeats} 
                                            onChange={e => setPoolSeats(Math.max(2, parseInt(e.target.value) || 2))}
                                            className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-center focus:border-blue-500 outline-none text-sm"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox" 
                                            id="allowSubmissions"
                                            checked={allowSubmissions}
                                            onChange={e => setAllowSubmissions(e.target.checked)}
                                            className="rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
                                        />
                                        <label htmlFor="allowSubmissions" className="text-gray-300 text-xs cursor-pointer select-none">
                                            Allow volunteers to submit tracks
                                        </label>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-gray-300 text-xs mb-1 font-semibold flex items-center gap-1.5">
                                    Preview Tracks Limit
                                    <Tooltip content="Number of tracks visible after submitting before deadline. 0 hides all." icon />
                                </label>
                                <input 
                                    type="number" 
                                    min="0"
                                    value={previewTrackCount}
                                    onChange={e => setPreviewTrackCount(parseInt(e.target.value) || 0)}
                                    className="w-28 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 transition text-sm border border-gray-700"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Basics
                    </button>

                    <div className="flex gap-2">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="px-4 py-2 text-gray-400 hover:text-white transition text-sm font-semibold"
                            disabled={loading || isDeleting}
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading || isDeleting || stepTransitioning}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-semibold flex items-center gap-2 text-sm shadow-md transition disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Changes
                        </button>
                    </div>
                </div>
              </div>
            )}
        </form>
        
        <ConfirmModal 
            isOpen={showConfirmDelete}
            title="Delete Prompt?"
            message="Are you sure you want to delete this prompt? This will hide it from all participants and cannot be undone."
            confirmLabel="Delete Forever"
            isDestructive={true}
            onConfirm={executeDelete}
            onCancel={() => setShowConfirmDelete(false)}
        />
      </div>
    </div>,
    document.body
  );
}

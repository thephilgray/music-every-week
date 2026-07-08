import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { uploadToR2 } from '../lib/r2';
import type { Prompt, Session } from '../types';
import { Check, Copy, ArrowRight, ArrowLeft, Settings, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tooltip } from './ui/Tooltip';
import { db } from '../lib/firebase';
import { collection, serverTimestamp, query, where, getDocs, doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getTimestampAsNumber, copyToClipboard } from '../lib/utils';

export function CreatePrompt() {
  const { user } = useAuth();
  const { success, error } = useToast();
  
  const [step, setStep] = useState<1 | 2>(1);
  const [stepTransitioning, setStepTransitioning] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadline, setDeadline] = useState('');
  const [playlistLiveDate, setPlaylistLiveDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Participants & Access
  const [accessMode, setAccessMode] = useState<'direct' | 'invite' | 'volunteer'>('direct');
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  
  // Session Grouping
  const [existingSessions, setExistingSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [newSessionName, setNewSessionName] = useState<string>('');

  // Advanced Settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewTrackCount, setPreviewTrackCount] = useState<number>(5);
  const [poolSeats, setPoolSeats] = useState(3);
  const [allowSubmissions, setAllowSubmissions] = useState(true);

  // Import Logic
  const [existingRequests, setExistingRequests] = useState<Prompt[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string>('');

  // Success State
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdRequestId, setCreatedRequestId] = useState<string>('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const removeEmail = (email: string) => {
    setEmails(emails.filter(e => e !== email));
  };

  useEffect(() => {
    if (!user?.email || !user?.uid) return;
    
    // Fetch existing requests for import
    const fetchRequests = async () => {
        try {
            const q = query(collection(db, 'requests'), where('ownerEmail', '==', user.email));
            const querySnapshot = await getDocs(q);
            const reqs: Prompt[] = [];
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (!data.deleted) {
                    reqs.push({ id: docSnap.id, ...data } as Prompt);
                }
            });
            reqs.sort((a, b) => getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt));
            setExistingRequests(reqs);
        } catch (e) {
            console.error("Error fetching existing requests:", e);
        }
    };

    // Fetch existing sessions for grouping
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
  }, [user]);

  const handleImportSelect = async (requestId: string) => {
    setSelectedImportId(requestId);
    if (!requestId) return; 
    
    const req = existingRequests.find(r => r.id === requestId);
    if (req && req.accessList) {
        setEmails(prev => Array.from(new Set([...prev, ...req.accessList!])));
    }
  };

  const copyLink = async () => {
      const isCopied = await copyToClipboard(inviteLink);
      if (isCopied) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      }
  };

  const resetForm = () => {
      setTitle('');
      setDesc('');
      setDeadline('');
      setPlaylistLiveDate('');
      setFile(null);
      setPreviewTrackCount(5);
      setEmails([]);
      setEmailInput('');
      setSelectedImportId('');
      setSelectedSessionId('');
      setNewSessionName('');
      setShowAdvanced(false);
      setStep(1);
      setShowSuccess(false);
      setCreatedRequestId('');
      setInviteLink('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (step === 1) {
        if (!title.trim() || !desc.trim() || !deadline) {
            error("Please fill out Title, Description, and Deadline before continuing.");
            return;
        }
        setStep(2);
        setStepTransitioning(true);
        setTimeout(() => setStepTransitioning(false), 500);
        return;
    }

    if (!user?.uid || !user?.email) {
      error("Authentication required to create a prompt.");
      return;
    }
    setLoading(true);
    console.log("CreatePrompt: Starting submission...");

    try {
      // Process any lingering email input
      let finalEmails = [...emails].map(e => e.toLowerCase());
      if (emailInput.trim()) {
          const lingering = emailInput
              .split(/[\s,]+/)
              .map(s => s.trim().toLowerCase())
              .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !finalEmails.includes(s));
          if (lingering.length > 0) {
              finalEmails = Array.from(new Set([...finalEmails, ...lingering]));
              setEmails(finalEmails);
              setEmailInput('');
          }
      }

      let artworkUrl = '';
      if (file) {
        try {
            console.log("CreatePrompt: Uploading artwork...");
            const result = await uploadToR2(file);
            artworkUrl = result.url;
        } catch (err: any) {
            console.error("CreatePrompt: Artwork upload failed", err);
            error("Artwork upload failed: " + err.message);
            setLoading(false);
            return;
        }
      }

      const inviteCode = crypto.randomUUID().substring(0, 8).toUpperCase();

      const safeISO = (dateStr: string) => {
          if (!dateStr) return null;
          try {
              const d = new Date(dateStr);
              return isNaN(d.getTime()) ? null : d.toISOString();
          } catch (err) {
              return null;
          }
      };

      const requestId = doc(collection(db, 'requests')).id;
      const playlistId = doc(collection(db, 'playlists')).id;

      // Handle session grouping
      let finalSessionId = selectedSessionId === 'NEW' ? '' : selectedSessionId;
      if (selectedSessionId === 'NEW' && newSessionName.trim()) {
          const newSessRef = doc(collection(db, 'sessions'));
          finalSessionId = newSessRef.id;
          await setDoc(newSessRef, {
              name: newSessionName.trim(),
              ownerPub: user.uid,
              ownerEmail: user.email.toLowerCase(),
              createdAt: serverTimestamp(),
              promptIds: [requestId]
          });
      } else if (finalSessionId) {
          try {
              const sessRef = doc(db, 'sessions', finalSessionId);
              await updateDoc(sessRef, {
                  promptIds: arrayUnion(requestId)
              });
          } catch (err) {
              console.error("Failed to update session promptIds:", err);
          }
      }

      const requestData: any = {
        title: title.trim(),
        description: desc.trim(),
        deadline: safeISO(deadline),
        playlistLiveDate: safeISO(playlistLiveDate),
        accessMode,
        artworkUrl: artworkUrl || null,
        ownerEmail: user.email.toLowerCase(), 
        ownerPub: user.uid, 
        accessList: finalEmails, 
        inviteCode,
        poolSeats: accessMode === 'volunteer' ? poolSeats : null,
        allowParticipantSubmissions: accessMode === 'volunteer' ? allowSubmissions : true,
        hostEmail: user.email.toLowerCase(), 
        previewTrackCount: previewTrackCount,
        playlistId: playlistId,
        sessionId: finalSessionId || null,
        createdAt: serverTimestamp()
      };

      const playlistData = {
          title: requestData.title,
          description: requestData.description,
          artworkUrl: requestData.artworkUrl,
          ownerEmail: requestData.ownerEmail,
          ownerPub: requestData.ownerPub,
          requestId: requestId,
          liveDate: safeISO(playlistLiveDate) || safeISO(deadline), 
          accessList: finalEmails,
          accessMode: (accessMode === 'direct') ? 'public' : 'private',
          createdAt: serverTimestamp(),
          tracks: []
      };

      console.log("CreatePrompt: Saving documents...");
      await Promise.all([
          setDoc(doc(db, 'requests', requestId), requestData),
          setDoc(doc(db, 'playlists', playlistId), playlistData)
      ]);

      console.log("CreatePrompt: Prompt and Playlist created.");
      const finalRequestLink = `${window.location.origin}/prompt/${requestId}`;
      
      setInviteLink(finalRequestLink);
      setCreatedRequestId(requestId);
      setShowSuccess(true);
      success("Prompt created successfully!");
      
    } catch (err: any) {
      console.error("CreatePrompt: Request creation failed.", err);
      error('Error creating prompt: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  if (showSuccess) {
      return (
        <div className="bg-green-900/20 border border-green-800 p-8 rounded-lg shadow-lg mb-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-green-500">
                <Check className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Prompt Created!</h2>
            <p className="text-gray-300 mb-6">Your prompt is live. Share the link below to invite others.</p>
            
            <div className="bg-black/40 p-4 rounded-lg flex items-center justify-between gap-4 max-w-md mx-auto mb-6 border border-gray-700">
                <code className="text-sm text-blue-300 truncate">{inviteLink}</code>
                <button 
                    onClick={copyLink}
                    className="p-2 hover:bg-gray-700 rounded transition text-gray-400 hover:text-white"
                    title="Copy Link"
                >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>

            <div className="flex justify-center gap-4">
                <button 
                    onClick={resetForm}
                    className="text-gray-400 hover:text-white px-4 py-2 text-sm font-semibold"
                >
                    Create Another
                </button>
                <Link 
                    to={`/prompt/${createdRequestId}`}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold flex items-center gap-2 text-sm"
                >
                    View Prompt <ArrowRight className="w-4 h-4" />
                </Link>
            </div>
        </div>
      );
  }

  return (
    <div className="bg-gray-800 p-3 sm:p-6 rounded-lg shadow-lg mb-8 border border-gray-700">
      <div className="flex items-center justify-between mb-6 border-b border-gray-700 pb-4">
        <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400" /> Create New Prompt
            </h3>
            <p className="text-xs text-gray-400 mt-1">
                Step {step} of 2: {step === 1 ? 'Basic Info & Deadlines' : 'Participants & Settings'}
            </p>
        </div>
        <div className="flex gap-1.5">
            <div className={`w-6 h-1.5 rounded-full transition-colors ${step === 1 ? 'bg-blue-500' : 'bg-gray-600'}`} />
            <div className={`w-6 h-1.5 rounded-full transition-colors ${step === 2 ? 'bg-blue-500' : 'bg-gray-600'}`} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {step === 1 ? (
            /* STEP 1: BASICS */
            <div className="space-y-4 animate-in fade-in duration-200">
                <div>
                  <label className="block text-gray-400 text-sm mb-1 font-semibold">Title <span className="text-red-400">*</span></label>
                  <input 
                    type="text" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2.5 text-white focus:border-blue-500 outline-none text-base sm:text-sm"
                    placeholder="e.g. Week 1: Lofi Beats"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-400 text-sm mb-1 font-semibold">Description <span className="text-red-400">*</span></label>
                  <textarea 
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2.5 text-white focus:border-blue-500 outline-none h-28 text-base sm:text-sm"
                    placeholder="Describe the creative prompt or assignment..."
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="min-w-0 max-w-full">
                    <label className="block text-gray-400 text-sm mb-1 font-semibold flex items-center gap-2">
                        Deadline <span className="text-red-400">*</span>
                        <Tooltip content="The cut-off time for new submissions. Comments and interactions remain open after this time." icon />
                    </label>
                    <input 
                      type="datetime-local" 
                      value={deadline}
                      onChange={e => setDeadline(e.target.value)}
                      className="w-full max-w-full min-w-0 box-border block bg-gray-900 border border-gray-600 rounded p-2.5 text-white focus:border-blue-500 outline-none text-base sm:text-sm"
                      required
                    />
                  </div>
                  <div className="min-w-0 max-w-full">
                    <label className="block text-gray-400 text-sm mb-1 font-semibold flex items-center gap-2">
                        Reveal Date (Optional)
                        <Tooltip content="When submissions become visible to other participants. If blank, they are visible immediately or after deadline depending on mode." icon />
                    </label>
                    <input 
                      type="datetime-local" 
                      value={playlistLiveDate}
                      onChange={e => setPlaylistLiveDate(e.target.value)}
                      className="w-full max-w-full min-w-0 box-border block bg-gray-900 border border-gray-600 rounded p-2.5 text-white focus:border-blue-500 outline-none text-base sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-1 font-semibold">Artwork (Optional)</label>
                  <input 
                    type="file" 
                    onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full text-gray-400 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                  />
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-700">
                  <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        if (!title.trim() || !desc.trim() || !deadline) {
                            error("Please fill out Title, Description, and Deadline before continuing.");
                            return;
                        }
                        setStep(2);
                        setStepTransitioning(true);
                        setTimeout(() => setStepTransitioning(false), 500);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded font-semibold flex items-center gap-2 transition text-sm shadow-md"
                  >
                    <span>Next<span className="hidden sm:inline">: Participants & Settings</span></span> <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
            </div>
        ) : (
            /* STEP 2: PARTICIPANTS & SETTINGS */
            <div className="space-y-5 animate-in fade-in duration-200">
                {/* Session Selector */}
                <div>
                    <label className="block text-gray-400 text-sm mb-1 font-semibold flex items-center gap-2">
                        Assign to Session (Optional)
                        <Tooltip content="Group multiple related prompts (e.g. bi-weekly sessions for Fall 2025) together in Creator Tools." icon />
                    </label>
                    <select
                        value={selectedSessionId}
                        onChange={(e) => setSelectedSessionId(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded p-2.5 text-white focus:border-blue-500 outline-none text-sm"
                    >
                        <option value="">-- No Session (Standalone Prompt) --</option>
                        {existingSessions.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                        <option value="NEW">+ Create New Session...</option>
                    </select>
                    {selectedSessionId === 'NEW' && (
                        <div className="mt-2.5 bg-gray-900/60 p-3 rounded border border-blue-500/50">
                            <label className="block text-xs text-blue-300 font-semibold mb-1">New Session Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Fall 2025 Songwriting Session"
                                value={newSessionName}
                                onChange={(e) => setNewSessionName(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white outline-none text-sm focus:border-blue-500"
                                required
                            />
                            <p className="text-xs text-gray-400 mt-1">This creates a session folder to organize this and future prompts.</p>
                        </div>
                    )}
                </div>

                {/* Access Mode */}
                <div>
                    <label className="block text-gray-400 text-sm mb-1 font-semibold flex items-center gap-2">
                        Access Mode
                        <Tooltip content="Open: Anyone with the link can view and submit tracks. Invite Only: Users must be explicitly invited by email." icon />
                    </label>
                    <select
                        value={accessMode}
                        onChange={(e: any) => {
                            const newMode = e.target.value;
                            setAccessMode(newMode);
                            if (newMode === 'volunteer') {
                                setEmails([]);
                                setEmailInput('');
                            }
                        }}
                        className="w-full bg-gray-900 border border-gray-600 rounded p-2.5 text-white focus:border-blue-500 outline-none text-sm"
                    >
                        <option value="direct">Open (Anyone with the link can view & submit)</option>
                        <option value="invite">Invite Only (Private participant list)</option>
                        {accessMode === 'volunteer' && <option value="volunteer">Volunteer Pool (Feedback mode)</option>}
                    </select>
                    {accessMode === 'direct' && (
                        <p className="text-yellow-500/90 text-xs mt-1.5 font-medium">
                            Note: Anyone with the link can submit tracks. Invited users will see this in their feed automatically.
                        </p>
                    )}
                </div>

                {/* Participants Management (Hidden if Volunteer Pool is active) */}
                {accessMode !== 'volunteer' && (
                    <div className="border-t border-gray-700 pt-4 space-y-4">
                        <label className="block text-gray-300 text-sm font-semibold flex items-center gap-2">
                            Add Participants
                            <Tooltip content="Build your invite list here. Users must be invited to see this prompt if set to Invite Only." icon />
                        </label>

                        {/* Import from previous */}
                        <div>
                            <label className="block text-gray-400 text-xs mb-1 flex items-center gap-1.5">
                                Import from Previous Prompt
                                <Tooltip content="Quickly copy the participant list from a past prompt." icon />
                            </label>
                            <select
                                value={selectedImportId}
                                onChange={(e) => handleImportSelect(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                            >
                                <option value="">-- Select a previous prompt --</option>
                                {existingRequests.map(req => (
                                    <option key={req.id} value={req.id}>
                                        {req.title} ({new Date(getTimestampAsNumber(req.createdAt)).toLocaleDateString()})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Email Invites */}
                        <div>
                            <label className="block text-gray-400 text-xs mb-1 flex items-center gap-1.5">
                                Invite by Email (Comma or newline separated)
                                <Tooltip content="Add external users by email address." icon />
                            </label>
                            <textarea 
                                value={emailInput}
                                onChange={e => {
                                    const val = e.target.value;
                                    setEmailInput(val);
                                    
                                    if (val.includes(',') || val.includes('\n')) {
                                        const raw = val.split(/[\n,\s]+/);
                                        const valid: string[] = [];
                                        let remaining = '';

                                        raw.forEach((s, i) => {
                                            const trimmed = s.trim();
                                            const endsWithDelimiter = val.trimEnd().match(/[`,]$/);
                                            const hasInternalSpace = trimmed.includes(' ');

                                            if (i === raw.length - 1 && !endsWithDelimiter) { 
                                                remaining = s; 
                                            } else if (trimmed.length > 5 && trimmed.includes('@') && !hasInternalSpace && !emails.includes(trimmed)) {
                                                valid.push(trimmed);
                                            }
                                        });
                                        
                                        if (valid.length > 0) {
                                            setEmails(prev => Array.from(new Set([...prev, ...valid])));
                                            setEmailInput(remaining); 
                                        }
                                    }
                                }}
                                onBlur={() => {
                                    if (!emailInput.trim()) return;
                                    const valid = emailInput
                                        .split(/[\n,\s]+/)
                                        .map(s => s.trim())
                                        .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !emails.includes(s));
                                    
                                    if (valid.length > 0) {
                                        setEmails(prev => Array.from(new Set([...prev, ...valid])));
                                        setEmailInput(''); 
                                    }
                                }}
                                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none h-20 text-sm"
                                placeholder="friend@example.com (Press Enter or Comma to add)"
                            />
                        </div>

                        {/* Selected Participants List */}
                        {emails.length > 0 && (
                            <div className="bg-gray-900 p-3 rounded border border-gray-700">
                                <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide font-semibold">Selected Participants ({emails.length})</label>
                                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                                    {emails.map(email => (
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
                <div className="border border-gray-700 rounded-lg overflow-hidden pt-2">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full bg-gray-900/50 hover:bg-gray-900 px-4 py-3 text-left text-xs font-semibold text-gray-300 flex items-center justify-between transition"
                    >
                        <span className="flex items-center gap-2">
                            <Settings className="w-4 h-4 text-gray-400" /> <span>Advanced Settings<span className="hidden sm:inline"> (Volunteer Pool, Preview Track Limit)</span></span>
                        </span>
                        <span className="text-base font-bold text-gray-400">{showAdvanced ? '−' : '+'}</span>
                    </button>
                    {showAdvanced && (
                        <div className="p-4 bg-gray-900/30 space-y-4 border-t border-gray-700">
                            {/* Volunteer Pool toggle */}
                            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                                <div>
                                    <span className="text-sm font-semibold text-gray-300">Volunteer Pool Mode</span>
                                    <p className="text-xs text-gray-400">Limit open seats for community members to give feedback.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAccessMode(accessMode === 'volunteer' ? 'direct' : 'volunteer')}
                                    className={`px-3 py-1.5 rounded text-xs font-semibold transition ${accessMode === 'volunteer' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    {accessMode === 'volunteer' ? 'Enabled' : <span><span className="sm:hidden">Volunteer Mode</span><span className="hidden sm:inline">Switch to Volunteer Pool</span></span>}
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
                                        <span className="text-xs text-gray-400">First to accept get seats.</span>
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
                            {/* Preview tracks limit */}
                            <div>
                                <label className="block text-gray-300 text-xs mb-1 font-semibold flex items-center gap-1.5">
                                    Preview Tracks Limit
                                    <Tooltip content="Number of tracks visible to participants after they submit but before the deadline. Set to 0 to hide all." icon />
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={previewTrackCount}
                                    onChange={e => setPreviewTrackCount(parseInt(e.target.value) || 0)}
                                    className="w-28 bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                                />
                                <p className="text-xs text-gray-500 mt-1">Default is 5 tracks.</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-700">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded font-semibold flex items-center gap-2 transition text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || stepTransitioning}
                    className={`flex-1 py-2.5 rounded font-semibold transition text-sm shadow-md ${loading ? 'bg-gray-600 cursor-not-allowed text-gray-300' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  >
                    {loading ? 'Creating Prompt...' : 'Create Prompt'}
                  </button>
                </div>
            </div>
        )}
      </form>
    </div>
  );
}

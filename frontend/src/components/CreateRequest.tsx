import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { uploadToR2 } from '../lib/r2';
import type { FileRequest } from '../types';
import { Check, Copy, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tooltip } from './ui/Tooltip';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { getTimestampAsNumber } from '../lib/utils';

export function CreateRequest() {
  const { user } = useAuth(); // Use Auth Context
  const { error } = useToast();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadline, setDeadline] = useState('');
  const [playlistLiveDate, setPlaylistLiveDate] = useState('');
  const [previewTrackCount, setPreviewTrackCount] = useState<number>(5);
  const [accessMode, setAccessMode] = useState<'direct' | 'invite' | 'volunteer'>('direct');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [separatePlaylistAccess, setSeparatePlaylistAccess] = useState(false);
  const [playlistEmailInput, setPlaylistEmailInput] = useState('');
  const [playlistEmails, setPlaylistEmails] = useState<string[]>([]);

  // Volunteer Pool Logic
  const [poolSeats, setPoolSeats] = useState(3);
  const [allowSubmissions, setAllowSubmissions] = useState(true);

  // Import Logic
  const [existingRequests, setExistingRequests] = useState<FileRequest[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string>('');

  // Success State
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdRequestId, setCreatedRequestId] = useState<string>('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const removeEmail = (email: string) => {
    setEmails(emails.filter(e => e !== email));
  };

  const removePlaylistEmail = (email: string) => {
    setPlaylistEmails(playlistEmails.filter(e => e !== email));
  };

  useEffect(() => {
    if (!user?.email) return;
    
    // Fetch existing requests for import (Firestore)
    const fetchRequests = async () => {
        try {
            const q = query(collection(db, 'requests'), where('ownerEmail', '==', user.email));
            const querySnapshot = await getDocs(q);
            const reqs: FileRequest[] = [];
            querySnapshot.forEach((doc) => {
                reqs.push({ id: doc.id, ...doc.data() } as FileRequest);
            });
            // Sort by createdAt desc, explicitly converting to number
            reqs.sort((a, b) => 
                getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt)
            );
            setExistingRequests(reqs);
        } catch (e) {
            console.error("Error fetching existing requests:", e);
        }
    };
    fetchRequests();
  }, [user]);

  const handleImportSelect = async (requestId: string) => {
    setSelectedImportId(requestId);
    if (!requestId) return; 
    
    // Find the request locally
    const req = existingRequests.find(r => r.id === requestId);
    if (req && req.accessList) {
        // Merge unique emails
        setEmails(prev => Array.from(new Set([...prev, ...req.accessList!])));
    }
  };

  const copyLink = () => {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const resetForm = () => {
      setTitle('');
      setDesc('');
      setDeadline('');
      setFile(null);
      setPreviewTrackCount(5);
      setEmails([]);
      setSelectedImportId('');
      setShowSuccess(false);
      setCreatedRequestId('');
      setInviteLink('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!user) {
      error("Authentication required to create a request.");
      return;
    }
    setLoading(true);

    try {
      // Process any lingering email input
      let finalEmails = [...emails];
      if (emailInput.trim()) {
          const lingering = emailInput
              .split(/[\s,]+/)
              .map(s => s.trim())
              .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !emails.includes(s));
          if (lingering.length > 0) {
              finalEmails = Array.from(new Set([...finalEmails, ...lingering]));
              setEmails(finalEmails);
              setEmailInput('');
          }
      }

      let finalPlaylistEmails = [...playlistEmails];
      if (separatePlaylistAccess && playlistEmailInput.trim()) {
          const lingeringPlaylist = playlistEmailInput
              .split(/[\s,]+/)
              .map(s => s.trim())
              .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !playlistEmails.includes(s));
          if (lingeringPlaylist.length > 0) {
              finalPlaylistEmails = Array.from(new Set([...finalPlaylistEmails, ...lingeringPlaylist]));
              setPlaylistEmails(finalPlaylistEmails);
              setPlaylistEmailInput('');
          }
      }

      let artworkUrl = '';
      if (file) {
        try {
            const result = await uploadToR2(file);
            artworkUrl = result.url;
        } catch (e: any) {
            error("Artwork upload failed: " + e.message);
            setLoading(false);
            return;
        }
      }

      // Generate Invite Code (Optional, but good for direct links)
      const inviteCode = crypto.randomUUID().substring(0, 8).toUpperCase();

      const requestData: any = {
        title,
        description: desc,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        playlistLiveDate: playlistLiveDate ? new Date(playlistLiveDate).toISOString() : null,
        accessMode,
        artworkUrl: artworkUrl || null,
        ownerEmail: user.email, // Use Email as identifier
        ownerPub: user.uid, // Use ownerPub for Firebase
        createdAt: Date.now(), // Firestore timestamp is better, but number is used in types
        accessList: finalEmails, // Store emails directly
        inviteCode,
        poolSeats: accessMode === 'volunteer' ? poolSeats : null,
        allowParticipantSubmissions: accessMode === 'volunteer' ? allowSubmissions : true,
        hostEmail: user.email, // Explicit host email
        previewTrackCount: previewTrackCount,
      };

      // Create in Firestore
      const docRef = await addDoc(collection(db, 'requests'), {
          ...requestData,
          createdAt: serverTimestamp() // Use server timestamp for sorting
      });
      
      const requestId = docRef.id;

      // Create a linked playlist document
      let playlistId: string | null = null;
      let finalPlaylistLink: string | null = null;

      const playlistAccessList = separatePlaylistAccess ? finalPlaylistEmails : finalEmails;
      const playlistData = {
          title: requestData.title,
          description: requestData.description,
          artworkUrl: requestData.artworkUrl,
          ownerEmail: requestData.ownerEmail,
          ownerPub: requestData.ownerPub,
          requestId: requestId, // Link to the request
          liveDate: playlistLiveDate ? new Date(playlistLiveDate).toISOString() : (deadline ? new Date(deadline).toISOString() : null), // Use playlistLiveDate if set, else request deadline
          accessList: playlistAccessList,
          createdAt: serverTimestamp()
      };

      const playlistDocRef = await addDoc(collection(db, 'playlists'), playlistData);
      playlistId = playlistDocRef.id;
      finalPlaylistLink = `${window.location.origin}/playlist/${playlistId}`;


      // Note: We are NOT sending notifications yet (Step 8 might add cloud functions or client-side emails).
      // Since we don't have a reliable way to map emails to users without a directory search (which we removed from client),
      // we rely on the Invite Link or manual distribution for now.

      let link = `${window.location.origin}/request/${requestId}`;
      if (accessMode === 'invite') {
           // Maybe include invite code if needed?
      }
      
      setInviteLink(finalPlaylistLink || link); // Prioritize playlist link if created
      setCreatedRequestId(requestId);
      setShowSuccess(true);
      
    } catch (err: any) {
      console.error("CreateRequest: Request creation failed.", err);
      error('Error creating request: ' + (err instanceof Error ? err.message : String(err)));
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
            <h2 className="text-2xl font-bold text-white mb-2">Request Created!</h2>
            <p className="text-gray-300 mb-6">Your file request is live. Share the link below to invite others.</p>
            
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
                    className="text-gray-400 hover:text-white px-4 py-2"
                >
                    Create Another
                </button>
                <Link 
                    to={`/request/${createdRequestId}`}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold flex items-center gap-2"
                >
                    View Request <ArrowRight className="w-4 h-4" />
                </Link>
            </div>
        </div>
      );
  }

  return (
    <div className="bg-gray-800 p-4 md:p-6 rounded-lg shadow-lg mb-8 border border-gray-700">
      <h3 className="text-xl font-bold text-white mb-4">Create New File Request</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-400 text-sm mb-1">Title</label>
          <input 
            type="text" 
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
            placeholder="e.g. Week 1: Lofi Beats"
            required
          />
        </div>
        
        <div>
          <label className="block text-gray-400 text-sm mb-1">Description</label>
          <textarea 
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none h-24"
            placeholder="Describe the assignment..."
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1 flex items-center gap-2">
                Deadline
                <Tooltip content="The cut-off time for new submissions. Comments and interactions will remain open after this time." icon />
            </label>
            <input 
              type="datetime-local" 
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1 flex items-center gap-2">
                Playlist Live Date (Optional)
                <Tooltip content="If set, the playlist/submissions will remain hidden from participants until this date. If blank, they are visible immediately (or after deadline depending on mode)." icon />
            </label>
            <input 
              type="datetime-local" 
              value={playlistLiveDate}
              onChange={e => setPlaylistLiveDate(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
            />
          </div>
          <div>
             <label className="block text-gray-400 text-sm mb-1 flex items-center gap-2">
                 Access Mode
                 <Tooltip content="Public: Invited users are automatically added (no acceptance needed). Private: Invited users must accept the invite. Volunteer Pool: Open to anyone to claim a limited seat." icon />
             </label>
             <select 
               value={accessMode}
               onChange={(e: any) => {
                   const newMode = e.target.value;
                   setAccessMode(newMode);
                   if (newMode === 'volunteer') {
                       setEmails([]);
                       setEmailInput('');
                       setPlaylistEmails([]);
                       setPlaylistEmailInput('');
                   }
               }}
               className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
             >
               <option value="direct">Public (Participants auto-accepted)</option>
               <option value="invite">Private (Invite Only)</option>
               <option value="volunteer">Volunteer Pool (Request Feedback)</option>
             </select>
             {accessMode === 'direct' && (
                <p className="text-yellow-500 text-xs mt-1">
                    Note: Participants will be added immediately and will see this request in their feed without needing to accept an invite.
                </p>
             )}
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1 flex items-center gap-2">
                Preview Tracks Limit
                <Tooltip content="Number of tracks visible to participants after they submit but before the deadline. Set to 0 to hide all." icon />
            </label>
            <input 
              type="number" 
              min="0"
              value={previewTrackCount}
              onChange={e => setPreviewTrackCount(parseInt(e.target.value) || 0)}
              className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Volunteer Mode Settings */}
        {accessMode === 'volunteer' && (
            <div className="bg-gray-900 border border-gray-600 rounded p-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    Volunteer Settings
                    <Tooltip content="Limit the number of people who can claim a spot. This encourages commitment and prevents overwhelming feedback." icon />
                </h4>
                
                <div className="flex items-center gap-4">
                    <label className="text-gray-400 text-sm">Open Seats:</label>
                    <input 
                        type="number" 
                        min={2} 
                        value={poolSeats} 
                        onChange={e => setPoolSeats(Math.max(2, parseInt(e.target.value) || 2))}
                        className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-center focus:border-blue-500 outline-none"
                    />
                    <span className="text-xs text-gray-500">Volunteers can view and comment immediately. First to accept get seats.</span>
                </div>

                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="allowSubmissions"
                        checked={allowSubmissions}
                        onChange={e => setAllowSubmissions(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="allowSubmissions" className="text-gray-400 text-sm cursor-pointer select-none flex items-center gap-2">
                        Allow volunteers to submit tracks
                        <Tooltip content="Uncheck this if you only want feedback on YOUR tracks. If checked, volunteers can upload their own work." icon />
                    </label>
                </div>
            </div>
        )}

        <div>
          <label className="block text-gray-400 text-sm mb-1">Artwork (Optional)</label>
          <input 
            type="file" 
            onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
            className="w-full text-gray-400 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            accept="image/*"
          />
        </div>

        {/* Participants Management (Hidden if Volunteer Pool is active) */}
        {(accessMode !== 'volunteer') && (
        <div className="border-t border-gray-700 pt-4 space-y-4">
          <label className="block text-gray-400 text-sm mb-1 font-semibold flex items-center gap-2">
              Manage Participants
              <Tooltip content="Build your invite list here. Users must be invited to see this request (unless Volunteer Mode is on)." icon />
          </label>
          
          {/* Option for separate playlist access */}
          <div className="flex items-center mb-4">
              <input 
                  type="checkbox" 
                  id="separatePlaylistAccess"
                  checked={separatePlaylistAccess}
                  onChange={e => setSeparatePlaylistAccess(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="separatePlaylistAccess" className="text-gray-400 text-sm ml-2 cursor-pointer select-none">
                  Use separate access list for playlist
              </label>
              <Tooltip content="If checked, the playlist will have its own separate invite list. Otherwise, it uses the request's participant list." icon />
          </div>

          {/* 1. Import from previous */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
                <label className="block text-gray-500 text-xs mb-1 flex items-center gap-2">
                    Import from Previous Request
                    <Tooltip content="Quickly copy the participant list from a past request." icon />
                </label>
                <select
                    value={selectedImportId}
                    onChange={(e) => handleImportSelect(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                >
                    <option value="">-- Select a previous request --</option>
                    {existingRequests.map(req => (
                        <option 
                            key={req.id} 
                            value={req.id}
                        >
                            {req.title} ({new Date(getTimestampAsNumber(req.createdAt)).toLocaleDateString()})
                        </option>
                    ))}
                </select>
            </div>
          </div>

          {/* 2. Email Invites */}
          <div>
            <label className="block text-gray-500 text-xs mb-1 flex items-center gap-2">
                Invite by Email (Comma or newline separated)
                <Tooltip content="Add external users. They will need the invite link (generated after creation) to join." icon />
            </label>
            <div className="flex flex-col gap-2">
              <textarea 
                value={emailInput}
                onChange={e => {
                    const val = e.target.value;
                    setEmailInput(val);
                    
                    // Auto-process on paste or delimiter
                    if (val.includes(',') || val.includes('\n')) {
                        const raw = val.split(/[\n,\s]+/);
                        const valid: string[] = [];
                        let remaining = '';

                        raw.forEach((s, i) => {
                            const trimmed = s.trim();
                            const endsWithDelimiter = val.trimEnd().match(/[`,]$/);
                            
                            // Check for internal spaces (invalid email)
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
                    // Process remaining on blur
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
              <p className="text-xs text-gray-500">Paste a list of emails here. Separate with commas or newlines.</p>
            </div>
          </div>

          {/* Selected Participants List */}
          {(emails.length > 0) && (
            <div className="bg-gray-900 p-3 rounded border border-gray-700">
               <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Selected Request Participants</label>
               <div className="flex flex-wrap gap-2">
                 {/* Email Invites */}
                 {emails.map(email => (
                   <span key={email} className="bg-blue-900 text-blue-200 text-xs px-2 py-1 rounded flex items-center gap-2 border border-blue-700">
                     {email}
                     <button type="button" onClick={() => removeEmail(email)} className="hover:text-white font-bold px-1">×</button>
                   </span>
                 ))}
               </div>
            </div>
          )}

          {/* Separate Playlist Participants */}
          {separatePlaylistAccess && (
            <div className="border-t border-gray-700 pt-4 space-y-4">
              <label className="block text-gray-400 text-sm mb-1 font-semibold flex items-center gap-2">
                  Manage Playlist Participants
                  <Tooltip content="Build the invite list specifically for the playlist. These users will only see the playlist content." icon />
              </label>
              <div>
                <label className="block text-gray-500 text-xs mb-1 flex items-center gap-2">
                    Invite by Email (Comma or newline separated)
                    <Tooltip content="Add external users to the playlist. They will need the invite link to join." icon />
                </label>
                <div className="flex flex-col gap-2">
                  <textarea 
                    value={playlistEmailInput}
                    onChange={e => {
                        const val = e.target.value;
                        setPlaylistEmailInput(val);
                        
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
                                } else if (trimmed.length > 5 && trimmed.includes('@') && !hasInternalSpace && !playlistEmails.includes(trimmed)) {
                                    valid.push(trimmed);
                                }
                            });
                            
                            if (valid.length > 0) {
                                setPlaylistEmails(prev => Array.from(new Set([...prev, ...valid])));
                                setPlaylistEmailInput(remaining); 
                            }
                        }
                    }}
                    onBlur={() => {
                        if (!playlistEmailInput.trim()) return;
                        const valid = playlistEmailInput
                            .split(/[\n,\s]+/)
                            .map(s => s.trim())
                            .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !playlistEmails.includes(s));
                        
                        if (valid.length > 0) {
                            setPlaylistEmails(prev => Array.from(new Set([...prev, ...valid])));
                            setPlaylistEmailInput(''); 
                        }
                    }}
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none h-20 text-sm"
                    placeholder="playlistfriend@example.com (Press Enter or Comma to add)"
                  />
                  <p className="text-xs text-gray-500">Paste a list of emails here. Separate with commas or newlines.</p>
                </div>
              </div>
              
              {(playlistEmails.length > 0) && (
                <div className="bg-gray-900 p-3 rounded border border-gray-700">
                   <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Selected Playlist Participants</label>
                   <div className="flex flex-wrap gap-2">
                     {playlistEmails.map(email => (
                       <span key={email} className="bg-yellow-900 text-yellow-200 text-xs px-2 py-1 rounded flex items-center gap-2 border border-yellow-700">
                         {email}
                         <button type="button" onClick={() => removePlaylistEmail(email)} className="hover:text-white font-bold px-1">×</button>
                       </span>
                     ))}
                   </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        <button 
          type="submit" 
          disabled={loading}
          className={`w-full py-2 rounded font-semibold transition ${loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
        >
          {loading ? 'Creating...' : 'Create Request'}
        </button>
      </form>
    </div>
  );
}

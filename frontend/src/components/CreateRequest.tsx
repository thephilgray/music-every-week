import React, { useState, useEffect } from 'react';
import { useGun } from '../contexts/GunContext';
import { APP_SCOPE } from '../config/appConfig';
import { useToast } from '../contexts/ToastContext';
import { uploadFile } from '../lib/upload';
import type { FileRequest, UserProfile, Notification } from '../types';
import { Check, Copy, ArrowRight, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CreateRequest() {
  const { gun, user, pubKey } = useGun();
  const { error } = useToast();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadline, setDeadline] = useState('');
  const [accessMode, setAccessMode] = useState<'direct' | 'invite' | 'volunteer'>('direct');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);

  // Volunteer Pool Logic
  const [poolSeats, setPoolSeats] = useState(3);
  const [allowSubmissions, setAllowSubmissions] = useState(true);

  // Import & Search Logic
  const [existingRequests, setExistingRequests] = useState<FileRequest[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string>('');
  const [importFilter, setImportFilter] = useState<'all' | 'accepted' | 'submitted'>('all'); // New Filter
  const [selectedParticipants, setSelectedParticipants] = useState<Record<string, { alias?: string, status: 'pending' | 'accepted' }>>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

  // Success State
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdRequestId, setCreatedRequestId] = useState<string>('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const searchUsers = (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    
    const results: UserProfile[] = [];
    gun.get('all_users').map().once((user: any, pub: string) => {
      if (user && user.alias && user.alias.toLowerCase().includes(term.toLowerCase())) {
        if (!selectedParticipants[pub]) {
             results.push({ ...user, pub });
             // Simple de-dupe could be done here if needed
             setSearchResults(prev => {
                const existing = new Set(prev.map(p => p.pub));
                if (!existing.has(pub)) return [...prev, { ...user, pub }];
                return prev;
             });
        }
      }
    });
  };

  const addParticipant = (user: UserProfile) => {
    setSelectedParticipants(prev => ({
      ...prev,
      [user.pub]: { alias: user.alias, status: 'pending' }
    }));
    setSearchTerm('');
    setSearchResults([]);
  };

  const removeParticipant = (pub: string) => {
     const newParts = { ...selectedParticipants };
     delete newParts[pub];
     setSelectedParticipants(newParts);
  };

  useEffect(() => {
    // Fetch existing requests for the import dropdown
    const requests: FileRequest[] = [];
    gun.get('file_requests').map().once((data: any, id: string) => {
      if (data && data.title) {
        // Filter: Only show my requests or public/direct requests
        if (data.ownerPub === pubKey || data.accessMode === 'direct') {
            requests.push({ ...data, id });
            setExistingRequests([...requests]); 
        }
      }
    });
  }, [gun, pubKey]);

  const handleImportSelect = async (requestId: string) => {
    setSelectedImportId(requestId);
    
    // Clear previous selection as requested
    setSelectedParticipants({}); 

    if (!requestId) return;
    
    console.log('Importing participants from:', requestId, 'Filter:', importFilter);

    // We need to track submissions if filtering by 'submitted'
    const submitters = new Set<string>();
    if (importFilter === 'submitted') {
         // This might be slow if there are many submissions, but necessary for filter
         await new Promise<void>(resolve => {
             let count = 0;
             let done = false;
             // Timeout safety
             setTimeout(() => { done = true; resolve(); }, 1000);
             
             gun.get('file_requests').get(requestId).get('submissions').map().once((sub: any) => {
                 if (done) return;
                 if (sub && sub.uploaderPub) submitters.add(sub.uploaderPub);
                 count++; 
                 // Gun doesn't tell us when map is done, so we rely on stream or timeout
             });
         });
    }

    // Subscribe to the participant list
    gun.get('request_participants').get(requestId).map().once(async (data: any, pub: string) => {
        if (!data || !pub) return;
        if (pub === pubKey) return; // Skip self

        // Filter Logic
        if (importFilter === 'accepted' && data.status !== 'accepted') return;
        
        if (importFilter === 'submitted') {
            const hasPass = data.hasPass === true;
            const hasSubmitted = submitters.has(pub);
            if (!hasPass && !hasSubmitted) return;
        }
        
        console.log("Importing participant:", pub, data);

        let alias = data.alias;
        
        // If alias is missing or 'Unknown', try to fetch from directory
        if (!alias || alias === 'Unknown') {
            await new Promise<void>(resolve => {
                gun.get('all_users').get(pub).once((u: any) => {
                    if (u && u.alias) alias = u.alias;
                    resolve();
                });
            });
        }

        // Add to selection
        setSelectedParticipants(prev => ({
            ...prev,
            [pub]: {
                status: 'pending', 
                alias: alias || 'Unknown' 
            }
        }));
    });
  };

  // Re-run import if filter changes and an ID is selected
  useEffect(() => {
      if (selectedImportId) {
          handleImportSelect(selectedImportId);
      }
  }, [importFilter]);


  const removeEmail = (email: string) => {
    setEmails(emails.filter(e => e !== email));
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
      setEmails([]);
      setSelectedParticipants({});
      setSelectedImportId('');
      setShowSuccess(false);
      setCreatedRequestId('');
      setInviteLink('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubKey) return;
    setLoading(true);

    try {
      // Process any lingering email input
      let finalEmails = [...emails];
      if (emailInput.trim()) {
          const lingering = emailInput
              .split(/[\n, ]+/)
              .map(s => s.trim())
              .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !emails.includes(s));
          if (lingering.length > 0) {
              finalEmails = Array.from(new Set([...finalEmails, ...lingering]));
              setEmails(finalEmails); // Update state for UI consistency (though we use var below)
              setEmailInput('');
          }
      }

      let artworkUrl = '';
      if (file) {
        console.log('Uploading file...');
        const result = await uploadFile(file, (user as any).is);
        console.log('Upload complete:', result);
        artworkUrl = result.url;
      }

      const requestId = crypto.randomUUID();
      
      // Merge imported participants
      const finalParticipants = { ...selectedParticipants };

      // Enforce status based on accessMode
      Object.keys(finalParticipants).forEach(pub => {
          finalParticipants[pub].status = accessMode === 'direct' ? 'accepted' : 'pending';
      });
      
      let inviteCode = '';
      if (finalEmails.length > 0) {
          inviteCode = crypto.randomUUID().substring(0, 8).toUpperCase();
          // Create a reusable invite code for this request
          gun.get('invites').get(inviteCode).put({
              from: pubKey,
              createdAt: Date.now(),
              status: 'active',
              forRequest: requestId
          }, (ack: any) => {
              if (ack.err) console.error("Invite write error:", ack.err);
              else console.log("Invite write ack:", ack);
          });
          console.log('Created Invite Code for Request:', inviteCode);
      }

      const request: any = {
        id: requestId, 
        title,
        description: desc,
        deadline,
        accessMode,
        artworkUrl: artworkUrl || null,
        ownerPub: pubKey,
        createdAt: Date.now(),
        pending_emails: JSON.stringify(finalEmails),
        inviteCode: inviteCode || null, // Store on request for reference
        poolSeats: accessMode === 'volunteer' ? poolSeats : null,
        allowParticipantSubmissions: accessMode === 'volunteer' ? allowSubmissions : true,
        // participants: finalParticipants -- Managed as separate graph node
      };

      console.log('Saving to GunDB...', request);
      
      // 1. Save to User Graph (Source of Truth - Secure Metadata)
      const userReqNode = user.get(APP_SCOPE).get('requests').get(requestId);
      userReqNode.put(request);
      
      // 2. Link Global Graph to User Graph (for discovery)
      gun.get('file_requests').get(requestId).put(userReqNode);
      
      // 3. Link to user's my_requests for local listing
      user.get(APP_SCOPE).get('my_requests').get(requestId).put(userReqNode);

      // 4. Write Initial Participants to OPEN Graph Node
      // We use a separate root node 'request_participants' to allow public writes
      const participantsNode = gun.get('request_participants').get(requestId);
      Object.entries(finalParticipants).forEach(([pPub, pData]) => {
          participantsNode.get(pPub).put(pData);
      });

      // 5. Handle Volunteer Pool Invites (Async)
      if (accessMode === 'volunteer') {
          console.log("Scanning for volunteers...");
          gun.get('all_users').map().once((u: any, uPub: string) => {
              if (u && u.isVolunteer && uPub !== pubKey && !finalParticipants[uPub]) {
                  // Add as Invited
                  participantsNode.get(uPub).put({
                      alias: u.alias,
                      status: 'invited',
                      invitedAt: Date.now()
                  });
                  
                  // Notify
                  const notifId = crypto.randomUUID();
                  const notification: Notification = {
                      id: notifId,
                      type: 'invite', // Reuse invite type, or make 'pool_invite'
                      message: `Volunteer Opportunity: "${title}" needs feedback!`,
                      link: `/request/${requestId}`,
                      fromPub: pubKey as string,
                      createdAt: Date.now(),
                      read: false,
                      requestId: requestId
                  };
                  gun.get('inboxes').get(uPub).get(notifId).put(notification);
              }
          });
      }

      // Send Notifications to Participants
      Object.keys(finalParticipants).forEach(partPub => {
        if (partPub === pubKey) return; // Don't notify self
        
        const notifId = crypto.randomUUID();
        const message = accessMode === 'direct' 
            ? `You were added to "${title}"`
            : `You've been invited to contribute to "${title}"`;

        const notification: Notification = {
            id: notifId,
            type: 'invite',
            message,
            link: `/request/${requestId}`,
            fromPub: pubKey as string,
            createdAt: Date.now(),
            read: false,
            requestId: requestId
        };
        
        gun.get('inboxes').get(partPub).get(notifId).put(notification);
      });

      // Prepare Success View
      let link = `${window.location.origin}/request/${requestId}`;
      if (inviteCode) {
          link += `?requestInvite=${inviteCode}`;
      }
      
      setInviteLink(link);
      setCreatedRequestId(requestId);
      setShowSuccess(true);
      
    } catch (err) {
      console.error(err);
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
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8 border border-gray-700">
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
            <label className="block text-gray-400 text-sm mb-1">Deadline</label>
            <input 
              type="datetime-local" 
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
              required
            />
          </div>
          <div>
             <label className="block text-gray-400 text-sm mb-1">Access Mode</label>
             <select 
               value={accessMode}
               onChange={(e: any) => {
                   const newMode = e.target.value;
                   setAccessMode(newMode);
                   if (newMode === 'volunteer') {
                       setSelectedParticipants({});
                       setEmails([]);
                       setEmailInput('');
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
        </div>

        {/* Volunteer Mode Settings */}
        {accessMode === 'volunteer' && (
            <div className="bg-gray-900 border border-gray-600 rounded p-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-300">Volunteer Settings</h4>
                
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
                    <label htmlFor="allowSubmissions" className="text-gray-400 text-sm cursor-pointer select-none">
                        Allow volunteers to submit tracks (Uncheck for Feedback-Only request)
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
          <label className="block text-gray-400 text-sm mb-1 font-semibold">Manage Participants</label>
          
          {/* 1. Import from previous */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
                <label className="block text-gray-500 text-xs mb-1">Import from Previous Request</label>
                <select
                    value={selectedImportId}
                    onChange={(e) => handleImportSelect(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                >
                    <option value="">-- Select a previous request --</option>
                    {existingRequests.map(req => (
                        <option key={req.id} value={req.id}>{req.title} ({new Date(req.createdAt).toLocaleDateString()})</option>
                    ))}
                </select>
            </div>
            <div className="w-1/3">
                <label className="block text-gray-500 text-xs mb-1">Filter</label>
                <div className="relative">
                    <Filter className="w-4 h-4 absolute left-2 top-2.5 text-gray-500" />
                    <select
                        value={importFilter}
                        onChange={(e: any) => setImportFilter(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 pl-8 text-white focus:border-blue-500 outline-none"
                    >
                        <option value="all">All Invited</option>
                        <option value="accepted">Accepted Only</option>
                        <option value="submitted">Submitted / Pass</option>
                    </select>
                </div>
            </div>
          </div>

          {/* 2. Search Directory */}
          <div className="relative">
             <label className="block text-gray-500 text-xs mb-1">Search Directory</label>
             <input
               type="text"
               value={searchTerm}
               onChange={(e) => searchUsers(e.target.value)}
               className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
               placeholder="Search user by alias..."
             />
             {searchResults.length > 0 && (
               <div className="absolute z-10 w-full bg-gray-800 border border-gray-600 rounded mt-1 max-h-40 overflow-y-auto shadow-xl">
                 {searchResults.map(user => (
                   <div 
                     key={user.pub}
                     onClick={() => addParticipant(user)}
                     className="p-2 hover:bg-gray-700 cursor-pointer text-white text-sm flex justify-between items-center"
                   >
                     <span>{user.alias}</span>
                     <span className="text-xs text-gray-400">Add</span>
                   </div>
                 ))}
               </div>
             )}
          </div>

          {/* 3. Email Invites */}
          <div>
            <label className="block text-gray-500 text-xs mb-1">Invite by Email (Comma or newline separated)</label>
            <div className="flex flex-col gap-2">
              <textarea 
                value={emailInput}
                onChange={e => {
                    const val = e.target.value;
                    setEmailInput(val);
                    
                    // Auto-process on paste or delimiter
                    if (val.includes(',') || val.includes('\n')) {
                        const raw = val.split(/[\n,]+/);
                        const valid: string[] = [];
                        let remaining = '';

                        raw.forEach((s, i) => {
                            const trimmed = s.trim();
                            const endsWithDelimiter = val.trimEnd().match(/[\n,]$/);
                            
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
                        .split(/[\n, ]+/)
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
          {(Object.keys(selectedParticipants).length > 0 || emails.length > 0) && (
            <div className="bg-gray-900 p-3 rounded border border-gray-700">
               <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Selected Participants</label>
               <div className="flex flex-wrap gap-2">
                 {/* Directory Users */}
                 {Object.entries(selectedParticipants).map(([pub, user]) => (
                    <span key={pub} className="bg-indigo-900 text-indigo-200 text-xs px-2 py-1 rounded flex items-center gap-2 border border-indigo-700">
                      <span title={pub}>{user.alias || 'Unknown'}</span>
                      <button type="button" onClick={() => removeParticipant(pub)} className="hover:text-white font-bold px-1">×</button>
                    </span>
                 ))}
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

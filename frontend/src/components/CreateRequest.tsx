import React, { useState, useEffect } from 'react';
import { useGun } from '../contexts/GunContext';
import { useToast } from '../contexts/ToastContext';
import { uploadFile } from '../lib/upload';
import type { FileRequest, UserProfile, Notification } from '../types';
import { Check, Copy, ArrowRight, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tooltip } from './ui/Tooltip';

// Define a timeout for GunDB acknowledgments (e.g., 30 seconds)
const GUN_ACK_TIMEOUT = 30000;

export function CreateRequest() {
  const { gun, user, pubKey, userPair } = useGun();
  const { error } = useToast();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadline, setDeadline] = useState('');
  const [playlistLiveDate, setPlaylistLiveDate] = useState('');
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
    if (loading) return;
    console.log("CreateRequest: handleSubmit initiated.");
    console.time("CreateRequest_handleSubmit_total");

    if (!pubKey) {
      console.log("CreateRequest: Validation failed - pubKey is missing.");
      error("Authentication required to create a request.");
      setLoading(false); // Ensure loading is turned off
      console.timeEnd("CreateRequest_handleSubmit_total");
      return;
    }
    setLoading(true);
    console.log("CreateRequest: Request creation process started, setLoading(true).");

    try {
      // Process any lingering email input
      let finalEmails = [...emails];
      if (emailInput.trim()) {
          console.log("CreateRequest: Processing lingering email input.");
          const lingering = emailInput
              .split(/[\n, ]+/)
              .map(s => s.trim())
              .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !emails.includes(s));
          if (lingering.length > 0) {
              finalEmails = Array.from(new Set([...finalEmails, ...lingering]));
              setEmails(finalEmails); // Update state for UI consistency (though we use var below)
              setEmailInput('');
              console.log("CreateRequest: Lingering emails processed:", lingering);
          }
      }

      let artworkUrl = '';
      if (file) {
        console.log('CreateRequest: Artwork file detected. Starting upload.');
        console.time("CreateRequest_uploadArtwork");
        
        if (!userPair || !userPair.pub || !userPair.priv) { 
            error("Authentication error: Please log in again to upload artwork.");
            console.error("CreateRequest: Upload failed: User pair (with private key) is not available.");
            setLoading(false);
            console.timeEnd("CreateRequest_handleSubmit_total");
            return;
        }
        const result = await uploadFile(file, userPair);
        artworkUrl = result.url;
        console.timeEnd("CreateRequest_uploadArtwork");
        console.log(`CreateRequest: Artwork uploaded. URL: ${artworkUrl}`);
      } else {
        console.log("CreateRequest: No new artwork file to upload, using null.");
      }

      const requestId = crypto.randomUUID();
      console.log(`CreateRequest: Generated Request ID: ${requestId}`);
      
      const finalParticipants = { ...selectedParticipants };
      Object.keys(finalParticipants).forEach(pub => {
          finalParticipants[pub].status = accessMode === 'direct' ? 'accepted' : 'pending';
      });
      console.log("CreateRequest: Final participants after status enforcement:", finalParticipants);
      
      // Helper function to create a GunDB put promise with a timeout
      const createGunPutPromise = (node: any, data: any, logMessage: string) => {
        let timer: ReturnType<typeof setTimeout>;
        return Promise.race([
            new Promise<void>((resolve, reject) => {
                node.put(data, (ack: any) => {
                    clearTimeout(timer);
                    if (ack.err) {
                        console.error(`CreateRequest: ${logMessage} FAILED:`, ack.err, 'Full ACK:', ack);
                        return reject(new Error(`${logMessage} failed: ${ack.err}`));
                    }
                    console.log(`CreateRequest: ${logMessage} SUCCESS. ACK:`, ack);
                    resolve();
                });
            }),
            new Promise<void>((_, reject) => {
                timer = setTimeout(() => {
                    console.warn(`CreateRequest: ${logMessage} TIMEOUT after ${GUN_ACK_TIMEOUT / 1000}s. No ACK received.`);
                    reject(new Error(`${logMessage} timed out.`));
                }, GUN_ACK_TIMEOUT);
            })
        ]);
      };

      // Always generate an invite code to enable "magic link" sharing for onboarding
      console.log("CreateRequest: Generating invite code.");
      const inviteCode = crypto.randomUUID().substring(0, 8).toUpperCase();
      
      await createGunPutPromise(
          gun.get('invites').get(inviteCode),
          {
              from: pubKey,
              createdAt: Date.now(),
              status: 'active',
              forRequest: requestId
          },
          "Invite code write"
      );
      console.log('CreateRequest: Created Invite Code for Request:', inviteCode);

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
        inviteCode: inviteCode || null,
        poolSeats: accessMode === 'volunteer' ? poolSeats : null,
        allowParticipantSubmissions: accessMode === 'volunteer' ? allowSubmissions : true,
      };
      
      // Convert Deadline to UTC ISO String for storage if present
      // The input[type="datetime-local"] gives us a local time string (e.g. "2023-10-27T17:00")
      // We convert this to a simplified ISO string (UTC) to ensure it's timezone aware across clients.
      if (request.deadline) {
          request.deadline = new Date(request.deadline).toISOString();
      }
      
      if (playlistLiveDate) {
          request.playlistLiveDate = new Date(playlistLiveDate).toISOString();
      }

      console.log('CreateRequest: Constructed request object:', request);
      console.log('CreateRequest: Starting GunDB save operations for request metadata.');
      console.time("CreateRequest_metadataSave");
      
      const metadataSavePromises: Promise<any>[] = [];

      metadataSavePromises.push(createGunPutPromise(
        user.get('requests').get(requestId), 
        request, 
        'Saved to user graph (requests)'
      ));
      metadataSavePromises.push(createGunPutPromise(
        gun.get('file_requests').get(requestId), 
        user.get('requests').get(requestId), 
        'Linked to global file_requests'
      ));

      await Promise.all(metadataSavePromises);
      console.timeEnd("CreateRequest_metadataSave");
      console.log("CreateRequest: All metadata save operations resolved.");

      console.log("CreateRequest: Starting participant graph node updates.");
      console.time("CreateRequest_participantsSave");
      
      const participantsNode = gun.get('request_participants').get(requestId);
      const participantPromises: Promise<any>[] = [];
      Object.entries(finalParticipants).forEach(([pPub, pData]) => {
          participantPromises.push(createGunPutPromise(
            participantsNode.get(pPub), 
            pData, 
            `Writing participant ${pPub} to participantsNode`
          ));
      });
      await Promise.all(participantPromises);
      console.timeEnd("CreateRequest_participantsSave");
      console.log("CreateRequest: All initial participant writes resolved.");

      if (accessMode === 'volunteer') {
          console.log("CreateRequest: Scanning for volunteers for volunteer pool (async).");
          console.time("CreateRequest_volunteerScan");
          gun.get('all_users').map().once((u: any, uPub: string) => {
              if (u && u.isVolunteer && uPub !== pubKey && !finalParticipants[uPub]) {
                  console.log(`CreateRequest: Found volunteer ${uPub}. Inviting.`);
                  
                  // Add as Invited (Fire and Forget / Non-blocking)
                  createGunPutPromise(
                    participantsNode.get(uPub), 
                    {
                        alias: u.alias,
                        status: 'invited',
                        invitedAt: Date.now()
                    }, 
                    `Writing volunteer ${uPub} to participantsNode`
                  ).catch(e => console.error(e));
                  
                  // Notify (Fire and Forget / Non-blocking)
                  const notifId = crypto.randomUUID();
                  const notification: Notification = {
                      id: notifId,
                      type: 'invite',
                      message: `Volunteer Opportunity: "${title}" needs feedback!`, 
                      link: `/request/${requestId}`,
                      fromPub: pubKey as string,
                      createdAt: Date.now(),
                      read: false,
                      requestId: requestId
                  };
                  createGunPutPromise(
                    gun.get('inboxes').get(uPub).get(notifId), 
                    notification, 
                    `Sending volunteer notification to ${uPub}`
                  ).catch(e => console.error(e));
              }
          });
          console.timeEnd("CreateRequest_volunteerScan");
          console.log("CreateRequest: Volunteer scan initiated (async, non-blocking).");
      }

      console.log("CreateRequest: Starting notifications to explicitly invited participants.");
      console.time("CreateRequest_participantNotifications");
      const participantNotificationPromises: Promise<any>[] = [];
      Object.keys(finalParticipants).forEach(partPub => {
        if (partPub === pubKey) return;
        
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
        
        participantNotificationPromises.push(createGunPutPromise(
            gun.get('inboxes').get(partPub).get(notifId), 
            notification, 
            `Sending notification to participant ${partPub}`
        ));
      });
      await Promise.all(participantNotificationPromises);
      console.timeEnd("CreateRequest_participantNotifications");
      console.log("CreateRequest: All explicit participant notifications resolved.");

      let link = `${window.location.origin}/request/${requestId}`;
      if (inviteCode) {
          link += `?requestInvite=${inviteCode}`;
      }
      
      setInviteLink(link);
      setCreatedRequestId(requestId);
      setShowSuccess(true);
      console.log("CreateRequest: Success view prepared.");
      
    } catch (err: any) {
      console.error("CreateRequest: Request creation failed in catch block.", err);
      error('Error creating request: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
      console.log("CreateRequest: finally block executed. setLoading(false).");
      console.timeEnd("CreateRequest_handleSubmit_total");
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
                        <option key={req.id} value={req.id}>{req.title} ({new Date(req.createdAt).toLocaleDateString()})</option>
                    ))}
                </select>
            </div>
            <div className="w-1/3">
                <label className="block text-gray-500 text-xs mb-1 flex items-center gap-2">
                    Filter
                    <Tooltip content="Choose which users to copy: All invited, only those who accepted, or only those who submitted tracks." icon />
                </label>
                <div className="relative">
                    <Filter className="w-4 h-4 absolute left-2 top-2.5 text-gray-500" />
                    <select
                        value={importFilter}
                        onChange={(e: any) => setImportFilter(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 pl-8 text-white focus:border-blue-500 outline-none"
                    >
                        <option value="all">All Invited</option>
                        <option value="accepted">Accepted Only</option>
                        <option value="submitted">Submitted</option>
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
                        const raw = val.split(/[\n, ]+/);
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
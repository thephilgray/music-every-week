import React, { useState, useEffect } from 'react';
import { useGun } from '../contexts/GunContext';
import { uploadFile } from '../lib/upload';
import type { FileRequest, UserProfile, Notification } from '../types';
import { Check, Copy, ArrowRight, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CreateRequest() {
  const { gun, user, pubKey } = useGun();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadline, setDeadline] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);

  // Import & Search Logic
  const [existingRequests, setExistingRequests] = useState<FileRequest[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string>('');
  const [importFilter, setImportFilter] = useState<'all' | 'accepted'>('all'); // New Filter
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
        requests.push({ ...data, id });
        // Simple distinct/sort could be added here, but for now just pushing
        setExistingRequests([...requests]); // Update state (triggers re-render)
      }
    });
  }, [gun]);

  const handleImportSelect = async (requestId: string) => {
    setSelectedImportId(requestId);
    
    // Clear previous selection as requested
    setSelectedParticipants({}); 

    if (!requestId) return;
    
    console.log('Importing participants from:', requestId, 'Filter:', importFilter);

    // Fetch submissions or participants depending on filter
    // Strategy: 
    // If 'all': Get all participants from the previous request object (if available) OR scan submissions.
    // Ideally we look at the 'participants' field of the previous request.
    
    // Let's try to get the request object first to see its participants list
    gun.get('file_requests').get(requestId).once((reqData: any) => {
        if (reqData && reqData.participants) {
            let parts: Record<string, any> = {};
            if (typeof reqData.participants === 'string') {
                try { parts = JSON.parse(reqData.participants); } catch (e) {}
            } else {
                parts = reqData.participants;
            }

            const newParticipants: Record<string, { alias?: string, status: 'pending' | 'accepted' }> = {};
            
            Object.entries(parts).forEach(([pub, data]: [string, any]) => {
                if (pub === pubKey) return; // Skip self

                // Filter Logic
                // If filter is 'accepted', we only want those who accepted (status === 'accepted') 
                // OR those who actually submitted (which implies acceptance usually, but let's check submissions too)
                if (importFilter === 'accepted' && data.status !== 'accepted') {
                     return;
                }
                
                newParticipants[pub] = {
                    status: 'pending', // Reset to pending for the NEW request
                    alias: data.alias
                };
            });
            
            setSelectedParticipants(prev => ({...prev, ...newParticipants}));
        } else {
            // Fallback to scanning submissions if participants list is empty/old format
             const newParticipants: Record<string, { alias?: string, status: 'pending' | 'accepted' }> = {};
             gun.get('submissions').map().once(async (sub: any) => {
                if (sub && sub.requestId === requestId && sub.uploaderPub) {
                    // Everyone who submitted is definitely "Active/Accepted"
                    if (sub.uploaderPub === pubKey) return;

                    // Try to get alias
                    let alias = 'Unknown';
                    // Async fetch alias
                    gun.get('all_users').get(sub.uploaderPub).once((u: any) => {
                        if (u && u.alias) alias = u.alias;
                        newParticipants[sub.uploaderPub] = {
                            status: 'pending', 
                            alias: alias
                        };
                        setSelectedParticipants(prev => ({...prev, ...newParticipants}));
                    });
                }
            });
        }
    });
  };

  // Re-run import if filter changes and an ID is selected
  useEffect(() => {
      if (selectedImportId) {
          handleImportSelect(selectedImportId);
      }
  }, [importFilter]);


  const addEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    if (emailInput && !emails.includes(emailInput)) {
      setEmails([...emails, emailInput]);
      setEmailInput('');
    }
  };

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

      // Enforce status based on visibility
      Object.keys(finalParticipants).forEach(pub => {
          finalParticipants[pub].status = visibility === 'public' ? 'accepted' : 'pending';
      });

      const request: any = {
        id: requestId, 
        title,
        description: desc,
        deadline,
        visibility,
        artworkUrl,
        ownerPub: pubKey,
        createdAt: Date.now(),
        pending_emails: JSON.stringify(emails),
        participants: finalParticipants 
      };

      console.log('Saving to GunDB...', request);
      
      // 1. Save to User Graph (Source of Truth - Secure)
      const userReqNode = user.get('requests').get(requestId);
      userReqNode.put(request);
      
      // 2. Link Global Graph to User Graph
      gun.get('file_requests').get(requestId).put(userReqNode);
      
      // 3. Link to user's my_requests for local listing
      user.get('my_requests').get(requestId).put(userReqNode);

      // Send Notifications to Participants
      Object.keys(finalParticipants).forEach(partPub => {
        if (partPub === pubKey) return; // Don't notify self
        
        const notifId = crypto.randomUUID();
        const message = visibility === 'public' 
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
      const link = `${window.location.origin}/request/${requestId}`;
      setInviteLink(link);
      setCreatedRequestId(requestId);
      setShowSuccess(true);
      
    } catch (err) {
      console.error(err);
      alert('Error creating request: ' + (err instanceof Error ? err.message : String(err)));
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

        <div className="grid grid-cols-2 gap-4">
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
             <label className="block text-gray-400 text-sm mb-1">Visibility</label>
             <select 
               value={visibility}
               onChange={(e: any) => setVisibility(e.target.value)}
               className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
             >
               <option value="public">Public</option>
               <option value="private">Private</option>
             </select>
             {visibility === 'public' && (
                <p className="text-yellow-500 text-xs mt-1">
                    Warning: Public requests are visible to everyone on the platform. Use sparingly.
                </p>
             )}
          </div>
        </div>

        <div>
          <label className="block text-gray-400 text-sm mb-1">Artwork (Optional)</label>
          <input 
            type="file" 
            onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
            className="w-full text-gray-400 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            accept="image/*"
          />
        </div>

        {/* Participants Management */}
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
            <label className="block text-gray-500 text-xs mb-1">Invite by Email</label>
            <div className="flex gap-2">
              <input 
                type="email" 
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                placeholder="friend@example.com"
              />
              <button 
                onClick={addEmail}
                className="bg-gray-700 hover:bg-gray-600 px-4 rounded text-white font-semibold"
              >
                Add
              </button>
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

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2, Trash2, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGun } from '../contexts/GunContext';
import { useToast } from '../contexts/ToastContext';
import { uploadFile } from '../lib/upload';
import type { FileRequest, UserProfile, Notification } from '../types';
import { ConfirmModal } from './ui/ConfirmModal';

interface EditRequestProps {
  request: FileRequest;
  onClose: () => void;
  onUpdate: () => void;
}

export function EditRequest({ request, onClose, onUpdate }: EditRequestProps) {
  const { gun, user, pubKey } = useGun();
  const { success, error } = useToast();
  const navigate = useNavigate();
  
  const [title, setTitle] = useState(request.title);
  const [desc, setDesc] = useState(request.description);
  const [deadline, setDeadline] = useState(request.deadline || '');
  const [accessMode, setAccessMode] = useState<'direct' | 'invite' | 'volunteer'>(request.accessMode || 'direct');
  const [file, setFile] = useState<File | null>(null);
  const [currentArtworkUrl] = useState(request.artworkUrl || ''); // Removed unused setter
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Volunteer Settings
  const [poolSeats, setPoolSeats] = useState(request.poolSeats || 3);
  const [allowSubmissions, setAllowSubmissions] = useState(request.allowParticipantSubmissions !== undefined ? request.allowParticipantSubmissions : true);

  // Import Logic
  const [existingRequests, setExistingRequests] = useState<FileRequest[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string>('');
  const [importFilter, setImportFilter] = useState<'all' | 'accepted' | 'submitted'>('all');

  // Participant Management Logic
  const [selectedParticipants, setSelectedParticipants] = useState<Record<string, any>>(request.participants || {});
  const [emailInput, setEmailInput] = useState('');
  const [pendingEmails, setPendingEmails] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

  // Scroll Lock
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  // Fetch Existing Requests for Import
  useEffect(() => {
    if (!user || !pubKey) return;
    const list: FileRequest[] = [];
    user.get('my_requests').map().once((data: any, id: string) => {
        if (data && data.title && id !== request.id) {
            list.push({ ...data, id });
            setExistingRequests([...list].sort((a, b) => b.createdAt - a.createdAt));
        }
    });
  }, [user, pubKey, request.id]);

  const handleImportSelect = async (importId: string) => {
    setSelectedImportId(importId);
    if (!importId) return;
    
    // We append to existing participants instead of replacing
    const submitters = new Set<string>();
    if (importFilter === 'submitted') {
         await new Promise<void>(resolve => {
             let done = false;
             setTimeout(() => { done = true; resolve(); }, 1000);
             gun.get('file_requests').get(importId).get('submissions').map().once((sub: any) => {
                 if (done) return;
                 if (sub && sub.uploaderPub) submitters.add(sub.uploaderPub);
             });
         });
    }

    gun.get('request_participants').get(importId).map().once(async (data: any, pub: string) => {
        if (!data || !pub) return;
        if (pub === pubKey) return;
        if (selectedParticipants[pub]) return; // Skip if already in list

        if (importFilter === 'accepted' && data.status !== 'accepted') return;
        if (importFilter === 'submitted') {
            const hasPass = data.hasPass === true;
            const hasSubmitted = submitters.has(pub);
            if (!hasPass && !hasSubmitted) return;
        }

        let alias = data.alias;
        if (!alias || alias === 'Unknown') {
            await new Promise<void>(resolve => {
                gun.get('all_users').get(pub).once((u: any) => {
                    if (u && u.alias) alias = u.alias;
                    resolve();
                });
            });
        }

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

  // Sync participants if data arrives after mount
  useEffect(() => {
      const currentIsRefOrEmpty = !selectedParticipants || Object.keys(selectedParticipants).length === 0 || ('#' in selectedParticipants);
      const newHasData = request.participants && Object.keys(request.participants).length > 0 && !('#' in request.participants);
      
      if (currentIsRefOrEmpty && newHasData) {
          setSelectedParticipants(request.participants || {});
      }
  }, [request.participants]);

  // Load pending emails
  useEffect(() => {
      if (request.pending_emails) {
          try {
              const emails = typeof request.pending_emails === 'string' 
                  ? JSON.parse(request.pending_emails) 
                  : request.pending_emails;
              if (Array.isArray(emails)) {
                  setPendingEmails(emails);
              }
          } catch (e) {
              // ignore
          }
      }
      
      // Fetch aliases
      Object.keys(selectedParticipants).forEach(pub => {
          if (!selectedParticipants[pub].alias) {
              gun.get('all_users').get(pub).once((u: any) => {
                  if (u && u.alias) {
                      setSelectedParticipants(prev => {
                          if (prev[pub]) return { ...prev, [pub]: { ...prev[pub], alias: u.alias } };
                          return prev;
                      });
                  }
              });
          }
      });
  }, []);

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
      [user.pub]: { alias: user.alias, status: accessMode === 'direct' ? 'accepted' : 'pending' }
    }));
    setSearchTerm('');
    setSearchResults([]);
  };

  const removeParticipant = (pub: string) => {
     const newParts = { ...selectedParticipants };
     delete newParts[pub];
     setSelectedParticipants(newParts);
  };

  const addEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    if (emailInput && !pendingEmails.includes(emailInput)) {
      setPendingEmails([...pendingEmails, emailInput]);
      setEmailInput('');
    }
  };

  const removeEmail = (email: string) => {
    setPendingEmails(pendingEmails.filter(e => e !== email));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.id) return;
    setLoading(true);

    try {
      let artworkUrl = currentArtworkUrl;
      if (file) {
        const res = await uploadFile(file, (user as any).is);
        artworkUrl = res.url;
      }

      const updates: any = {
        title,
        description: desc,
        deadline,
        accessMode,
        artworkUrl,
        pending_emails: JSON.stringify(pendingEmails),
        poolSeats: accessMode === 'volunteer' ? poolSeats : null,
        allowParticipantSubmissions: accessMode === 'volunteer' ? allowSubmissions : true
      };

      // Update Metadata
      await user.get('requests').get(request.id!).put(updates);
      await gun.get('file_requests').get(request.id!).put(updates);
      await user.get('my_requests').get(request.id!).put(updates);

      // Handle Participants (Graph Mode)
      const oldParticipants = request.participants || {};
      const newParticipants = { ...selectedParticipants };
      
      // Mark removed users as null (deletion)
      Object.keys(oldParticipants).forEach(key => {
          if (!newParticipants[key]) {
              newParticipants[key] = null;
          }
      });
      
      // Save participants node
      const participantsNode = gun.get('request_participants').get(request.id!);
      Object.entries(newParticipants).forEach(([pub, data]) => {
          participantsNode.get(pub).put(data);
      });

      // Notify New Participants
      const existingKeys = Object.keys(oldParticipants);
      const addedParticipants = Object.keys(selectedParticipants).filter(pub => !existingKeys.includes(pub));
      
      addedParticipants.forEach((partPub: string) => {
          if (partPub === pubKey) return;
          
          const notifId = crypto.randomUUID();
          const message = accessMode === 'direct' 
              ? `You were added to "${title}"`
              : `You've been invited to contribute to "${title}"`;

          const notification: Notification = {
              id: notifId,
              type: 'invite',
              message,
              link: `/request/${request.id}`,
              fromPub: pubKey as string,
              createdAt: Date.now(),
              read: false,
              requestId: request.id!
          };
          gun.get('inboxes').get(partPub).get(notifId).put(notification);
      });

      success("Request updated!");
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
      error("Failed to update request.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = () => {
      setShowConfirmDelete(true);
  };

  const executeDelete = async () => {
      if (!request.id) return;
      setIsDeleting(true);
      setShowConfirmDelete(false);
      
      try {
          // Soft delete / nullify
          await user.get('requests').get(request.id!).put(null);
          await user.get('my_requests').get(request.id!).put(null);
          await gun.get('file_requests').get(request.id!).put(null);
          
          success("Request deleted.");
          onUpdate();
          onClose();
          navigate('/');
      } catch (err) {
          console.error(err);
          error("Failed to delete request.");
          setIsDeleting(false);
      }
  };

  return createPortal(
    <div className="fixed top-0 left-0 w-full h-[100dvh] z-[9999] flex items-center justify-center p-4 bg-gray-950 backdrop-blur-none overscroll-none touch-none">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto overscroll-contain touch-auto">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white">Edit Request</h2>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
            <div>
                <label className="block text-gray-400 text-sm mb-1">Title</label>
                <input 
                    type="text" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    required
                />
            </div>

            <div>
                <label className="block text-gray-400 text-sm mb-1">Description</label>
                <textarea 
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none h-32"
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
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm mb-1">Access Mode</label>
                    <select 
                        value={accessMode}
                        onChange={(e: any) => setAccessMode(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    >
                        <option value="direct">Public (Participants auto-accepted)</option>
                        <option value="invite">Private (Invite Only)</option>
                        <option value="volunteer">Volunteer Pool</option>
                    </select>
                </div>
            </div>

            {/* Volunteer Mode Settings */}
            {accessMode === 'volunteer' && (
                <div className="bg-gray-800 border border-gray-700 rounded p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-300">Volunteer Settings</h4>
                    
                    <div className="flex items-center gap-4">
                        <label className="text-gray-400 text-sm">Open Seats:</label>
                        <input 
                            type="number" 
                            min={2} 
                            value={poolSeats} 
                            onChange={e => setPoolSeats(Math.max(2, parseInt(e.target.value) || 2))}
                            className="w-20 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-center focus:border-blue-500 outline-none"
                        />
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
                            Allow volunteers to submit tracks
                        </label>
                    </div>
                </div>
            )}

            {/* Participants Management */}
            {accessMode !== 'volunteer' && (
            <div className="border-t border-gray-800 pt-4">
               <label className="block text-gray-400 text-sm mb-2 font-semibold flex items-center gap-2">
                 <UserPlus className="w-4 h-4" />
                 Manage Participants
               </label>
               
               {/* Import from previous */}
               <div className="flex gap-2 items-end mb-4">
                <div className="flex-1">
                    <label className="block text-gray-500 text-xs mb-1">Import from Previous</label>
                    <select
                        value={selectedImportId}
                        onChange={(e) => handleImportSelect(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                    >
                        <option value="">-- Select --</option>
                        {existingRequests.map(req => (
                            <option key={req.id} value={req.id}>{req.title}</option>
                        ))}
                    </select>
                </div>
                <div className="w-1/3">
                    <label className="block text-gray-500 text-xs mb-1">Filter</label>
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
               <div className="relative mb-3">
                 <input
                   type="text"
                   value={searchTerm}
                   onChange={(e) => searchUsers(e.target.value)}
                   className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                   placeholder="Add user from directory..."
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
               <div className="mb-3">
                 <label className="block text-gray-500 text-xs mb-1">Invite by Email</label>
                 <div className="flex gap-2 mb-2">
                   <input 
                     type="email" 
                     value={emailInput}
                     onChange={e => setEmailInput(e.target.value)}
                     className="flex-1 bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                     placeholder="friend@example.com"
                   />
                   <button 
                     onClick={addEmail}
                     className="bg-gray-700 hover:bg-gray-600 px-4 rounded text-white text-sm font-semibold"
                   >
                     Add
                   </button>
                 </div>
               </div>

               {/* Selected List */}
               {(Object.keys(selectedParticipants).length > 0 || pendingEmails.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                     {Object.entries(selectedParticipants).map(([pub, p]: [string, any]) => (
                        <span key={pub} className="bg-indigo-900/50 text-indigo-200 text-xs px-2 py-1 rounded flex items-center gap-2 border border-indigo-500/30">
                          <span title={pub}>{p.alias || 'User'}</span>
                          <button type="button" onClick={() => removeParticipant(pub)} className="hover:text-white font-bold px-1">×</button>
                        </span>
                     ))}
                     {pendingEmails.map(email => (
                       <span key={email} className="bg-blue-900/50 text-blue-200 text-xs px-2 py-1 rounded flex items-center gap-2 border border-blue-500/30">
                         {email}
                         <button type="button" onClick={() => removeEmail(email)} className="hover:text-white font-bold px-1">×</button>
                       </span>
                     ))}
                  </div>
               )}
            </div>
            )}

            <div>
                <label className="block text-gray-400 text-sm mb-1">Update Artwork (Optional)</label>
                <input 
                    type="file" 
                    onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full text-gray-400 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    accept="image/*"
                />
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-800 mt-4">
                <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="text-red-500 hover:text-red-400 text-sm flex items-center gap-1 transition"
                    disabled={loading || isDeleting}
                >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete Request
                </button>

                <div className="flex gap-3">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white transition"
                        disabled={loading || isDeleting}
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        disabled={loading || isDeleting}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </form>
        
        <ConfirmModal 
            isOpen={showConfirmDelete}
            title="Delete Request?"
            message="Are you sure you want to delete this request? This will hide it from all participants and cannot be undone."
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
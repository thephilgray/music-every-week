import React, { useState } from 'react';
import { useGun } from '../contexts/GunContext';
import { uploadFile } from '../lib/upload';
import type { FileRequest, UserProfile, Notification } from '../types';
import { X, Save, Trash2, Loader2, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface EditRequestProps {
  request: FileRequest;
  onClose: () => void;
  onUpdate: () => void;
}

export function EditRequest({ request, onClose, onUpdate }: EditRequestProps) {
  const { gun, pubKey, user } = useGun();
  const navigate = useNavigate();
  const [title, setTitle] = useState(request.title);
  const [desc, setDesc] = useState(request.description);
  const [deadline, setDeadline] = useState(request.deadline);
  const [visibility, setVisibility] = useState(request.visibility);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Participant Management Logic
  const [selectedParticipants, setSelectedParticipants] = useState<Record<string, any>>(request.participants || {});
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

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
      [user.pub]: { alias: user.alias, status: visibility === 'public' ? 'accepted' : 'pending' }
    }));
    setSearchTerm('');
    setSearchResults([]);
  };

  const removeParticipant = (pub: string) => {
     // Optional: If we want to allow removing participants. 
     // For now, let's allow it as it updates the state before saving.
     const newParts = { ...selectedParticipants };
     delete newParts[pub];
     setSelectedParticipants(newParts);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubKey || !request.id) return;
    setLoading(true);

    try {
      let artworkUrl = request.artworkUrl;
      if (file) {
        const result = await uploadFile(file, (user as any).is);
        artworkUrl = result.url;
      }

      // Enforce status based on visibility
      const finalParticipants = { ...selectedParticipants };
      if (visibility === 'public') {
          // Auto-accept everyone if public
          Object.keys(finalParticipants).forEach(pub => {
              if (finalParticipants[pub].status === 'pending') {
                  finalParticipants[pub].status = 'accepted';
              }
          });
      }

      const updates: Partial<FileRequest> = {
        title,
        description: desc,
        deadline,
        visibility,
        artworkUrl,
        participants: finalParticipants
      };

      await gun.get('file_requests').get(request.id).put(updates);

      // Notify New Participants
      const existingParticipants = request.participants || {};
      const newParticipants = Object.keys(finalParticipants).filter(pub => !existingParticipants[pub]);
      
      newParticipants.forEach(partPub => {
          if (partPub === pubKey) return;
          
          const notifId = crypto.randomUUID();
          const message = visibility === 'public' 
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
              requestId: request.id
          };
          gun.get('inboxes').get(partPub).get(notifId).put(notification);
      });

      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error updating request');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this request? This cannot be undone.')) return;
    if (!request.id) return;
    setIsDeleting(true);

    try {
        await gun.get('file_requests').get(request.id).put(null);
        navigate('/');
    } catch (err) {
        console.error(err);
        alert('Error deleting request');
        setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white">Edit Request</h2>
        </div>

        <form onSubmit={handleUpdate} className="p-6 space-y-4">
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
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none h-24"
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
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                        required
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm mb-1">Visibility</label>
                    <select 
                        value={visibility}
                        onChange={(e: any) => setVisibility(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    >
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                    </select>
                </div>
            </div>

            {/* Participants Management */}
            <div className="border-t border-gray-800 pt-4">
               <label className="block text-gray-400 text-sm mb-2 font-semibold flex items-center gap-2">
                 <UserPlus className="w-4 h-4" />
                 Manage Participants
               </label>
               
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

               {/* Selected List */}
               {Object.keys(selectedParticipants).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                     {Object.entries(selectedParticipants).map(([pub, p]: [string, any]) => (
                        <span key={pub} className="bg-indigo-900/50 text-indigo-200 text-xs px-2 py-1 rounded flex items-center gap-2 border border-indigo-500/30">
                          <span title={pub}>{p.alias || 'User'}</span>
                          <button type="button" onClick={() => removeParticipant(pub)} className="hover:text-white font-bold px-1">×</button>
                        </span>
                     ))}
                  </div>
               )}
            </div>

            <div>
                <label className="block text-gray-400 text-sm mb-1">Update Artwork (Optional)</label>
                <input 
                    type="file" 
                    onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full text-gray-400 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    accept="image/*"
                />
            </div>

            <div className="flex justify-between pt-4">
                <button 
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting || loading}
                    className="flex items-center gap-2 text-red-400 hover:text-red-300 px-4 py-2 rounded transition hover:bg-red-900/20"
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
      </div>
    </div>
  );
}

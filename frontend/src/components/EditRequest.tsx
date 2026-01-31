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
  const [currentArtworkUrl, setCurrentArtworkUrl] = useState(request.artworkUrl || '');
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Participant Management Logic
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
        artworkUrl
      };

      // Update User Graph
      user.get('requests').get(request.id).put(updates);
      
      // Update Global Graph
      gun.get('file_requests').get(request.id).put(updates);
      
      // Update Local My Requests
      user.get('my_requests').get(request.id).put(updates);

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

  const handleDelete = async () => {
      if (!confirm("Are you sure? This will delete the request and all associated data visible to you.")) return;
      setLoading(true);
      
      try {
          // Soft delete / nullify
          user.get('requests').get(request.id).put(null);
          user.get('my_requests').get(request.id).put(null);
          gun.get('file_requests').get(request.id).put(null);
          
          success("Request deleted.");
          onUpdate();
          onClose();
      } catch (err) {
          console.error(err);
          error("Failed to delete request.");
      } finally {
          setLoading(false);
      }
  };

  return createPortal(
    <div className="fixed top-0 left-0 w-full h-[100dvh] z-[9999] flex items-center justify-center p-4 bg-gray-950 backdrop-blur-none overscroll-none touch-none">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto overscroll-contain touch-auto">
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
            {/* Form Fields - Reused logic from CreateRequest basically */}
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

            <div className="grid grid-cols-2 gap-4">
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
                        <option value="direct">Direct Add (Public)</option>
                        <option value="invite">Invite Only</option>
                        <option value="volunteer">Volunteer Pool</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-gray-400 text-sm mb-1">Artwork</label>
                <input 
                    type="file" 
                    onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full text-gray-400 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600"
                    accept="image/*"
                />
                {currentArtworkUrl && !file && (
                    <p className="text-xs text-gray-500 mt-1">Current artwork loaded. Upload new to replace.</p>
                )}
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-800 mt-4">
                <button
                    type="button"
                    onClick={handleDelete}
                    className="text-red-500 hover:text-red-400 text-sm flex items-center gap-1 transition"
                    disabled={loading}
                >
                    <Trash2 className="w-4 h-4" /> Delete Request
                </button>

                <div className="flex gap-3">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white transition"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
import React, { useState } from 'react';
import { useGun } from '../contexts/GunContext';
import { uploadFile } from '../lib/upload';
import type { FileRequest } from '../types';
import { X, Save, Trash2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface EditRequestProps {
  request: FileRequest;
  onClose: () => void;
  onUpdate: () => void;
}

export function EditRequest({ request, onClose, onUpdate }: EditRequestProps) {
  const { gun, pubKey } = useGun();
  const navigate = useNavigate();
  const [title, setTitle] = useState(request.title);
  const [desc, setDesc] = useState(request.description);
  const [deadline, setDeadline] = useState(request.deadline);
  const [visibility, setVisibility] = useState(request.visibility);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubKey || !request.id) return;
    setLoading(true);

    try {
      let artworkUrl = request.artworkUrl;
      if (file) {
        const result = await uploadFile(file);
        artworkUrl = result.url;
      }

      // Preserve existing fields like participants/emails if we aren't editing them here
      // But we need to be careful not to overwrite them with stringified versions if they are already parsed objects in `request`.
      // The `request` prop coming in has parsed fields. Gun expects us to put updates.
      // We can just put the fields we changed. Gun merges updates.
      
      const updates: Partial<FileRequest> = {
        title,
        description: desc,
        deadline,
        visibility,
        artworkUrl,
      };

      await gun.get('file_requests').get(request.id).put(updates);

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
        // In Gun, "deleting" is often setting the node to null or removing it from a set.
        // For a named node like .get(id), we can put(null).
        await gun.get('file_requests').get(request.id).put(null);
        
        // Navigate away
        navigate('/');
    } catch (err) {
        console.error(err);
        alert('Error deleting request');
        setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative">
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
                        type="date" 
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

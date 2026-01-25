import React, { useState } from 'react';
import { useGun } from '../contexts/GunContext';
import { uploadFile } from '../lib/upload';
import type { FileRequest } from '../types';

export function CreateRequest() {
  const { gun, user, pubKey } = useGun();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadline, setDeadline] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubKey) return;
    setLoading(true);

    try {
      let artworkUrl = '';
      if (file) {
        console.log('Uploading file...');
        const result = await uploadFile(file);
        console.log('Upload complete:', result);
        artworkUrl = result.url;
      }

      const request: FileRequest = {
        title,
        description: desc,
        deadline,
        visibility,
        artworkUrl,
        ownerPub: pubKey,
        createdAt: Date.now(),
        pending_emails: emails,
        participants: {} // Initialize empty
      };

      console.log('Saving to GunDB...', request);
      
      // Save to global list
      gun.get('file_requests').set(request);
      
      // Also link to user (optional, for "My Requests")
      user.get('my_requests').set(request);

      alert('Request created successfully!');
      
      // Reset form
      setTitle('');
      setDesc('');
      setDeadline('');
      setFile(null);
      setEmails([]);
    } catch (err) {
      console.error(err);
      alert('Error creating request: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

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
              type="date" 
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

        {/* Invite Section */}
        <div className="border-t border-gray-700 pt-4">
          <label className="block text-gray-400 text-sm mb-1">Invite Participants (Email Staging)</label>
          <div className="flex gap-2 mb-2">
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
          {emails.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {emails.map(email => (
                <span key={email} className="bg-blue-900 text-blue-200 text-xs px-2 py-1 rounded flex items-center gap-2">
                  {email}
                  <button onClick={() => removeEmail(email)} className="hover:text-white font-bold">×</button>
                </span>
              ))}
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

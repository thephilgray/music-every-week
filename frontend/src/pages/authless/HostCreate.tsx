import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Loader2, Copy, Check, ArrowLeft, ImageIcon } from 'lucide-react';
import { uploadToR2 } from '../../lib/r2';

export function HostCreate() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [loading, setLoading] = useState(false);
  const [createdLinks, setCreatedLinks] = useState<{ request: string; playlist: string } | null>(null);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [existingArtworkUrl, setExistingArtworkUrl] = useState<string | null>(null);
  const [playlistId, setPlaylistId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    deadline: '',
    playlistLiveDate: '',
    separatePlaylistDate: false,
    requestEmails: '',
    playlistEmails: '',
    separatePlaylistAccess: false,
  });

  useEffect(() => {
    if (isEditMode && id) {
      const loadData = async () => {
        setLoading(true);
        try {
          const reqDoc = await getDoc(doc(db, 'requests', id));
          if (!reqDoc.exists()) {
            alert("Request not found");
            navigate('/host/dashboard');
            return;
          }
          const reqData = reqDoc.data();
          setPlaylistId(reqData.playlistId);
          setExistingArtworkUrl(reqData.artworkUrl || null);

          // Fetch linked playlist to check access list
          const plDoc = await getDoc(doc(db, 'playlists', reqData.playlistId));
          const plData = plDoc.exists() ? plDoc.data() : {};

          // Compare access lists to set separatePlaylistAccess
          const reqEmails = (reqData.accessList || []).join('\n');
          const plEmails = (plData.accessList || []).join('\n');
          const isSeparate = reqEmails !== plEmails;

          // Check for separate playlist date
          const isSeparateDate = reqData.playlistLiveDate !== reqData.deadline;

          setFormData({
            title: reqData.title,
            description: reqData.description,
            deadline: reqData.deadline,
            playlistLiveDate: reqData.playlistLiveDate || '',
            separatePlaylistDate: isSeparateDate,
            requestEmails: reqEmails,
            playlistEmails: isSeparate ? plEmails : '',
            separatePlaylistAccess: isSeparate,
          });

        } catch (err) {
          console.error("Error loading request:", err);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [isEditMode, id, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("Not authenticated");

      // Upload Artwork if exists, else keep existing
      let artworkUrl = existingArtworkUrl || '';
      if (artworkFile) {
          const { url } = await uploadToR2(artworkFile);
          artworkUrl = url;
      }

      // Parse emails
      const requestEmailList = formData.requestEmails
        .split(/[\n,]/) // Corrected regex
        .map(e => e.trim())
        .filter(e => e.length > 0);

      const playlistEmailList = formData.separatePlaylistAccess
        ? formData.playlistEmails
            .split(/[\n,]/) // Corrected regex
            .map(e => e.trim())
            .filter(e => e.length > 0)
        : requestEmailList;

      const finalPlaylistLiveDate = formData.separatePlaylistDate && formData.playlistLiveDate
        ? formData.playlistLiveDate
        : formData.deadline;

      if (isEditMode && id && playlistId) {
          // UPDATE EXISTING
          await updateDoc(doc(db, 'playlists', playlistId), {
            title: formData.title,
            description: formData.description,
            accessList: playlistEmailList,
            artworkUrl
          });

          await updateDoc(doc(db, 'requests', id), {
            title: formData.title,
            description: formData.description,
            deadline: formData.deadline,
            playlistLiveDate: finalPlaylistLiveDate,
            accessList: requestEmailList,
            artworkUrl
          });

          // Show Success View with Links
          const baseUrl = window.location.origin;
          setCreatedLinks({
            request: `${baseUrl}/s/${id}`,
            playlist: `${baseUrl}/p/${playlistId}`
          });

      } else {
          // CREATE NEW
          const playlistRef = await addDoc(collection(db, 'playlists'), {
            title: formData.title,
            description: formData.description,
            accessList: playlistEmailList,
            createdAt: serverTimestamp(),
            hostEmail: user.email,
            artworkUrl
          });

          const requestRef = await addDoc(collection(db, 'requests'), {
            title: formData.title,
            description: formData.description,
            deadline: formData.deadline,
            playlistLiveDate: finalPlaylistLiveDate,
            accessList: requestEmailList,
            playlistId: playlistRef.id,
            createdAt: serverTimestamp(),
            hostEmail: user.email,
            artworkUrl
          });

          const baseUrl = window.location.origin;
          setCreatedLinks({
            request: `${baseUrl}/s/${requestRef.id}`,
            playlist: `${baseUrl}/p/${requestRef.id}`
          });
      }

    } catch (err) {
      console.error(err);
      alert('Error saving request');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (createdLinks) {
    return (
      <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center">
        <div className="w-full max-w-2xl bg-gray-900 p-8 rounded-lg border border-green-900">
          <div className="flex items-center gap-2 mb-6 text-green-500">
            <Check className="w-8 h-8" />
            <h1 className="text-2xl font-bold">{isEditMode ? 'Request Updated!' : 'Request Created!'}</h1>
          </div>
          
          <div className="space-y-6">
            <div className="bg-gray-800 p-4 rounded">
              <label className="block text-gray-400 text-sm mb-2">Request Link (For Participants)</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-black p-2 rounded text-blue-400 overflow-x-auto">
                  {createdLinks.request}
                </code>
                <button 
                  onClick={() => copyToClipboard(createdLinks.request)}
                  className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                >
                  <Copy size={20} />
                </button>
              </div>
            </div>

            <div className="bg-gray-800 p-4 rounded">
              <label className="block text-gray-400 text-sm mb-2">Playlist Link (Read-only / Host View)</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-black p-2 rounded text-purple-400 overflow-x-auto">
                  {createdLinks.playlist}
                </code>
                <button 
                  onClick={() => copyToClipboard(createdLinks.playlist)}
                  className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                >
                  <Copy size={20} />
                </button>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
                <button
                  type="button"
                  onClick={() => navigate('/host/dashboard')}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition"
                >
                  Back to Dashboard
                </button>
                {!isEditMode && (
                    <button
                    onClick={() => {
                        setCreatedLinks(null);
                        setFormData({ 
                            title: '', description: '', deadline: '', 
                            playlistLiveDate: '', separatePlaylistDate: false,
                            requestEmails: '', playlistEmails: '', separatePlaylistAccess: false 
                        });
                        setArtworkFile(null);
                    }}
                    className="flex-1 text-gray-400 hover:text-white underline"
                    >
                    Create Another Request
                    </button>
                )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-3xl mx-auto">
        <button 
            type="button"
            onClick={() => navigate('/host/dashboard')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
        >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold mb-8">{isEditMode ? 'Edit Request' : 'Create New Request'}</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6 bg-gray-900 p-6 rounded-lg border border-gray-800">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              required
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              required
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Artwork (Optional)</label>
            <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${ 
                artworkFile ? 'border-green-600 bg-green-900/10' : 'border-gray-700 hover:border-gray-600'
            }`}>
                <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => setArtworkFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="art-upload-host"
                />
                <label htmlFor="art-upload-host" className="cursor-pointer flex flex-col items-center gap-2">
                    <ImageIcon className={`w-6 h-6 ${artworkFile || existingArtworkUrl ? 'text-green-500' : 'text-gray-500'}`} />
                    <span className="text-xs text-gray-300">
                        {artworkFile ? artworkFile.name : (existingArtworkUrl ? 'Change current image' : 'Select image (JPG, PNG)')}
                    </span>
                </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Deadline</label>
            <input
              required
              type="datetime-local"
              value={formData.deadline}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
            />
          </div>

          <div className="border-t border-gray-800 pt-4">
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.separatePlaylistDate}
                onChange={(e) => setFormData({ ...formData, separatePlaylistDate: e.target.checked })}
                className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600"
              />
              <span className="text-sm font-medium">Set custom playlist live date?</span>
            </label>

            {formData.separatePlaylistDate && (
              <div className="mb-6 pl-6 border-l-2 border-gray-800">
                <label className="block text-sm font-medium mb-1 text-gray-400">Playlist Live Date</label>
                <input
                  required
                  type="datetime-local"
                  value={formData.playlistLiveDate}
                  onChange={(e) => setFormData({ ...formData, playlistLiveDate: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                />
              </div>
            )}

            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.separatePlaylistAccess}
                onChange={(e) => setFormData({ ...formData, separatePlaylistAccess: e.target.checked })}
                className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600"
              />
              <span className="text-sm font-medium">Use different access list for playlist?</span>
            </label>

            {formData.separatePlaylistAccess && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Playlist Access Emails
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="user1@example.com..."
                  value={formData.playlistEmails}
                  onChange={(e) => setFormData({ ...formData, playlistEmails: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white font-mono text-sm"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Request Access Emails (Comma or Newline separated)
            </label>
            <textarea
              required
              rows={6}
              placeholder="user1@example.com, user2@example.com..."
              value={formData.requestEmails}
              onChange={(e) => setFormData({ ...formData, requestEmails: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white font-mono text-sm"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="animate-spin" />}
              {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Request' : 'Create Request & Generate Links')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { User, Save, Trash2, Shield, Loader2, Upload, AlertTriangle, Users, Music } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { uploadToR2 } from '../lib/r2';
import { fixUrl } from '../lib/url';
import { db } from '../lib/firebase';
import { doc, updateDoc, onSnapshot, serverTimestamp, query, where, collection, getDocs, orderBy } from 'firebase/firestore';
import type { UserProfile } from '../types';

export function Settings() {
  const { user, isAdmin, participantEmail, logout } = useAuth();
  const { success, error } = useToast();
  
  const [resolvedUid, setResolvedUid] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
        setResolvedUid(user.uid);
    } else if (participantEmail) {
        const q = query(collection(db, 'profiles'), where('email', '==', participantEmail));
        getDocs(q).then(snap => {
            if (!snap.empty) {
                setResolvedUid(snap.docs[0].id);
            }
        }).catch(e => console.error("Error finding participant profile", e));
    } else {
        setResolvedUid(null);
    }
  }, [user, participantEmail]);

  // Profile State
  const [username, setUsername] = useState(''); // Immutable (Alias)
  const [displayName, setDisplayName] = useState(''); // Mutable
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [links, setLinks] = useState<{label: string, url: string}[]>([]);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const isDirty = useRef(false);

  // Privacy State
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [showRequestsOnProfile, setShowRequestsOnProfile] = useState(true);
  const [showSubmissionsOnProfile, setShowSubmissionsOnProfile] = useState(true);

  // Content Preferences
  const [filterAI, setFilterAI] = useState(false);

  // Data State
  const [isClearing, setIsClearing] = useState(false);

  // Load Initial Data
  useEffect(() => {
    if (!resolvedUid) return;

    const profileRef = doc(db, 'profiles', resolvedUid);
    const unsubscribe = onSnapshot(profileRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            
            // Only update state if user hasn't started editing to avoid overwriting input
            if (!isDirty.current) {
                setUsername(data.alias || '');
                setDisplayName(data.displayName || data.alias || '');
                setBio(data.bio || '');
                setLocation(data.location || '');
                setLinks(data.links || []);
                setCurrentAvatarUrl(data.avatarUrl || '');
                setIsVolunteer(!!data.isVolunteer);
                setIsHost(!!data.isHost);
                
                // Settings
                if (data.settings?.privacy) {
                    setShowRequestsOnProfile(data.settings.privacy.showRequestsOnProfile ?? true);
                    setShowSubmissionsOnProfile(data.settings.privacy.showSubmissionsOnProfile ?? true);
                }
                if (data.settings?.content) {
                    setFilterAI(!!data.settings.content.filterAI);
                }
            }
        }
    });

    return () => unsubscribe();
  }, [resolvedUid]);

  const handleSaveProfile = async () => {
    if (!resolvedUid) return;
    setIsSavingProfile(true);

    try {
      let avatarUrl = currentAvatarUrl;
      if (avatar) {
        const res = await uploadToR2(avatar);
        avatarUrl = res.url;
        setCurrentAvatarUrl(avatarUrl);
      }

      // Update Profile in Firestore
      const updates: any = {
        alias: username,
        displayName,
        bio,
        location,
        links, // Firestore handles arrays
        avatarUrl: avatarUrl || '',
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(doc(db, 'profiles', resolvedUid), updates);

      // Reset file input
      setAvatar(null);
      isDirty.current = false;
      success('Profile updated successfully!');
    } catch (e) {
      console.error("Failed to save profile", e);
      error("Failed to save profile: " + (e as Error).message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAddLink = () => {
      setLinks([...links, { label: '', url: '' }]);
      isDirty.current = true;
  };

  const handleRemoveLink = (index: number) => {
      setLinks(links.filter((_, i) => i !== index));
      isDirty.current = true;
  };

  const handleLinkChange = (index: number, field: 'label' | 'url', value: string) => {
      const newLinks = [...links];
      newLinks[index] = { ...newLinks[index], [field]: value };
      setLinks(newLinks);
      isDirty.current = true;
  };

  // Helper to update specific fields
  const updateSetting = async (field: string, value: any, nestedPath?: string) => {
      if (!resolvedUid) return;
      try {
          const ref = doc(db, 'profiles', resolvedUid);
          let updateData = {};
          
          if (nestedPath) {
              updateData = { [`${nestedPath}.${field}`]: value };
          } else {
              updateData = { [field]: value };
          }
          
          await updateDoc(ref, updateData);
      } catch (e) {
          console.error(`Failed to update ${field}`, e);
          error("Failed to update setting.");
      }
  };

  const handleToggleRequestsVisibility = () => {
      const newValue = !showRequestsOnProfile;
      setShowRequestsOnProfile(newValue);
      updateSetting('showRequestsOnProfile', newValue, 'settings.privacy');
  };

  const handleToggleSubmissionsVisibility = () => {
      const newValue = !showSubmissionsOnProfile;
      setShowSubmissionsOnProfile(newValue);
      updateSetting('showSubmissionsOnProfile', newValue, 'settings.privacy');
  };

  const handleToggleVolunteer = () => {
      const newValue = !isVolunteer;
      setIsVolunteer(newValue); 
      updateSetting('isVolunteer', newValue);
  };

  const handleToggleHost = () => {
      const newValue = !isHost;
      setIsHost(newValue); 
      updateSetting('isHost', newValue);
  };

  const handleToggleFilterAI = () => {
      const newValue = !filterAI;
      setFilterAI(newValue);
      updateSetting('filterAI', newValue, 'settings.content');
  };

  const handleClearData = async () => {
      if (!window.confirm("Are you sure? This will clear local browser cache and log you out.")) return; 
      setIsClearing(true);
      
      localStorage.clear();
      sessionStorage.clear();
      
      try {
          const databases = await window.indexedDB.databases();
          for (const db of databases) {
              if (db.name) window.indexedDB.deleteDatabase(db.name);
          }
      } catch (e) {
          console.warn("Could not clear IndexedDB:", e);
      }

      await logout();
      window.location.reload();
  };

  const handleDownloadBugReports = async () => {
      try {
          const q = query(
              collection(db, 'notifications'),
              where('type', '==', 'bug'),
              orderBy('createdAt', 'desc')
          );
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
              error("No bug reports found.");
              return;
          }

          const headers = ['ID', 'Date', 'User UID', 'Message', 'Link/Screenshot'];
          const rows = snapshot.docs.map(doc => {
              const data = doc.data();
              return [
                  doc.id,
                  new Date(data.createdAt?.seconds * 1000 || Date.now()).toLocaleString(),
                  data.fromUid || 'Anonymous',
                  `"${(data.message || '').replace(/"/g, '""')}"`, // Escape quotes
                  data.link || ''
              ].join(',');
          });

          const csvContent = [headers.join(','), ...rows].join('\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', `bug_reports_${new Date().toISOString().split('T')[0]}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } catch (e) {
          console.error("Failed to download bug reports:", e);
          error("Failed to download bug reports.");
      }
  };

  return (
    <div className="max-w-3xl mx-auto pb-4 p-2 sm:pb-20 sm:p-6">
      <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
        Settings
      </h1>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-500" />
            Profile Settings
        </h2>
        
        <div className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-6">
                <div className="relative w-24 h-24 rounded-full bg-gray-800 border-2 border-dashed border-gray-600 flex items-center justify-center overflow-hidden hover:border-white transition cursor-pointer group">
                    <input 
                    type="file" 
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    onChange={e => { setAvatar(e.target.files?.[0] || null); isDirty.current = true; }}
                    />
                    {avatar ? (
                        <img src={URL.createObjectURL(avatar)} className="w-full h-full object-cover" />
                    ) : currentAvatarUrl ? (
                        <img src={fixUrl(currentAvatarUrl)} className="w-full h-full object-cover" />
                    ) : (
                        <User className="w-8 h-8 text-gray-500 group-hover:text-gray-400" />
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <Upload className="w-6 h-6 text-white" />
                    </div>
                </div>
                <div>
                    <p className="text-white font-medium mb-1">Profile Picture</p>
                    <p className="text-sm text-gray-500">Click to upload a new avatar.</p>
                </div>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-1 gap-4">
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Username (Alias)</label>
                    <input 
                        type="text" 
                        value={username}
                        onChange={e => { setUsername(e.target.value); isDirty.current = true; }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition"
                        placeholder={!resolvedUid ? 'Loading...' : 'Not set'}
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                    <input 
                        type="text" 
                        value={displayName}
                        onChange={e => { setDisplayName(e.target.value); isDirty.current = true; }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition"
                        placeholder="e.g. CryptoMusician"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Bio</label>
                    <textarea 
                        value={bio}
                        onChange={e => { setBio(e.target.value); isDirty.current = true; }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition h-24"
                        placeholder="Tell us about yourself..."
                    />
                </div>
                
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Location</label>
                    <input 
                        type="text" 
                        value={location}
                        onChange={e => { setLocation(e.target.value); isDirty.current = true; }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition"
                        placeholder="e.g. Nashville, TN"
                    />
                </div>

                <div>
                    <label className="block text-sm text-gray-400 mb-2">External Links</label>
                    <div className="space-y-3">
                        {links.map((link, i) => (
                            <div key={i} className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={link.label}
                                    onChange={e => handleLinkChange(i, 'label', e.target.value)}
                                    className="w-1/3 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition"
                                    placeholder="Label (e.g. Website)"
                                />
                                <input 
                                    type="text" 
                                    value={link.url}
                                    onChange={e => handleLinkChange(i, 'url', e.target.value)}
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition"
                                    placeholder="URL (https://...)"
                                />
                                <button 
                                    onClick={() => handleRemoveLink(i)}
                                    className="p-3 text-red-500 hover:bg-red-900/20 rounded-lg transition"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                        <button 
                            onClick={handleAddLink}
                            className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                        >
                            + Add Link
                        </button>
                    </div>
                </div>
            </div>

            <button 
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Profile
            </button>
        </div>
      </section>

      {/* Community Section */}
      {isAdmin && (
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-500" />
            Community Contributions
        </h2>
        
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-x-4">
                <div>
                    <h3 className="text-white font-medium mb-1">Join Feedback Volunteer Pool</h3>
                    <p className="text-xs text-gray-400">
                        Opt-in to be randomly selected to give feedback on tracks from other users. 
                        Helping others helps the community grow!
                    </p>
                </div>
                <button 
                    onClick={handleToggleVolunteer}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${isVolunteer ? 'bg-purple-600' : 'bg-gray-600'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isVolunteer ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            <div className="flex items-center justify-between border-t border-gray-800 pt-4 gap-x-4">
                <div>
                    <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                        Host Requests
                    </h3>
                    <p className="text-xs text-gray-400">
                        Enable the ability to create new requests and invite others.
                    </p>
                </div>
                <button 
                    onClick={handleToggleHost}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${isHost ? 'bg-purple-600' : 'bg-gray-600'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isHost ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>
        </div>
      </section>
      )}

      {/* Content Preferences */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Music className="w-5 h-5 text-green-500" />
            Content Preferences
        </h2>
        
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-x-4">
                <div>
                    <h3 className="text-white font-medium mb-1">Filter AI Submissions</h3>
                    <p className="text-xs text-gray-400">
                        Automatically hide submissions that voluntarily declare they were made with AI. 
                        This also filters notifications and community feed items.
                    </p>
                </div>
                <button 
                    onClick={handleToggleFilterAI}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${filterAI ? 'bg-green-600' : 'bg-gray-600'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${filterAI ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            Privacy & Permissions
        </h2>
        
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-x-4">
                <div>
                    <label className="text-white font-medium block">Show Hosted Requests on Profile</label>
                    <p className="text-gray-400 text-xs">List your hosted requests on your public profile page.</p>
                </div>
                <button 
                    onClick={handleToggleRequestsVisibility}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${showRequestsOnProfile ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showRequestsOnProfile ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            <div className="flex items-center justify-between border-t border-gray-800 pt-4 gap-x-4">
                <div>
                    <label className="text-white font-medium block">Show Submissions on Profile</label>
                    <p className="text-gray-400 text-xs">List your track submissions on your public profile page.</p>
                </div>
                <button 
                    onClick={handleToggleSubmissionsVisibility}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${showSubmissionsOnProfile ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showSubmissionsOnProfile ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>
        </div>
      </section>

      {/* Data Management Section */}
      {isAdmin && (
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Data Management
        </h2>
        
        <div className="space-y-6">
            <div className="border-t border-gray-800 pt-6">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-gray-400 text-xs">
                        MEW is a "Local-First" application. This means a lot of data is stored directly in your browser. 
                        If you are experiencing issues, clearing your local data might help. 
                        <span className="text-red-400 block mt-1">Warning: This will log you out.</span>
                    </p>
                </div>
                
                <div className="flex gap-4">
                    <button 
                        onClick={handleClearData}
                        disabled={isClearing}
                        className="bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition"
                    >
                        {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Clear Local Data & Reset
                    </button>

                    <button 
                        onClick={handleDownloadBugReports}
                        className="bg-blue-900/20 hover:bg-blue-900/40 text-blue-500 border border-blue-900/50 px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition"
                    >
                        <Upload className="w-4 h-4" /> {/* Reusing Upload icon for download, or import Download */}
                        Download Bug Reports (CSV)
                    </button>
                </div>
            </div>
        </div>
      </section>
      )}
    </div>
  );
}
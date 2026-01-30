import { useState, useEffect } from 'react';
import { User, Save, Trash2, Shield, Loader2, Upload, AlertTriangle, Users } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { useToast } from '../contexts/ToastContext';
import { uploadFile } from '../lib/upload';

export function Settings() {
  const { gun, user, pubKey, userProfile } = useGun();
  const { success, error } = useToast();
  
  // Profile State
  const [username, setUsername] = useState(''); // Immutable
  const [displayName, setDisplayName] = useState(''); // Mutable
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [links, setLinks] = useState<{label: string, url: string}[]>([]);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Privacy State
  const [acceptUnsolicited, setAcceptUnsolicited] = useState(true);
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

  // Data State
  const [isClearing, setIsClearing] = useState(false);

  // Load Initial Data
  useEffect(() => {
    // Load Username (Immutable)
    // Prefer directory alias (userProfile) as it's reliable, fallback to session alias
    // @ts-ignore
    if (userProfile?.alias) {
        setUsername(userProfile.alias);
    } else if (user.is) {
        // @ts-ignore
        setUsername(user.is.alias || '');
    }

    if (userProfile) {
      setDisplayName(userProfile.displayName || userProfile.alias || '');
      setBio(userProfile.bio || '');
      setLocation(userProfile.location || '');
      setLinks(userProfile.links || []);
      setCurrentAvatarUrl(userProfile.avatarUrl || '');
      setIsVolunteer(!!userProfile.isVolunteer);
    }

    // Load Privacy Settings
    if (pubKey) {
       user.get('settings').get('privacy').get('acceptUnsolicited').on((data: any) => {
           // Default to true if undefined
           setAcceptUnsolicited(data === false ? false : true);
       });
    }
  }, [userProfile, pubKey, user]);

  const handleSaveProfile = async () => {
    if (!user || !pubKey) return;
    setIsSavingProfile(true);

    try {
      let avatarUrl = currentAvatarUrl;
      if (avatar) {
        const res = await uploadFile(avatar, (user as any).is);
        avatarUrl = res.url;
        setCurrentAvatarUrl(avatarUrl);
      }

      const updates: any = {
        displayName, // Only update display name
        bio,
        location,
        links,
        isVolunteer,
        avatarUrl: avatarUrl || ''
      };

      // Update Public Profile in Directory
      // We keep 'alias' as the username in the directory for searching, 
      // but add 'displayName' for UI.
      gun.get('all_users').get(pubKey).put(updates, (ack: any) => {
          if (ack.err) console.error("Profile save error:", ack.err);
          else console.log("Profile save success:", ack);
      });
      
      // Update User Node
      user.get('profile').put(updates);

      // Reset file input
      setAvatar(null);
      success('Profile updated successfully!');
    } catch (e) {
      console.error("Failed to save profile", e);
      error("Failed to save profile. Please try again.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAddLink = () => {
      setLinks([...links, { label: '', url: '' }]);
  };

  const handleRemoveLink = (index: number) => {
      setLinks(links.filter((_, i) => i !== index));
  };

  const handleLinkChange = (index: number, field: 'label' | 'url', value: string) => {
      const newLinks = [...links];
      newLinks[index] = { ...newLinks[index], [field]: value };
      setLinks(newLinks);
  };

  const handleToggleVolunteer = () => {
      if (!pubKey) return;
      const newValue = !isVolunteer;
      setIsVolunteer(newValue); // Optimistic update
      
      // Save immediately to public directory
      gun.get('all_users').get(pubKey).get('isVolunteer').put(newValue);
      // Save to private profile
      user.get('profile').get('isVolunteer').put(newValue);
  };

  const handleTogglePrivacy = () => {
      const newValue = !acceptUnsolicited;
      setAcceptUnsolicited(newValue);
      setIsSavingPrivacy(true);
      user.get('settings').get('privacy').get('acceptUnsolicited').put(newValue, () => {
          setIsSavingPrivacy(false);
      });
  };

  const handleClearData = async () => {
      if (!window.confirm("Are you sure? This will clear all local data, including your login session. You will need to log in again.")) return;
      
      setIsClearing(true);
      
      // Clear LocalStorage
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear IndexedDB (GunDB often uses this)
      try {
          const databases = await window.indexedDB.databases();
          for (const db of databases) {
              if (db.name) window.indexedDB.deleteDatabase(db.name);
          }
      } catch (e) {
          console.warn("Could not clear IndexedDB:", e);
      }

      // Reload
      setTimeout(() => {
          window.location.reload();
      }, 1000);
  };

  return (
    <div className="max-w-3xl mx-auto pb-20 p-6">
      <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
        Settings
      </h1>

      {/* Profile Section */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
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
                    onChange={e => setAvatar(e.target.files?.[0] || null)}
                    />
                    {avatar ? (
                        <img src={URL.createObjectURL(avatar)} className="w-full h-full object-cover" />
                    ) : currentAvatarUrl ? (
                        <img src={currentAvatarUrl} className="w-full h-full object-cover" />
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
                    <label className="block text-sm text-gray-400 mb-1">Username (Immutable)</label>
                    <input 
                        type="text" 
                        value={username}
                        readOnly
                        className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg p-3 text-gray-400 cursor-not-allowed"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                    <input 
                        type="text" 
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition"
                        placeholder="e.g. CryptoMusician"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Bio</label>
                    <textarea 
                        value={bio}
                        onChange={e => setBio(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition h-24"
                        placeholder="Tell us about yourself..."
                    />
                </div>
                
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Location</label>
                    <input 
                        type="text" 
                        value={location}
                        onChange={e => setLocation(e.target.value)}
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
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-500" />
            Community Contributions
        </h2>
        
        <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-800">
            <div>
                <h3 className="text-white font-medium mb-1">Join Feedback Volunteer Pool</h3>
                <p className="text-sm text-gray-500 max-w-md">
                    Opt-in to be randomly selected to give feedback on tracks from other users. 
                    Helping others helps the community grow!
                </p>
            </div>
            <button 
                onClick={handleToggleVolunteer}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isVolunteer ? 'bg-purple-600' : 'bg-gray-600'}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isVolunteer ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-500" />
            Privacy & Security
        </h2>
        
        <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-800">
            <div>
                <h3 className="text-white font-medium mb-1">Accept Unsolicited Requests</h3>
                <p className="text-sm text-gray-500 max-w-md">
                    If disabled, you will only see collaboration requests and inbox messages from people you have explicitly connected with or follow.
                </p>
            </div>
            <button 
                onClick={handleTogglePrivacy}
                disabled={isSavingPrivacy}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${acceptUnsolicited ? 'bg-green-600' : 'bg-gray-600'}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${acceptUnsolicited ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
      </section>

      {/* Data Management Section */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Data Management
        </h2>
        
        <div className="space-y-4">
            <p className="text-gray-400 text-sm">
                MEW2 is a "Local-First" application. This means a lot of data is stored directly in your browser. 
                If you are experiencing issues, clearing your local data might help. 
                <span className="text-red-400 block mt-1">Warning: This will log you out. Ensure you have your keys saved if using a non-standard login.</span>
            </p>
            
            <button 
                onClick={handleClearData}
                disabled={isClearing}
                className="bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition"
            >
                {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Clear Local Data & Reset
            </button>
        </div>
      </section>
    </div>
  );
}

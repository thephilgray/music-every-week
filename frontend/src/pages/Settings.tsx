import { useState, useEffect, useRef } from 'react';
import { User, Save, Trash2, Shield, Loader2, Upload, AlertTriangle, Users, Bug, Music, ShieldCheck, ArrowRight, Copy, Key, Database } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { useToast } from '../contexts/ToastContext';
import { uploadFile } from '../lib/upload';
import { fixUrl } from '../lib/url';

export function Settings() {
  const { gun, user, pubKey, userProfile, isAdmin } = useGun();
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
  const isDirty = useRef(false);

  // Privacy State
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [showRequestsOnProfile, setShowRequestsOnProfile] = useState(true);
  const [showSubmissionsOnProfile, setShowSubmissionsOnProfile] = useState(true);

  // Content Preferences
  const [filterAI, setFilterAI] = useState(false);

  // Global Permissions (Admin Controlled)
  const [lockHostCreation, setLockHostCreation] = useState(false);


  // Data State
  const [isClearing, setIsClearing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState('');
  
  // Disaster Recovery State
  const [isReseeding, setIsReseeding] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  // Migration Tool State
  const [migrationOldPub, setMigrationOldPub] = useState('');
  const [migrationNewPub, setMigrationNewPub] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);

  // Load Initial Data
  useEffect(() => {
    // Load Username (Immutable)
    let loadedUsername = '';
    // Prefer directory alias (userProfile) as it's reliable
    // @ts-ignore
    if (userProfile?.alias) {
        loadedUsername = userProfile.alias;
    } else if (user.is) {
        // Fallback to session alias
        // @ts-ignore
        loadedUsername = user.is.alias || '';
    }
    
    if (loadedUsername) setUsername(loadedUsername);
    else if (pubKey) {
        // Double Fallback: Fetch directly
        gun.get('all_users').get(pubKey).once((data: any) => {
            if (data && data.alias) setUsername(data.alias);
        });
    }

    if (userProfile && !isDirty.current) {
      if (userProfile.displayName) setDisplayName(userProfile.displayName);
      else if (userProfile.alias) setDisplayName(userProfile.alias);
      
      if (userProfile.bio) setBio(userProfile.bio);
      if (userProfile.location) setLocation(userProfile.location);
      if (userProfile.links && userProfile.links.length > 0) setLinks(userProfile.links);
      if (userProfile.avatarUrl) setCurrentAvatarUrl(userProfile.avatarUrl);
      
      setIsVolunteer(!!userProfile.isVolunteer);
      setIsHost(!!userProfile.isHost);
    }

    // Load Content Preferences
    if (user) {
        user.get('settings').get('content').get('filterAI').on((data: any) => {
            setFilterAI(!!data);
        });
    }

    // Load Global Permissions
    gun.get('application_settings').get('lockHostCreation').on((data: any) => {
        setLockHostCreation(!!data);
    });
  }, [userProfile, pubKey, user, gun]); // Added gun dependency

  // Load Public Visibility Settings (Separate Effect to avoid re-subscription loop)
  useEffect(() => {
    if (pubKey) {
        gun.get('all_users').get(pubKey).once((data: any) => {
            if (data) {
                if (data.showRequestsOnProfile !== undefined) setShowRequestsOnProfile(data.showRequestsOnProfile);
                if (data.showSubmissionsOnProfile !== undefined) setShowSubmissionsOnProfile(data.showSubmissionsOnProfile);
            }
        });
    }
  }, [pubKey, gun]);

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
        links: JSON.stringify(links), // GunDB doesn't support arrays
        isVolunteer,
        isHost,
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

  const handleToggleRequestsVisibility = () => {
      if (!pubKey) return;
      const newValue = !showRequestsOnProfile;
      setShowRequestsOnProfile(newValue);
      
      gun.get('all_users').get(pubKey).get('showRequestsOnProfile').put(newValue);
  };

  const handleToggleSubmissionsVisibility = () => {
      if (!pubKey) return;
      const newValue = !showSubmissionsOnProfile;
      setShowSubmissionsOnProfile(newValue);
      
      gun.get('all_users').get(pubKey).get('showSubmissionsOnProfile').put(newValue);
  };

  const handleToggleVolunteer = () => {
      if (!pubKey) return;
      const newValue = !isVolunteer;
      setIsVolunteer(newValue); 
      
      gun.get('all_users').get(pubKey).get('isVolunteer').put(newValue);
      user.get('profile').get('isVolunteer').put(newValue);
  };

  const handleToggleHost = () => {
      if (!pubKey) return;
      
      // Security Check: If locked and not admin, do nothing
      if (lockHostCreation && !isAdmin) {
          error("Host creation is currently restricted to administrators.");
          return;
      }

      const newValue = !isHost;
      setIsHost(newValue); 
      
      gun.get('all_users').get(pubKey).get('isHost').put(newValue);
      user.get('profile').get('isHost').put(newValue);
  };

  const handleToggleFilterAI = () => {
      const newValue = !filterAI;
      setFilterAI(newValue);
      user.get('settings').get('content').get('filterAI').put(newValue);
  };

  const handleToggleLockHostCreation = () => {
      const newValue = !lockHostCreation;
      setLockHostCreation(newValue);
      gun.get('application_settings').get('lockHostCreation').put(newValue);
  };

  const handleRecoverLegacyData = async () => {
    if (!confirm("This will read data from the old IndexedDB AND LocalStorage and attempt to sync it to the new server. Only do this if you are missing data but have it on this device.")) return;
    setIsRecovering(true);
    let count = 0;

    try {
        // 1. Recover from LocalStorage (if any)
        console.log("Starting LocalStorage recovery...");
        const prefix = 'mew-radata-v1/';
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                try {
                    const cleanKey = key.replace(prefix, '');
                    const val = localStorage.getItem(key);
                    if (val) {
                        const parsed = JSON.parse(val);
                        gun.get(cleanKey).put(parsed);
                        count++;
                    }
                } catch (e) {
                    console.warn("Failed to migrate LS key:", key);
                }
            }
        }

        // 2. Recover from IndexedDB
        const dbName = 'mew-radata-v1';
        const req = window.indexedDB.open(dbName);
        
        req.onerror = () => { 
            // If IDB fails, we still report LS success
            if (count > 0) success(`Recovered ${count} nodes from LocalStorage. IndexedDB skipped.`);
            else error("Could not open legacy database."); 
            setIsRecovering(false); 
        };

        req.onsuccess = async (e: any) => {
            const db = e.target.result;
            if (db.objectStoreNames.length === 0) {
                 if (count > 0) success(`Recovered ${count} nodes from LocalStorage. IndexedDB was empty.`);
                 else error("Legacy database is empty.");
                 setIsRecovering(false);
                 return;
            }
            
            const storeName = db.objectStoreNames[0]; 
            console.log("Found legacy store:", storeName);
            
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const cursorReq = store.openCursor();
            
            cursorReq.onsuccess = (ev: any) => {
                const cursor = ev.target.result;
                if (cursor) {
                    const key = cursor.key;
                    const val = cursor.value;
                    
                    if (val && typeof val === 'object') {
                        try {
                             if (typeof key === 'string' && !key.startsWith('!')) {
                                  gun.get(key).put(val);
                                  count++;
                             }
                        } catch (err) {
                            console.warn("Failed to migrate key:", key, err);
                        }
                    }
                    cursor.continue();
                } else {
                    success(`Migration finished. Processed ${count} nodes (LocalStorage + IndexedDB). Allow time for sync.`);
                    setIsRecovering(false);
                }
            };
            cursorReq.onerror = () => {
                error("Error reading legacy data.");
                setIsRecovering(false);
            };
        };
    } catch (e) {
        console.error(e);
        error("Recovery failed.");
        setIsRecovering(false);
    }
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

  const handleExportSession = () => {
      // @ts-ignore
      if (user.is && user.is.priv) {
          // @ts-ignore
          const data = JSON.stringify(user.is);
          setExportData(data);
          setShowExport(true);
          navigator.clipboard.writeText(data);
          success("Session keypair copied to clipboard!");
      } else {
          error("No active session found to export. Try logging in again.");
      }
  };

  const exportBugReports = async () => {
      if (!pubKey) return;
      const reports: any[] = [];
      
      // Fetch
      await new Promise<void>(resolve => {
          let count = 0;
          // Timeout
          setTimeout(resolve, 2000);
          
          gun.get('inboxes').get(pubKey).map().once((data: any) => {
              if (data && data.message && data.message.startsWith('BUG REPORT')) {
                  reports.push({
                      date: new Date(data.createdAt).toISOString(),
                      from: data.fromPub,
                      message: data.message.replace(/\n/g, '  '),
                      link: data.link
                  });
              }
              count++;
          });
      });

      if (reports.length === 0) {
          error("No bug reports found.");
          return;
      }

      const headers = ['Date', 'From', 'Message', 'Screenshot/Link'];
      const csvContent = [
          headers.join(','),
          ...reports.map(r => `"${r.date}","${r.from}","${r.message}","${r.link}"`) 
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `bug_reports_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleReseedRelay = async () => {
      if (!confirm("Only run this if you have wiped the server and need to restore data from THIS device. This will iterate through all local content to sync it to the relay.")) return; 
      
      setIsReseeding(true);
      let count = 0;
      
      try {
          // 1. Reseed Public Directory
          gun.get('all_users').map().once((data: any) => {
              if (data) {
                  // Just reading 'once' triggers Gun to evaluate sync status. 
                  // For owned nodes, we could 'put', but for others we rely on Gun's mesh.
                  // We touch the node to ensure it's active in memory.
                  count++;
              }
          });

          // 2. Reseed Requests
          gun.get('file_requests').map().once((req: any, key: string) => {
              if (req && req.title) {
                  count++;
                  // If we are the owner, we force a write to ensure propagation
                  if (req.ownerPub === pubKey) {
                      const clean = { ...req };
                      delete clean._;
                      gun.get('file_requests').get(key).put(clean);
                  }
                  
                  // 3. Reseed Submissions for this request
                  gun.get('request_submissions').get(key).map().once((sub: any, subKey: string) => {
                      if (sub) {
                          count++;
                          if (sub.uploaderPub === pubKey) {
                              const cleanSub = { ...sub };
                              delete cleanSub._;
                              gun.get('request_submissions').get(key).get(subKey).put(cleanSub);
                          }
                      }
                  });
              }
          });
          
          // Allow time for the mesh to propagate
          await new Promise(r => setTimeout(r, 5000));
          success(`Reseed process initiated. Scanned ${count} items. Keep this tab open for a while to allow sync.`);
      } catch (e) {
          console.error(e);
          error("Reseed failed.");
      } finally {
          setIsReseeding(false);
      }
  };

  const handleMigration = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!migrationOldPub.trim() || !migrationNewPub.trim()) {
          error("Both public keys are required.");
          return;
      }
      
      setIsMigrating(true);
      
      try {
          // Verify both users exist (optional but good practice)
          const oldUserExists = await new Promise(resolve => 
              gun.get('all_users').get(migrationOldPub).once(d => resolve(!!d))
          );
          const newUserExists = await new Promise(resolve => 
              gun.get('all_users').get(migrationNewPub).once(d => resolve(!!d))
          );

          if (!oldUserExists) {
              error("Old user profile not found.");
              setIsMigrating(false);
              return;
          }
          if (!newUserExists) {
              error("New user profile not found.");
              setIsMigrating(false);
              return;
          }

          // Create the Link
          // We use a dedicated 'migrations' graph
          // Schema: migrations -> newPub -> oldPub -> true
          await gun.get('migrations').get(migrationNewPub).get(migrationOldPub).put(true); 
          
          // Link reverse for filtering old accounts from directory
          // Schema: migrations_reverse -> oldPub -> newPub
          await gun.get('migrations_reverse').get(migrationOldPub).put(migrationNewPub);

          success(`Successfully linked accounts! Content migrated.`);
          setMigrationOldPub('');
          setMigrationNewPub('');
      } catch (err) {
          console.error(err);
          error("Migration failed. Check console.");
      } finally {
          setIsMigrating(false);
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
                        {(lockHostCreation && !isAdmin) && <Shield className="w-3 h-3 text-red-500" />}
                    </h3>
                    <p className="text-xs text-gray-400">
                        {(lockHostCreation && !isAdmin) 
                            ? "Host creation is currently managed by administrators."
                            : "Enable the ability to create new requests and invite others."}
                    </p>
                </div>
                <button 
                    onClick={handleToggleHost}
                    disabled={lockHostCreation && !isAdmin}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 
                        ${(lockHostCreation && !isAdmin) 
                            ? 'bg-gray-800 cursor-not-allowed opacity-50' 
                            : (isHost ? 'bg-purple-600' : 'bg-gray-600')
                        }`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform 
                        ${(lockHostCreation && !isAdmin) 
                            ? 'translate-x-1' 
                            : (isHost ? 'translate-x-6' : 'translate-x-1')
                        }`} 
                    />
                </button>
            </div>
        </div>
      </section>

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
            {isHost && (
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
            )}

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
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Data Management
        </h2>
        
        <div className="space-y-6">
            <div>
                <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                    <Key className="w-4 h-4 text-blue-400" />
                    Export Session (Backup)
                </h3>
                <p className="text-gray-400 text-xs mb-3">
                    Use this to transfer your account to another device (like your phone) or save a backup of your keys.
                    <br/><span className="text-blue-400">Copy this code and paste it into the "Restore Session" option on the Login screen of your other device.</span>
                </p>
                
                {!showExport ? (
                    <button 
                        onClick={handleExportSession}
                        className="bg-gray-800 hover:bg-gray-700 text-blue-400 border border-blue-900/30 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition text-sm"
                    >
                        <Key className="w-4 h-4" /> Generate Session Code
                    </button>
                ) : (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                        <div className="relative">
                            <textarea 
                                readOnly
                                value={exportData}
                                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-300 font-mono h-24"
                                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                            />
                            <button 
                                onClick={() => {
                                    navigator.clipboard.writeText(exportData);
                                    success("Copied!");
                                }}
                                className="absolute top-2 right-2 p-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded transition"
                                title="Copy to Clipboard"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-xs text-yellow-600">
                            Warning: This code gives full access to your account. Keep it secret.
                        </p>
                    </div>
                )}
            </div>

            <div className="border-t border-gray-800 pt-6">
                <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4 text-orange-400" />
                    Legacy Data Recovery
                </h3>
                <p className="text-gray-400 text-xs mb-3">
                    If you used the app before the recent update and are missing content, it might be trapped in the old database. 
                    Run this to push your local history to the new server.
                </p>
                <button 
                    onClick={handleRecoverLegacyData}
                    disabled={isRecovering}
                    className="bg-orange-900/20 hover:bg-orange-900/40 text-orange-400 border border-orange-900/50 px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition text-sm mb-4"
                >
                    {isRecovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Recover Data from IndexedDB
                </button>

                {/* Debug Info */}
                <div className="bg-black/50 p-2 rounded text-xs font-mono text-gray-400">
                    <p className="mb-1 font-bold text-gray-300">LocalStorage Keys (Debug):</p>
                    <ul className="max-h-32 overflow-y-auto space-y-1">
                        {Object.keys(localStorage).map(key => (
                            <li key={key} className="break-all">
                                <span className="text-blue-400">{key}</span>: {(localStorage.getItem(key)?.length || 0) / 1024 > 1 ? ((localStorage.getItem(key)?.length || 0) / 1024).toFixed(2) + ' KB' : (localStorage.getItem(key)?.length || 0) + ' bytes'}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="border-t border-gray-800 pt-6">
                <p className="text-gray-400 text-xs mb-4">
                    MEW is a "Local-First" application. This means a lot of data is stored directly in your browser. 
                    If you are experiencing issues, clearing your local data might help. 
                    <span className="text-red-400 block mt-1">Warning: This will log you out. Ensure you have your keys saved (Export Session above) if you can't log back in normally.</span>
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
        </div>
      </section>

      {/* Admin Tools (Hidden) */}
      {isAdmin && (
      <section className="bg-red-900/10 border border-red-900/30 rounded-xl p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-red-400 mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Admin Tools
        </h2>
        
        <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 mb-4">
            <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-red-500" />
                Global Permissions
            </h3>
            <div className="flex items-center justify-between">
                <div>
                    <span className="text-sm text-gray-300 block">Lock Host Creation</span>
                    <span className="text-xs text-gray-500">Prevent non-admins from enabling "Host" status.</span>
                </div>
                <button 
                    onClick={handleToggleLockHostCreation}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${lockHostCreation ? 'bg-red-600' : 'bg-gray-600'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${lockHostCreation ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>
        </div>

        <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 mb-4">
            <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-500" />
                Disaster Recovery
            </h3>
            <p className="text-xs text-gray-500 mb-3">
                If the Relay Server was wiped/reset, use this to push your local data back to the cloud.
            </p>
            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={handleReseedRelay}
                    disabled={isReseeding}
                    className="w-full md:w-auto px-6 py-2 bg-green-900/20 hover:bg-green-900/40 text-green-400 border border-green-900/50 rounded text-sm font-medium transition flex items-center justify-center gap-2"
                >
                    {isReseeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Reseed Relay from Local
                </button>
                
                <button
                    onClick={async () => {
                        const users: any[] = [];
                        await new Promise<void>(resolve => {
                            gun.get('all_users').map().once((data: any, key: string) => {
                                if (data) users.push({ alias: data.alias, pub: key });
                            });
                            setTimeout(resolve, 3000);
                        });
                        
                        if (users.length === 0) { error("No users found in local cache."); return; }
                        
                        const csv = "Alias,Old_PubKey\n" + users.map(u => `${u.alias},${u.pub}`).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `user_directory_backup_${new Date().toISOString()}.csv`;
                        a.click();
                        success(`Exported ${users.length} users.`);
                    }}
                    className="w-full md:w-auto px-6 py-2 bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 border border-blue-900/50 rounded text-sm font-medium transition flex items-center justify-center gap-2"
                >
                    <Save className="w-4 h-4" />
                    Backup User Directory (CSV)
                </button>
            </div>
        </div>

        <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 mb-4">
            <h3 className="text-white font-medium mb-3">Bug Reports</h3>
            <p className="text-xs text-gray-500 mb-3">Export all bug reports sent to your inbox as a CSV file.</p>
            <button
                onClick={exportBugReports}
                className="w-full md:w-auto px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white border border-gray-600 rounded text-sm font-medium transition flex items-center justify-center gap-2"
            >
                <Bug className="w-4 h-4" /> Export CSV
            </button>
        </div>

        <div className="bg-gray-900 p-4 rounded-lg border border-gray-800">
            <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" /> 
                Account Migration
            </h3>
            <p className="text-xs text-gray-500 mb-4">
                Link an old account (lost keys) to a new account. Content will be merged on the new profile, and the old account will be hidden from search.
            </p>
            
            <form onSubmit={handleMigration} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-2 items-center">
                    <input 
                        type="text" 
                        value={migrationOldPub} 
                        onChange={e => setMigrationOldPub(e.target.value)}
                        placeholder="Old Public Key (Lost)"
                        className="w-full bg-black border border-gray-700 rounded p-2 text-white font-mono text-xs focus:border-blue-500 outline-none"
                    />
                    <div className="flex justify-center">
                        <ArrowRight className="text-gray-600 w-4 h-4 rotate-90 md:rotate-0" />
                    </div>
                    <input 
                        type="text" 
                        value={migrationNewPub} 
                        onChange={e => setMigrationNewPub(e.target.value)}
                        placeholder="New Public Key (Current)"
                        className="w-full bg-black border border-gray-700 rounded p-2 text-white font-mono text-xs focus:border-blue-500 outline-none"
                    />
                </div>

                <button 
                    type="submit" 
                    disabled={isMigrating || !migrationOldPub || !migrationNewPub}
                    className={`w-full py-2 rounded font-medium transition flex items-center justify-center gap-2 text-sm
                        ${isMigrating || !migrationOldPub || !migrationNewPub
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                >
                    {isMigrating && <Loader2 className="w-3 h-3 animate-spin" />}
                    {isMigrating ? 'Linking...' : 'Link Accounts'}
                </button>
            </form>
        </div>
      </section>
      )}
    </div>
  );
}

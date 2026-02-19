import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { User, Edit, List, Play, Pause, Music, Upload, Loader2, X, MapPin, Link as LinkIcon, Trash2, ShieldAlert, Eye, EyeOff, Shield } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useToast } from '../contexts/ToastContext';
import { uploadFile } from '../lib/upload';
import { fixUrl } from '../lib/url';
import { CollaboratorList } from '../components/ui/CollaboratorList';
import { Tooltip } from '../components/ui/Tooltip';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { UserProfile, Submission, FileRequest } from '../types';

export function Profile() {
  const { pub: routePub } = useParams<{ pub: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { gun, user, pubKey, isAdmin, userPair } = useGun(); // Destructure userPair
  const { play, currentTrack, isPlaying, pause } = usePlayer();
  const { success, error } = useToast();
  
  const targetPub = routePub || pubKey;
  const isOwnProfile = pubKey === targetPub;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'submissions' | 'requests'>('submissions');
  
  // Edit Mode
  const [isEditing, setIsEditing] = useState(false);
  const [editAlias, setEditAlias] = useState(''); // Immutable Username
  const [editDisplayName, setEditDisplayName] = useState(''); // Mutable Display Name
  const [editBio, setEditBio] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editLinks, setEditLinks] = useState<{label: string, url: string}[]>([]);
  const [editAvatar, setEditAvatar] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Track linked public keys for migration
  const linkedPubsRef = useRef(new Set<string>());

  useEffect(() => {
    if (searchParams.get('edit') === 'true' && isOwnProfile) {
        setIsEditing(true);
    }
  }, [searchParams, isOwnProfile]);

  useEffect(() => {
    if (!targetPub) return;
    setLoading(true);
    setProfile(null);
    setSubmissions([]);
    setRequests([]);
    
    // Check for Reverse Migration (Old Profile -> New Profile Redirect)
    // If this profile has been migrated, redirect to the new one.
    if (targetPub) {
        gun.get('migrations_reverse').get(targetPub).once((newPub: any) => {
            if (newPub && typeof newPub === 'string' && newPub !== targetPub) {
                console.log(`Redirecting migrated profile ${targetPub} -> ${newPub}`);
                navigate(`/profile/${newPub}`, { replace: true });
                return;
            }
        });
    }
    
    // Reset linked pubs
    linkedPubsRef.current = new Set([targetPub]);

    const profileNode = gun.get('all_users').get(targetPub); 
    // We will setup submission listeners dynamically
    const requestsNode = gun.get('file_requests');
    const migrationsNode = gun.get('migrations').get(targetPub);

    let isMounted = true; 
    const submissionListeners = new Map<string, { uploader: string; listener: (data: any, key: string) => void }>();
    const migrationListeners = new Set<string>();

    const profileListener = (data: any) => {
        if (!isMounted || !data) return;
        let parsedLinks = [];
        if (typeof data.links === 'string') {
            try { parsedLinks = JSON.parse(data.links); } catch (e) { parsedLinks = []; }
        } else if (Array.isArray(data.links)) { parsedLinks = data.links; }
        setProfile(currentProfile => {
            if (currentProfile && currentProfile.pub === targetPub) { 
                return { ...currentProfile, ...data, links: parsedLinks };
            }
            return { ...data, pub: targetPub, links: parsedLinks }; 
        });
        if (isEditing === false) { 
            setEditAlias(data.alias || '');
            setEditDisplayName(data.displayName || data.alias || '');
            setEditBio(data.bio || '');
            setEditLocation(data.location || '');
            setEditLinks(parsedLinks);
        }
    };
    profileNode.on(profileListener);

    // Helper to setup submission listener for ANY pub (target or migrated)
    const setupSubmissionListener = (sourcePub: string) => {
        if (migrationListeners.has(sourcePub)) return; // Prevent duplicate listeners
        migrationListeners.add(sourcePub);

        gun.user(sourcePub).get('submissions').map().on((refData: any, subId: string) => {
            if (!isMounted) return;

            // Determine uploader pub (default to sourcePub if refData is not a specific pointer)
            const uploader = (typeof refData === 'string' && refData.length > 1) ? refData : sourcePub;

            if (refData === null) { 
                setSubmissions(prev => prev.filter(s => s.id !== subId));
                const listenerInfo = submissionListeners.get(subId);
                if (listenerInfo) {
                    gun.user(listenerInfo.uploader).get('submissions').get(subId).off(); 
                    submissionListeners.delete(subId);
                }
            } else if (refData) { 
                const existingListenerInfo = submissionListeners.get(subId);
                if (!existingListenerInfo || existingListenerInfo.uploader !== uploader) {
                    if (existingListenerInfo) {
                        gun.user(existingListenerInfo.uploader).get('submissions').get(subId).off(); 
                    }

                    const subListener = (subData: any) => { 
                        if (!isMounted) return;

                        if (subData === null) { 
                            setSubmissions(prev => prev.filter(s => s.id !== subId));
                            const currentListenerInfo = submissionListeners.get(subId);
                            if (currentListenerInfo) {
                                gun.user(currentListenerInfo.uploader).get('submissions').get(subId).off(); 
                                submissionListeners.delete(subId);
                            }
                        } else if (subData && subData.title && subData.requestId) {
                            let parsedWaveform = subData.waveform;
                            if (typeof subData.waveform === 'string') {
                                try { parsedWaveform = JSON.parse(subData.waveform); } catch (e) { parsedWaveform = []; }
                            }
                            
                            const fetchAndSetSubmission = async () => {
                                if (!isMounted) return; 

                                const reqData = await new Promise<any>(resolve => gun.get('file_requests').get(subData.requestId).once(resolve));
                                let isHidden = subData.hiddenFromProfile;
                                if (isHidden === undefined && reqData && reqData.accessMode) {
                                    if (reqData.accessMode !== 'direct') { isHidden = true; }
                                }
                                const updatedSubmission = { ...subData, id: subId, waveform: parsedWaveform, hiddenFromProfile: isHidden };
                                
                                setSubmissions(prev => {
                                    const exists = prev.find(s => s.id === subId);
                                    if (exists) {
                                        return prev.map(s => s.id === subId ? updatedSubmission : s)
                                                    .sort((a, b) => b.createdAt - a.createdAt);
                                    } else {
                                        return [...prev, updatedSubmission]
                                                    .sort((a, b) => b.createdAt - a.createdAt);
                                    }
                                });
                            };
                            fetchAndSetSubmission();
                        }
                    };
                    gun.user(uploader).get('submissions').get(subId).on(subListener);
                    submissionListeners.set(subId, { uploader, listener: subListener });
                }
            }
        });
    };

    // 1. Setup listeners for Target Pub
    setupSubmissionListener(targetPub);

    // 2. Setup Migration Listener
    migrationsNode.map().on((isLinked: any, oldPub: string) => {
        if (!isMounted) return;
        if (isLinked && !linkedPubsRef.current.has(oldPub)) {
            console.log(`Found migrated account: ${oldPub}`);
            linkedPubsRef.current.add(oldPub);
            
            // Fetch submissions from old account
            setupSubmissionListener(oldPub);

            // Fetch requests from old account (via user graph fallback)
            gun.user(oldPub).get('requests').map().once((_: any, reqId: string) => {
                if (!reqId) return;
                gun.get('file_requests').get(reqId).once((data: any) => {
                   if (data && isMounted) {
                        setRequests(prev => {
                            const existingIndex = prev.findIndex(r => r.id === reqId);
                            const updatedRequest = { ...data, id: reqId };
                            if (existingIndex > -1) {
                                return prev.map((r, i) => (i === existingIndex ? updatedRequest : r));
                            } else {
                                return [...prev, updatedRequest].sort((a, b) => b.createdAt - a.createdAt);
                            }
                        });
                   }
                });
            });
        }
    });

    // 3. Global Requests Listener (filtered by owned/linked pubs)
    const requestsListener = (data: any, key: string) => {
        if (!isMounted) return;
        if (data === null) { 
            setRequests(prev => prev.filter(r => r.id !== key));
        } else if (data && (data.ownerPub === targetPub || linkedPubsRef.current.has(data.ownerPub))) {
            setRequests(prev => {
                const existingIndex = prev.findIndex(r => r.id === key);
                const updatedRequest = { ...data, id: key };

                if (existingIndex > -1) {
                    return prev.map((r, i) => (i === existingIndex ? updatedRequest : r));
                } else {
                    return [...prev, updatedRequest].sort((a, b) => b.createdAt - a.createdAt);
                }
            });
        }
    };
    requestsNode.map().on(requestsListener);

    profileNode.once(() => {
        if (isMounted) {
            setLoading(false); 
        }
    });

    return () => {
        isMounted = false; 
        profileNode.off(); 
        requestsNode.off(); 
        migrationsNode.off();

        submissionListeners.forEach((listenerInfo, subId) => {
            gun.user(listenerInfo.uploader).get('submissions').get(subId).off(); 
        });
        
        // Turn off listeners for all migrated pubs
        migrationListeners.forEach(pub => {
             gun.user(pub).get('submissions').off();
        });
    };

  }, [targetPub, gun, isEditing]);

  const handleSaveProfile = async () => {
      if (!isOwnProfile || !user) return;
      setIsSaving(true);
      
      try {
          let avatarUrl = profile?.avatarUrl;
          if (editAvatar) {
              // Ensure userPair is available for signing operations
              if (!userPair || !userPair.pub || !userPair.priv) {
                  error("Authentication error: Please log in again to save profile changes.");
                  console.error("Profile save failed: User pair (with private key) is not available.");
                  setIsSaving(false);
                  return;
              }
              const res = await uploadFile(editAvatar, userPair);
              avatarUrl = res.url;
          }
          
          const updates: any = {
              displayName: editDisplayName,
              bio: editBio,
              location: editLocation,
              links: JSON.stringify(editLinks),
              avatarUrl: avatarUrl || ''
          };
          
          // Update Public Profile
          gun.get('all_users').get(pubKey as string).put(updates);
          
          // Update Private Profile (Auth) if needed, but 'all_users' is the source of truth for directory.
          user.get('profile').put(updates); // Use proper 'profile' node structure
          
          setIsEditing(false);
          setEditAvatar(null);
          success("Profile updated successfully");
      } catch (e) {
          console.error("Failed to save profile", e);
          error("Failed to save profile");
      } finally {
          setIsSaving(false);
      }
  };
  
  const handleAddLink = () => {
      setEditLinks([...editLinks, { label: '', url: '' }]);
  };

  const handleRemoveLink = (index: number) => {
      setEditLinks(editLinks.filter((_, i) => i !== index));
  };

  const handleLinkChange = (index: number, field: 'label' | 'url', value: string) => {
      const newLinks = [...editLinks];
      newLinks[index] = { ...newLinks[index], [field]: value };
      setEditLinks(newLinks);
  };

  const executePromoteAdmin = async () => {
      if (!targetPub) return;
      setShowPromoteConfirm(false);

      try {
          await gun.get('all_users').get(targetPub).get('isAdmin').put(true);
          success("User promoted to Admin.");
          // Optimistic update
          setProfile(prev => prev ? { ...prev, isAdmin: true } : null);
      } catch (e) {
          console.error(e);
          error("Failed to promote user.");
      }
  };

  const executeAdminDelete = async () => {
      if (!targetPub) return;
      setShowDeleteConfirm(false);

      try {
          await gun.get('all_users').get(targetPub).put(null);
          success("User removed from directory.");
          navigate('/directory');
      } catch (e) {
          console.error(e);
          error("Failed to remove user.");
      }
  };

  const handleToggleVisibility = (e: React.MouseEvent, sub: Submission) => {
      e.stopPropagation();
      if (!isOwnProfile || !user || !sub.id) return;
      
      const newValue = !sub.hiddenFromProfile;
      
      // Update local state immediately for UI response
      setSubmissions(prev => prev.map(s => 
          s.id === sub.id ? { ...s, hiddenFromProfile: newValue } : s
      ));

      // Update GunDB
      user.get('submissions').get(sub.id).get('hiddenFromProfile').put(newValue);
  };

  const handleToggleRequestVisibility = (e: React.MouseEvent, req: FileRequest) => {
      e.stopPropagation();
      if (!isOwnProfile || !user || !req.id) return;
      
      // If hiddenFromProfile is undefined, calculate default state first to toggle correctly
      const currentHidden = req.hiddenFromProfile !== undefined 
          ? req.hiddenFromProfile 
          : (req.accessMode !== 'direct');

      const newValue = !currentHidden;
      
      // Update local state
      setRequests(prev => prev.map(r => 
          r.id === req.id ? { ...r, hiddenFromProfile: newValue } : r
      ));

      // Update GunDB (User's private requests node is source of truth for visibility preferences usually, 
      // but 'file_requests' is public. We should update the public node for this property so others see/don't see it.)
      // Note: 'file_requests' is global. Updating it there affects everyone. 
      // Profile visibility is usually a property of the *Reference* in the user's profile, but here we list by querying all requests.
      // So we must update the request object itself or the user's graph reference.
      // Since the query is `gun.get('file_requests').map()`, we update the request object.
      // Ideally, this should be a user-specific setting, but sticking to the current architecture:
      user.get('requests').get(req.id).get('hiddenFromProfile').put(newValue);
      gun.get('file_requests').get(req.id).get('hiddenFromProfile').put(newValue);
  };

  if (loading && !profile) {
      return <div className="p-8 text-center text-gray-500">Loading Profile...</div>;
  }

  if (!profile) {
      return <div className="p-8 text-center text-gray-500">User not found.</div>;
  }

  // Filter Submissions for View
  // Rule: Hidden if hiddenFromProfile is true.
  // Default: Hidden if request.accessMode !== 'direct' AND hiddenFromProfile is undefined.
  // We need request info for submissions.
  const visibleSubmissions = submissions.filter(s => {
      if (isOwnProfile) return true;
      if (s.hiddenFromProfile !== undefined) return !s.hiddenFromProfile;
      // If undefined, check accessMode logic (handled in fetch or here if we have request data)
      // Since we don't have request data easily linked here without fetching, 
      // we updated fetch logic to populate hiddenFromProfile based on request.
      return true; 
  });

  // Filter Requests for View
  const visibleRequests = requests.filter(r => {
      if (isOwnProfile) return true;
      if (r.hiddenFromProfile !== undefined) return !r.hiddenFromProfile;
      return r.accessMode === 'direct'; // Default: Hidden if not direct
  });

  return (
    <div className="max-w-5xl mx-auto pb-20">
        {/* Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 mb-8 relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-start">
                <div className="w-32 h-32 rounded-full border-4 border-gray-800 overflow-hidden bg-gray-700 flex-shrink-0">
                    {profile.avatarUrl ? (
                        <img src={fixUrl(profile.avatarUrl)} alt={profile.alias} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <User className="w-12 h-12" />
                        </div>
                    )}
                </div>
                
                <div className="flex-1 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-4 mb-2">
                        <h1 className="text-3xl font-bold text-white">
                            {profile.displayName || profile.alias}
                            {profile.displayName && profile.displayName !== profile.alias && (
                                <span className="text-lg text-gray-500 font-normal ml-2">@{profile.alias}</span>
                            )}
                        </h1>
                        {isOwnProfile && (
                            <button 
                                onClick={() => setIsEditing(true)}
                                className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-full hover:bg-gray-700 transition"
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                        )}
                        {isAdmin && !isOwnProfile && !profile.isAdmin && (
                            <Tooltip content="Promote to Admin">
                                <button 
                                    onClick={() => setShowPromoteConfirm(true)}
                                    className="p-2 text-green-400 hover:text-green-200 bg-green-900/20 rounded-full hover:bg-green-900/40 border border-green-900/50 transition"
                                >
                                    <Shield className="w-4 h-4" />
                                </button>
                            </Tooltip>
                        )}
                        {isAdmin && !isOwnProfile && (
                            <Tooltip content="Remove from Directory">
                                <button 
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="p-2 text-red-400 hover:text-red-200 bg-red-900/20 rounded-full hover:bg-red-900/40 border border-red-900/50 transition"
                                >
                                    <ShieldAlert className="w-4 h-4" />
                                </button>
                            </Tooltip>
                        )}
                    </div>
                    
                    {profile.location && (
                        <div className="flex items-center justify-center md:justify-start gap-2 text-gray-400 mb-2">
                            <MapPin className="w-4 h-4" />
                            <span>{profile.location}</span>
                        </div>
                    )}

                    <p className="text-gray-400 max-w-xl mx-auto md:mx-0 mb-4 whitespace-pre-wrap">{profile.bio || "No bio yet."}</p>
                    
                    {profile.links && profile.links.length > 0 && (
                        <div className="flex flex-wrap gap-3 justify-center md:justify-start mb-6">
                            {profile.links.map((link, i) => (
                                <a 
                                    key={i} 
                                    href={link.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-blue-400 px-3 py-1.5 rounded-full transition"
                                >
                                    <LinkIcon className="w-3 h-3" />
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    )}
                    
                    <div className="flex items-center justify-center md:justify-start gap-6 text-sm text-gray-500">
                        <div className="flex flex-col items-center md:items-start">
                            <span className="text-white font-bold text-lg">{visibleSubmissions.length}</span>
                            <span>Submissions</span>
                        </div>
                        <div className="flex flex-col items-center md:items-start">
                            <span className="text-white font-bold text-lg">{visibleRequests.length}</span>
                            <span>Requests</span>
                        </div>
                        {profile.joinedAt && (
                            <div className="flex flex-col items-center md:items-start ml-4 pl-4 border-l border-gray-800">
                                <span className="text-gray-300">{new Date(profile.joinedAt).getFullYear()}</span>
                                <span>Joined</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-gray-800 mb-6">
            <button 
                onClick={() => setActiveTab('submissions')}
                className={`pb-4 text-sm font-medium transition relative ${activeTab === 'submissions' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
                Submissions
                {activeTab === 'submissions' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500"></div>}
            </button>
            <button 
                onClick={() => setActiveTab('requests')}
                className={`pb-4 text-sm font-medium transition relative ${activeTab === 'requests' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
                Hosted Requests
                {activeTab === 'requests' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500"></div>}
            </button>
        </div>

        {/* Content */}
        {activeTab === 'submissions' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleSubmissions.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 border border-gray-800 border-dashed rounded-lg">
                        <Music className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        No submissions yet.
                    </div>
                )}
                {visibleSubmissions.map(sub => (
                    <div key={sub.id} className={`bg-gray-900 border border-gray-800 rounded-lg p-4 group hover:border-gray-700 transition relative ${sub.hiddenFromProfile ? 'opacity-60 border-dashed' : ''}`}>
                        {isOwnProfile && (
                            <button 
                                onClick={(e) => handleToggleVisibility(e, sub)}
                                className="absolute top-2 right-2 p-1.5 bg-gray-800 text-gray-400 hover:text-white rounded-full z-10 opacity-0 group-hover:opacity-100 transition"
                                title={sub.hiddenFromProfile ? "Show on Profile" : "Hide from Profile"}
                            >
                                {sub.hiddenFromProfile ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        )}
                        <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-gray-800 rounded overflow-hidden flex-shrink-0 relative">
                                {sub.artworkUrl ? (
                                    <img src={sub.artworkUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600"><Music className="w-6 h-6" /></div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                    <button 
                                        onClick={() => {
                                             if (currentTrack?.id === sub.id && isPlaying) pause();
                                             else play(sub, visibleSubmissions);
                                        }}
                                        className="text-white hover:scale-110 transition"
                                    >
                                        {currentTrack?.id === sub.id && isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                                    </button>
                                </div>
                             </div>
                             <div className="min-w-0">
                                 <h3 className="text-white font-medium truncate">{sub.title}</h3>
                                 <CollaboratorList 
                                    uploaderPub={sub.uploaderPub!} 
                                    submissionId={sub.id}
                                    byline={sub.byline} 
                                    collaborators={sub.collaborators} 
                                    className="text-gray-500 text-xs truncate"
                                 />
                             </div>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {activeTab === 'requests' && (
            <div className="space-y-2">
                 {visibleRequests.length === 0 && (
                    <div className="py-12 text-center text-gray-500 border border-gray-800 border-dashed rounded-lg">
                        <List className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        No requests hosted yet.
                    </div>
                )}
                {visibleRequests.map(req => {
                    const isHidden = req.hiddenFromProfile !== undefined ? req.hiddenFromProfile : (req.accessMode !== 'direct');
                    
                    return (
                    <div key={req.id} className={`group relative bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between hover:bg-gray-800/50 hover:border-blue-500/50 transition ${isHidden ? 'opacity-60 border-dashed' : ''}`}>
                         {isOwnProfile && (
                            <button 
                                onClick={(e) => handleToggleRequestVisibility(e, req)}
                                className="absolute top-2 right-2 p-1.5 bg-gray-800 text-gray-400 hover:text-white rounded-full z-10 opacity-0 group-hover:opacity-100 transition"
                                title={isHidden ? "Show on Profile" : "Hide from Profile"}
                            >
                                {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        )}
                        <Link to={`/request/${req.id}`} className="flex-1 min-w-0 mr-8">
                            <div>
                                <h3 className="text-white font-bold group-hover:text-blue-400 transition">{req.title}</h3>
                                <p className="text-gray-500 text-sm line-clamp-1">{req.description}</p>
                            </div>
                        </Link>
                    </div>
                    );
                })}
            </div>
        )}

        {/* Edit Modal */}
        {isEditing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-white">Edit Profile</h2>
                        <button onClick={() => setIsEditing(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="flex justify-center mb-4">
                             <div className="relative w-24 h-24 rounded-full bg-gray-800 border-2 border-dashed border-gray-600 flex items-center justify-center overflow-hidden hover:border-white transition cursor-pointer">
                                 <input 
                                    type="file" 
                                    accept="image/*"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={e => setEditAvatar(e.target.files?.[0] || null)}
                                 />
                                 {editAvatar ? (
                                     <img src={URL.createObjectURL(editAvatar)} className="w-full h-full object-cover" />
                                 ) : profile.avatarUrl ? (
                                     <img src={fixUrl(profile.avatarUrl)} className="w-full h-full object-cover" />
                                 ) : (
                                     <Upload className="w-6 h-6 text-gray-500" />
                                 )}
                             </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Username (Immutable)</label>
                            <input 
                                type="text" 
                                value={editAlias}
                                readOnly
                                className="w-full bg-gray-900/50 border border-gray-700/50 rounded p-2 text-gray-400 cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                            <input 
                                type="text" 
                                value={editDisplayName}
                                onChange={e => setEditDisplayName(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                                placeholder="e.g. CryptoMusician"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Bio</label>
                            <textarea 
                                value={editBio}
                                onChange={e => setEditBio(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none h-24"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Location</label>
                            <input 
                                type="text" 
                                value={editLocation}
                                onChange={e => setEditLocation(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                                placeholder="e.g. New York, NY"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">External Links</label>
                            <div className="space-y-3">
                                {editLinks.map((link, i) => (
                                    <div key={i} className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={link.label}
                                            onChange={e => handleLinkChange(i, 'label', e.target.value)}
                                            className="w-1/3 bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none"
                                            placeholder="Label"
                                        />
                                        <input 
                                            type="text" 
                                            value={link.url}
                                            onChange={e => handleLinkChange(i, 'url', e.target.value)}
                                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none"
                                            placeholder="URL"
                                        />
                                        <button 
                                            onClick={() => handleRemoveLink(i)}
                                            className="p-2 text-red-500 hover:bg-red-900/20 rounded-lg transition"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <button 
                                    onClick={handleAddLink}
                                    className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                                >
                                    + Add Link
                                </button>
                            </div>
                        </div>
                        
                        <button 
                            onClick={handleSaveProfile}
                            disabled={isSaving}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-semibold flex items-center justify-center gap-2 mt-4"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        <ConfirmModal 
            isOpen={showPromoteConfirm}
            title="Promote to Admin?"
            message={`Are you sure you want to promote ${profile.alias} to Admin? They will have full access to manage content and users.`}
            confirmLabel="Promote"
            onConfirm={executePromoteAdmin}
            onCancel={() => setShowPromoteConfirm(false)}
        />

        <ConfirmModal 
            isOpen={showDeleteConfirm}
            title="Remove from Directory?"
            message={`Are you sure you want to remove ${profile.alias} from the directory? This hides them from search but preserves their history.`}
            confirmLabel="Remove User"
            isDestructive={true}
            onConfirm={executeAdminDelete}
            onCancel={() => setShowDeleteConfirm(false)}
        />
    </div>
  );
}

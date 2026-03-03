import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { User, Edit, List, Play, Pause, Music, Upload, Loader2, X, MapPin, Link as LinkIcon, Trash2, ShieldAlert, Eye, EyeOff, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext'; // Replaced useGun
import { usePlayer } from '../contexts/PlayerContext';
import { useToast } from '../contexts/ToastContext';
import { uploadToR2 } from '../lib/r2'; // Replaced uploadFile
import { db } from '../lib/firebase'; // Added firebase db import
import { doc, updateDoc, collection, query, where, getDocs, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'; // Added specific firestore functions
import { fixUrl } from '../lib/url';
import { getTimestampAsNumber } from '../lib/utils';
import { CollaboratorList } from '../components/ui/CollaboratorList';
import { Tooltip } from '../components/ui/Tooltip';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { UserProfile, Submission, FileRequest } from '../types';

export function Profile() {
  const { pub: routePub } = useParams<{ pub: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAdmin, participantEmail: authParticipantEmail } = useAuth(); // Replaced useGun context
  const { play, currentTrack, isPlaying, pause } = usePlayer();
  const { success, error } = useToast();
  
  const targetUid = routePub || user?.uid; // Changed pubKey to user?.uid and targetPub to targetUid

  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  const isOwnProfile = targetUid ? (user?.uid === targetUid || (profile?.email === authParticipantEmail)) : true;
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'submissions' | 'requests'>('submissions');
  
  const [resolvedProfileUid, setResolvedProfileUid] = useState<string | null>(null);
  
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
  
  // Track linked public keys for migration (not used for Firebase)
  // const linkedPubsRef = useRef(new Set<string>()); // Removed - not needed for Firebase directly

  useEffect(() => {
    if (searchParams.get('edit') === 'true' && isOwnProfile) {
        setIsEditing(true);
    }
  }, [searchParams, isOwnProfile]);

  useEffect(() => {
    setResolvedProfileUid(null); // Reset resolved UID on dependency change
    if (!targetUid && !authParticipantEmail) {
      setLoading(false); // No UID or email, so nothing to load
      return;
    }
    
    // Helper to resolve UID
    const resolve = async () => {
        if (targetUid) {
            // 1. Try Direct ID
            const directDoc = await getDoc(doc(db, 'profiles', targetUid));
            if (directDoc.exists()) {
                setResolvedProfileUid(targetUid);
                return;
            }

            // 2. Try Legacy Gun Pub Key
            const qLegacy = query(collection(db, 'profiles'), where('migratedFromGunPub', '==', targetUid));
            const legacySnap = await getDocs(qLegacy);
            if (!legacySnap.empty) {
                setResolvedProfileUid(legacySnap.docs[0].id);
                return;
            }

            // Not found
            setResolvedProfileUid(targetUid); // Fallback to let the snapshot listener confirm 404
        } else if (authParticipantEmail) {
            // 3. Try Email
            const q = query(collection(db, 'profiles'), where('email', '==', authParticipantEmail));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                setResolvedProfileUid(snapshot.docs[0].id);
            } else {
                setLoading(false);
            }
        }
    };

    resolve().catch(e => {
        console.error("Error resolving profile:", e);
        setLoading(false);
    });

  }, [targetUid, authParticipantEmail]);

      const [submissionsByUid, setSubmissionsByUid] = useState<Submission[]>([]);
      const [submissionsByEmail, setSubmissionsByEmail] = useState<Submission[]>([]);
      const [submissionsAsCollaborator, setSubmissionsAsCollaborator] = useState<Submission[]>([]);
      
      const [requestsByUid, setRequestsByUid] = useState<FileRequest[]>([]);
      const [requestsByOwnerEmail, setRequestsByOwnerEmail] = useState<FileRequest[]>([]);
      const [requestsByHostEmail, setRequestsByHostEmail] = useState<FileRequest[]>([]);
  
      // Profile Listener
      useEffect(() => {
          if (!resolvedProfileUid) {
              setProfile(null);
              setSubmissions([]); // Clear derived state if needed, though separate states handle data
              setRequests([]);
              setLoading(false);
              return;
          }
  
          setLoading(true);
          // Note: We don't clear profile immediately to avoid flicker if it's just a re-render, 
          // but if UID changes, we should. For now, rely on loading state.
  
          let isMounted = true;
          
          const profileDocRef = doc(db, 'profiles', resolvedProfileUid);
          const unsubscribe = onSnapshot(profileDocRef, (docSnap) => {
              if (!isMounted) return;
              if (docSnap.exists()) {
                  const data = docSnap.data() as UserProfile;
                  setProfile(currentProfile => {
                      if (currentProfile && currentProfile.uid === resolvedProfileUid) {
                          return { ...currentProfile, ...data, uid: docSnap.id };
                      }
                      return { ...data, uid: docSnap.id };
                  });
                  if (isEditing === false) { 
                      setEditAlias(data.alias || '');
                      setEditDisplayName(data.displayName || data.alias || '');
                      setEditBio(data.bio || '');
                      setEditLocation(data.location || '');
                      setEditLinks(data.links || []);
                  }
              } else {
                  setProfile(null);
              }
              if (isMounted) setLoading(false); 
          });
  
          return () => {
              isMounted = false;
              unsubscribe();
          };
      }, [resolvedProfileUid, isEditing]);
  
      // Combine Submissions
      useEffect(() => {
          const combined = new Map<string, Submission>();
          submissionsByUid.forEach(s => combined.set(s.id!, s));
          submissionsByEmail.forEach(s => combined.set(s.id!, s));
          submissionsAsCollaborator.forEach(s => combined.set(s.id!, s));
          
          setSubmissions(Array.from(combined.values())
              .sort((a, b) => ((b.createdAt as number) || 0) - ((a.createdAt as number) || 0)));
      }, [submissionsByUid, submissionsByEmail, submissionsAsCollaborator]);
  
      // Combine Requests
      useEffect(() => {
          const combined = new Map<string, FileRequest>();
          requestsByUid.forEach(r => combined.set(r.id!, r));
          requestsByOwnerEmail.forEach(r => combined.set(r.id!, r));
          requestsByHostEmail.forEach(r => combined.set(r.id!, r));
          
          setRequests(Array.from(combined.values())
              .sort((a, b) => ((b.createdAt as number) || 0) - ((a.createdAt as number) || 0)));
      }, [requestsByUid, requestsByOwnerEmail, requestsByHostEmail]);
  
      // Submissions Listeners
      useEffect(() => {
          if (!resolvedProfileUid && !profile?.email) return;
  
          const unsubs: (() => void)[] = [];
  
                  // 1. By UID
                  if (resolvedProfileUid) {
                      const qUid = query(
                          collection(db, 'submissions'),
                          where('uploaderUid', '==', resolvedProfileUid)
                      );
                      unsubs.push(onSnapshot(qUid, (snapshot) => {
                          const res: Submission[] = [];
                          snapshot.forEach(doc => {
                              const data = doc.data();
                              if (data.deleted) return;
                              res.push({ id: doc.id, ...data, createdAt: getTimestampAsNumber(data.createdAt) } as Submission);
                          });
                          setSubmissionsByUid(res);
                      }));
                  }
          
                  // 2. By Email
                  if (profile?.email) {
                      const qEmail = query(
                          collection(db, 'submissions'),
                          where('uploaderEmail', '==', profile.email)
                      );
                      unsubs.push(onSnapshot(qEmail, (snapshot) => {
                          const res: Submission[] = [];
                          snapshot.forEach(doc => {
                              const data = doc.data();
                              if (data.deleted) return;
                              res.push({ id: doc.id, ...data, createdAt: getTimestampAsNumber(data.createdAt) } as Submission);
                          });
                          setSubmissionsByEmail(res);
                      }));
                  }  

                  // 3. As Collaborator (By UID)
                  if (resolvedProfileUid) {
                      const qCollab = query(
                          collection(db, 'submissions'),
                          where(`collaborators.${resolvedProfileUid}`, '==', true)
                      );
                      unsubs.push(onSnapshot(qCollab, (snapshot) => {
                          const res: Submission[] = [];
                          snapshot.forEach(doc => {
                              const data = doc.data();
                              if (data.deleted) return;
                              res.push({ id: doc.id, ...data, createdAt: getTimestampAsNumber(data.createdAt) } as Submission);
                          });
                          setSubmissionsAsCollaborator(res);
                      }));
                  }
          return () => unsubs.forEach(u => u());
      }, [resolvedProfileUid, profile?.email]);
  
      // Requests Listeners
      useEffect(() => {
          if (!resolvedProfileUid && !profile?.email) return;
  
          const unsubs: (() => void)[] = [];
  
                  // 1. By Owner UID
                  if (resolvedProfileUid) {
                      const qUid = query(
                          collection(db, 'requests'),
                          where('ownerPub', '==', resolvedProfileUid)
                      );
                      unsubs.push(onSnapshot(qUid, (snapshot) => {
                          const res: FileRequest[] = [];
                          snapshot.forEach(doc => {
                              const data = doc.data();
                              if (data.deleted) return;
                              res.push({ id: doc.id, ...data, createdAt: getTimestampAsNumber(data.createdAt) } as FileRequest);
                          });
                          setRequestsByUid(res);
                      }));
                  }
          
                  // 2. By Owner Email
                  if (profile?.email) {
                      const qOwnerEmail = query(
                          collection(db, 'requests'),
                          where('ownerEmail', '==', profile.email)
                      );
                      unsubs.push(onSnapshot(qOwnerEmail, (snapshot) => {
                          const res: FileRequest[] = [];
                          snapshot.forEach(doc => {
                              const data = doc.data();
                              if (data.deleted) return;
                              res.push({ id: doc.id, ...data, createdAt: getTimestampAsNumber(data.createdAt) } as FileRequest);
                          });
                          setRequestsByOwnerEmail(res);
                      }));
          
                       // 3. By Host Email
                      const qHostEmail = query(
                          collection(db, 'requests'),
                          where('hostEmail', '==', profile.email)
                      );
                      unsubs.push(onSnapshot(qHostEmail, (snapshot) => {
                          const res: FileRequest[] = [];
                          snapshot.forEach(doc => {
                              const data = doc.data();
                              if (data.deleted) return;
                              res.push({ id: doc.id, ...data, createdAt: getTimestampAsNumber(data.createdAt) } as FileRequest);
                          });
                          setRequestsByHostEmail(res);
                      }));
                  }  
          return () => unsubs.forEach(u => u());
      }, [resolvedProfileUid, profile?.email]);
  const handleSaveProfile = async () => {
      if (!isOwnProfile || !resolvedProfileUid) return;
      setIsSaving(true);
      
      try {
          let avatarUrl = profile?.avatarUrl;
          if (editAvatar) {
              const res = await uploadToR2(editAvatar); // Use uploadToR2
              avatarUrl = res.url;
          }
          
          const updates: Partial<UserProfile> = {
              alias: editAlias,
              displayName: editDisplayName,
              bio: editBio,
              location: editLocation,
              links: editLinks, // Firebase handles arrays directly
              avatarUrl: avatarUrl || '',
              updatedAt: serverTimestamp()
          };
          
          // Update Profile in Firestore
          await updateDoc(doc(db, 'profiles', resolvedProfileUid), updates);
          
          setIsEditing(false);
          setEditAvatar(null);
          success("Profile updated successfully");
      } catch (e) {
          console.error("Failed to save profile", e);
          error("Failed to save profile: " + (e as Error).message);
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
      if (!targetUid) return; // Changed targetPub to targetUid
      setShowPromoteConfirm(false);

      try {
          await updateDoc(doc(db, 'profiles', targetUid), { isAdmin: true }); // Firebase update
          success("User promoted to Admin.");
          setProfile(prev => prev ? { ...prev, isAdmin: true } : null);
      } catch (e) {
          console.error(e);
          error("Failed to promote user: " + (e as Error).message);
      }
  };

  const executeAdminDelete = async () => {
      if (!targetUid) return; // Changed targetPub to targetUid
      setShowDeleteConfirm(false);

      try {
          await updateDoc(doc(db, 'profiles', targetUid), { deleted: true, deletedAt: serverTimestamp() }); // Soft delete in Firebase
          success("User removed from directory.");
          navigate('/directory');
      } catch (e) {
          console.error(e);
          error("Failed to remove user: " + (e as Error).message);
      }
  };

  const handleToggleVisibility = async (e: React.MouseEvent, sub: Submission) => { // Made async
      e.stopPropagation();
      if (!isOwnProfile || !sub.id) return;
      
      const newValue = !sub.hiddenFromProfile;
      
      setSubmissions(prev => prev.map(s => 
          s.id === sub.id ? { ...s, hiddenFromProfile: newValue } : s
      ));

      try {
          // Update global submissions collection
          await updateDoc(doc(db, 'submissions', sub.id), { hiddenFromProfile: newValue, updatedAt: serverTimestamp() });
          success("Submission visibility updated.");
      } catch (err) {
          console.error("Failed to toggle submission visibility:", err);
          error("Failed to update submission visibility.");
      }
  };

  const handleToggleRequestVisibility = async (e: React.MouseEvent, req: FileRequest) => { // Made async
      e.stopPropagation();
      if (!isOwnProfile || !req.id) return;
      
      const currentHidden = req.hiddenFromProfile !== undefined 
          ? req.hiddenFromProfile 
          : (req.accessMode !== 'direct');

      const newValue = !currentHidden;
      
      setRequests(prev => prev.map(r => 
          r.id === req.id ? { ...r, hiddenFromProfile: newValue } : r
      ));

      try {
          // Update requests collection
          await updateDoc(doc(db, 'requests', req.id), { hiddenFromProfile: newValue, updatedAt: serverTimestamp() });
          success("Request visibility updated.");
      } catch (err) {
          console.error("Failed to toggle request visibility:", err);
          error("Failed to update request visibility.");
      }
  };

  if (loading && !profile) {
      return <div className="p-8 text-center text-gray-500">Loading Profile...</div>;
  }

  if (!profile) {
      return <div className="p-8 text-center text-gray-500">User not found.</div>;
  }

  // Filter Submissions for View
  const visibleSubmissions = submissions.filter(s => {
      if (isOwnProfile) return true;
      if (s.hiddenFromProfile !== undefined) return !s.hiddenFromProfile;
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
                        <div className="flex flex-col items-center md:items-start ml-4 pl-4 border-l border-gray-800">
                            <span className="text-blue-400 font-bold text-lg">{profile.points || 0}</span>
                            <span>Participation</span>
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
                                 <CollaboratorList 
                                    uploaderPub={sub.uploaderUid || sub.originalUploaderPub} 
                                    uploaderEmail={sub.uploaderEmail}
                                    byline={sub.byline} 
                                    collaborators={sub.collaborators} 
                                    className="text-white font-bold truncate"
                                 />
                                 <p className="text-gray-500 text-xs truncate">{sub.title}</p>
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
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
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
                                    accept="image/jpeg,image/png,image/webp,image/gif"
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
                            <label className="block text-sm text-gray-400 mb-1">Username (Alias)</label>
                            <input 
                                type="text" 
                                value={editAlias}
                                onChange={e => setEditAlias(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
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
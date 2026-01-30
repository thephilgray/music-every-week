import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { User, Edit, List, Play, Pause, Music, Upload, Loader2, X, MapPin, Link as LinkIcon, Trash2 } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useToast } from '../contexts/ToastContext';
import { uploadFile } from '../lib/upload';
import type { UserProfile, Submission, FileRequest } from '../types';

export function Profile() {
  const { pub: routePub } = useParams<{ pub: string }>();
  const [searchParams] = useSearchParams();
  const { gun, user, pubKey } = useGun();
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

    // 1. Fetch Profile
    gun.get('all_users').get(targetPub).on((data: any) => {
        if (data) {
            let parsedLinks = [];
            if (typeof data.links === 'string') {
                try {
                    parsedLinks = JSON.parse(data.links);
                } catch (e) {
                    parsedLinks = [];
                }
            } else if (Array.isArray(data.links)) {
                parsedLinks = data.links;
            }

            setProfile({ ...data, pub: targetPub, links: parsedLinks });
            if (isEditing === false) { // Don't overwrite if editing
                setEditAlias(data.alias || '');
                setEditDisplayName(data.displayName || data.alias || '');
                setEditBio(data.bio || '');
                setEditLocation(data.location || '');
                setEditLinks(parsedLinks);
            }
            setLoading(false);
        }
    });

    // 2. Fetch Submissions (from user's public list)
    gun.get('all_users').get(targetPub).get('submissions').map().on((data: any, key: string) => {
        if (data) {
            const subId = key;
            
            gun.user(targetPub).get('submissions').get(subId).once((subData: any) => {
                if (subData && subData.title) {
                     setSubmissions(prev => {
                        const exists = prev.find(s => s.id === subId);
                        if (exists) return prev;
                        
                        let parsedWaveform = subData.waveform;
                        if (typeof subData.waveform === 'string') {
                            try {
                                parsedWaveform = JSON.parse(subData.waveform);
                            } catch (e) {
                                parsedWaveform = [];
                            }
                        }
                        
                        return [...prev, { ...subData, id: subId, waveform: parsedWaveform }];
                    });
                }
            });
        }
    });

    // 3. Fetch Requests (Global Scan - Filter by Owner)
    gun.get('file_requests').map().on((data: any, key: string) => {
        if (data && data.ownerPub === targetPub) {
            setRequests(prev => {
                const exists = prev.find(r => r.id === key);
                if (exists) return prev;
                return [...prev, { ...data, id: key }].sort((a, b) => b.createdAt - a.createdAt);
            });
        }
    });

  }, [targetPub, gun]);

  const handleSaveProfile = async () => {
      if (!isOwnProfile || !user) return;
      setIsSaving(true);
      
      try {
          let avatarUrl = profile?.avatarUrl;
          if (editAvatar) {
              const res = await uploadFile(editAvatar, (user as any).is);
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

  if (loading && !profile) {
      return <div className="p-8 text-center text-gray-500">Loading Profile...</div>;
  }

  if (!profile) {
      return <div className="p-8 text-center text-gray-500">User not found.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">
        {/* Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 mb-8 relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-start">
                <div className="w-32 h-32 rounded-full border-4 border-gray-800 overflow-hidden bg-gray-700 flex-shrink-0">
                    {profile.avatarUrl ? (
                        <img src={profile.avatarUrl} alt={profile.alias} className="w-full h-full object-cover" />
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
                            <span className="text-white font-bold text-lg">{submissions.length}</span>
                            <span>Submissions</span>
                        </div>
                        <div className="flex flex-col items-center md:items-start">
                            <span className="text-white font-bold text-lg">{requests.length}</span>
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
                {submissions.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 border border-gray-800 border-dashed rounded-lg">
                        <Music className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        No submissions yet.
                    </div>
                )}
                {submissions.map(sub => (
                    <div key={sub.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 group hover:border-gray-700 transition">
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
                                             else play(sub, submissions);
                                        }}
                                        className="text-white hover:scale-110 transition"
                                    >
                                        {currentTrack?.id === sub.id && isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                                    </button>
                                </div>
                             </div>
                             <div className="min-w-0">
                                 <h3 className="text-white font-medium truncate">{sub.title}</h3>
                                 <p className="text-gray-500 text-xs truncate">{sub.byline || sub.uploaderPub?.substring(0,8)}</p>
                             </div>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {activeTab === 'requests' && (
            <div className="space-y-2">
                 {requests.length === 0 && (
                    <div className="py-12 text-center text-gray-500 border border-gray-800 border-dashed rounded-lg">
                        <List className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        No requests hosted yet.
                    </div>
                )}
                {requests.map(req => (
                    <Link to={`/request/${req.id}`} key={req.id} className="block group">
                        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between hover:bg-gray-800/50 hover:border-blue-500/50 transition">
                            <div>
                                <h3 className="text-white font-bold group-hover:text-blue-400 transition">{req.title}</h3>
                                <p className="text-gray-500 text-sm line-clamp-1">{req.description}</p>
                            </div>
                        </div>
                    </Link>
                ))}
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
                                     <img src={profile.avatarUrl} className="w-full h-full object-cover" />
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
    </div>
  );
}

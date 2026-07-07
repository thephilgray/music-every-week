import { useState, useEffect, useRef } from 'react';
import { User, Save, Trash2, Shield, Loader2, Upload, Users, Music, Globe, LayoutDashboard, Settings as SettingsIcon, ChevronRight, Sliders, ArrowUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { uploadToR2 } from '../lib/r2';
import { fixUrl } from '../lib/url';
import { db } from '../lib/firebase';
import { doc, updateDoc, onSnapshot, serverTimestamp, query, where, collection, getDocs, orderBy, setDoc } from 'firebase/firestore';
import type { UserProfile, GlobalFeatureConfig } from '../types';
import { LandingPageEditor } from '../components/LandingPageEditor';
import { DashboardEditor } from '../components/DashboardEditor';
import { useGlobalFeatures } from '../hooks/useGlobalFeatures';

export function Settings() {
  const { user, isAdmin, participantEmail } = useAuth();
  const { success, error } = useToast();
  const { features } = useGlobalFeatures();
  
  const [resolvedUid, setResolvedUid] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
        setResolvedUid(user.uid);
    } else if (participantEmail) {
        const normalizedEmail = participantEmail.toLowerCase();
        const q = query(
            collection(db, 'profiles'), 
            where('email', 'in', Array.from(new Set([participantEmail, normalizedEmail])))
        );
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
  const [initialProfile, setInitialProfile] = useState<{
    username: string;
    displayName: string;
    bio: string;
    location: string;
    links: {label: string, url: string}[];
  } | null>(null);

  // Privacy State
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [showRequestsOnProfile, setShowRequestsOnProfile] = useState(true);
  const [showSubmissionsOnProfile, setShowSubmissionsOnProfile] = useState(true);

  // Content Preferences
  const [filterAI, setFilterAI] = useState(false);

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
                setInitialProfile({
                  username: data.alias || '',
                  displayName: data.displayName || data.alias || '',
                  bio: data.bio || '',
                  location: data.location || '',
                  links: data.links || []
                });
                
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
      setInitialProfile({ username, displayName, bio, location, links });
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

  const handleToggleGlobalFeature = async (featureKey: keyof GlobalFeatureConfig, currentValue: boolean) => {
      const newValue = !currentValue;
      try {
          const configRef = doc(db, 'config', 'global');
          await setDoc(configRef, {
              [featureKey]: newValue,
              updatedAt: serverTimestamp(),
              updatedBy: user?.uid || 'admin'
          }, { merge: true });
          success(`Feature ${newValue ? 'enabled' : 'disabled'} globally.`);
      } catch (e) {
          console.error("Failed to update global config", e);
          error("Failed to update global setting.");
      }
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

  const hasProfileChanges = !!avatar || (initialProfile ? (
      username !== initialProfile.username ||
      displayName !== initialProfile.displayName ||
      bio !== initialProfile.bio ||
      location !== initialProfile.location ||
      JSON.stringify(links) !== JSON.stringify(initialProfile.links)
  ) : false);

  const navSections = [
    { id: 'profile', label: 'Profile Settings', icon: User, category: 'user' },
    { id: 'content', label: 'Content Preferences', icon: Music, category: 'user' },
    { id: 'privacy', label: 'Privacy & Permissions', icon: Shield, category: 'user' },
    ...(isAdmin ? [
      { id: 'community', label: 'Community Pool', icon: Users, category: 'global', badge: 'Global' },
      { id: 'admin-config', label: 'Global Features', icon: Sliders, category: 'global', badge: 'Global' },
      { id: 'landing-editor', label: 'Landing Page', icon: Globe, category: 'global', badge: 'Global' },
      { id: 'dashboard-editor', label: 'Dashboard Home', icon: LayoutDashboard, category: 'global', badge: 'Global' },
    ] : [])
  ];

  const [activeSection, setActiveSection] = useState<string>('profile');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((e) => e.isIntersecting);
        if (visibleEntries.length > 0) {
          visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActiveSection(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: '-10% 0px -60% 0px',
        threshold: 0
      }
    );

    navSections.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isAdmin]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-12 p-4 sm:pb-24 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-8 border-b border-gray-800/80 pb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-blue-500 animate-pulse" />
          Settings & Preferences
        </h1>
        <p className="text-gray-400 text-sm sm:text-base mt-2">
          Manage your profile, account visibility, and system preferences.
        </p>
      </div>

      {/* Mobile & Tablet Horizontal Pill Navigation */}
      <div className="lg:hidden sticky top-0 z-30 bg-gray-950/85 backdrop-blur-xl border-b border-gray-800/80 py-3 -mx-4 px-4 sm:-mx-6 sm:px-6 mb-8 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-lg shadow-black/40">
        {navSections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          const isGlobalCat = section.category === 'global';
          return (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={`px-3.5 py-2 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                isActive 
                  ? (isGlobalCat ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-semibold' : 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold')
                  : (isGlobalCat ? 'bg-purple-950/40 text-purple-300 border border-purple-800/50 hover:bg-purple-900/50' : 'bg-gray-900 text-gray-400 border border-gray-800 hover:text-white hover:bg-gray-800')
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{section.label}</span>
              {isGlobalCat && !isActive && (
                <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold">Global</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start relative">
        {/* Desktop Floating Side Navigation */}
        <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-6 z-20 self-start">
          <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-800/80 rounded-2xl p-4 shadow-2xl shadow-black/50 overflow-hidden relative group">
            {/* Subtle top glow line */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
            
            <div className="mb-4 px-3 py-1.5 flex items-center justify-between border-b border-gray-800/60 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Navigation</span>
              <span className="text-[11px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                {navSections.length} Sections
              </span>
            </div>

            <nav className="space-y-6">
              {/* User Category */}
              <div className="space-y-1">
                <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  User Settings
                </div>
                {navSections.filter(s => s.category === 'user').map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-between group/btn relative ${
                        isActive 
                          ? 'bg-gradient-to-r from-blue-600/20 to-blue-500/10 text-white shadow-sm border border-blue-500/40 font-semibold' 
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 inset-y-2 w-1 bg-blue-500 rounded-r-full shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                      )}
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 transition-transform duration-200 group-hover/btn:scale-110 ${isActive ? 'text-blue-400' : 'text-gray-500 group-hover/btn:text-gray-300'}`} />
                        <span>{section.label}</span>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 transition-all duration-200 ${isActive ? 'text-blue-400 translate-x-0.5 opacity-100' : 'text-gray-600 opacity-0 group-hover/btn:opacity-100'}`} />
                    </button>
                  );
                })}
              </div>

              {/* Global Category */}
              {isAdmin && (
                <div className="space-y-1 pt-4 border-t border-gray-800/80">
                  <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-purple-400/80 mb-2 flex items-center justify-between">
                    <span>Global Settings</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                  </div>
                  {navSections.filter(s => s.category === 'global').map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-between group/btn relative ${
                          isActive 
                            ? 'bg-gradient-to-r from-purple-600/20 to-purple-500/10 text-white shadow-sm border border-purple-500/40 font-semibold' 
                            : 'text-purple-300/70 hover:text-purple-200 hover:bg-purple-900/20 border border-transparent'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 inset-y-2 w-1 bg-purple-500 rounded-r-full shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                        )}
                        <div className="flex items-center gap-3">
                          <Icon className={`w-4 h-4 transition-transform duration-200 group-hover/btn:scale-110 ${isActive ? 'text-purple-400' : 'text-purple-400/60 group-hover/btn:text-purple-300'}`} />
                          <span>{section.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded">
                            Global
                          </span>
                          <ChevronRight className={`w-3.5 h-3.5 transition-all duration-200 ${isActive ? 'text-purple-400 translate-x-0.5 opacity-100' : 'text-purple-500/40 opacity-0 group-hover/btn:opacity-100'}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </nav>

            {/* Scroll to Top Quick Action inside Sidebar */}
            <div className="mt-6 pt-4 border-t border-gray-800/80 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Quick Actions</span>
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  const mainEl = document.querySelector('main');
                  if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 bg-gray-800/60 hover:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700/60 transition-all duration-150 shadow-sm hover:shadow"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Top</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Sections Area */}
        <div className="flex-1 min-w-0 space-y-8 w-full">
          <section id="profile" className="scroll-mt-20 lg:scroll-mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-7 shadow-xl shadow-black/20">
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
                        accept="image/jpeg,image/png,image/webp,image/gif"
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
                    disabled={isSavingProfile || !hasProfileChanges}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
                >
                    {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Profile
                </button>
            </div>
          </section>

          {/* Content Preferences */}
          <section id="content" className="scroll-mt-20 lg:scroll-mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-7 shadow-xl shadow-black/20">
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
          <section id="privacy" className="scroll-mt-20 lg:scroll-mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-7 shadow-xl shadow-black/20">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                Privacy & Permissions
            </h2>
            
            <div className="space-y-6">
                <div className="flex items-center justify-between gap-x-4">
                    <div>
                        <label className="text-white font-medium block">Show Hosted Prompts on Profile</label>
                        <p className="text-gray-400 text-xs">List your hosted prompts on your public profile page.</p>
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

          {/* Community Section (Global) */}
          {isAdmin && (
          <section id="community" className="scroll-mt-20 lg:scroll-mt-8 bg-gradient-to-br from-purple-950/20 via-gray-900 to-gray-900 border border-purple-500/30 rounded-2xl p-5 sm:p-7 shadow-xl shadow-black/20">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-500" />
                Community Pool & Role Settings
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

                {isAdmin && (
                <div className="flex items-center justify-between border-t border-gray-800 pt-4 gap-x-4">
                    <div>
                        <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                            Host Prompts
                        </h3>
                        <p className="text-xs text-gray-400">
                            Enable the ability to create new prompts and invite others.
                        </p>
                    </div>
                    <button 
                        onClick={handleToggleHost}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${isHost ? 'bg-purple-600' : 'bg-gray-600'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isHost ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                )}
            </div>
          </section>
          )}

          {/* Global Config Section */}
          {isAdmin && (
          <section id="admin-config" className="scroll-mt-20 lg:scroll-mt-8 bg-gradient-to-br from-purple-950/20 via-gray-900 to-gray-900 border border-purple-500/30 rounded-2xl p-5 sm:p-7 shadow-xl shadow-black/20">
            <h2 className="text-xl font-semibold text-purple-300 mb-6 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-purple-400" />
                Global Configuration & Features
            </h2>
            
            <div className="space-y-6">
                {/* Feature Toggles */}
                <div className="flex items-center justify-between gap-x-4">
                    <div>
                        <h3 className="text-white font-medium mb-1">Live / Party Hub</h3>
                        <p className="text-xs text-purple-200/70">
                            Enable or disable live listening sessions and watch parties in the navigation.
                        </p>
                    </div>
                    <button 
                        onClick={() => handleToggleGlobalFeature('live', features.live)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${features.live ? 'bg-purple-600' : 'bg-gray-600'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${features.live ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                <div className="flex items-center justify-between border-t border-purple-500/20 pt-4 gap-x-4">
                    <div>
                        <h3 className="text-white font-medium mb-1">Community Feed & Events</h3>
                        <p className="text-xs text-purple-200/70">
                            Enable or disable the global Community page in the navigation.
                        </p>
                    </div>
                    <button 
                        onClick={() => handleToggleGlobalFeature('community', features.community)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${features.community ? 'bg-purple-600' : 'bg-gray-600'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${features.community ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {features.community && (
                    <>
                    <div className="flex items-center justify-between pl-6 border-l-2 border-purple-500/40 gap-x-4">
                        <div>
                            <h3 className="text-white font-medium mb-1 text-sm">↳ Activity Feed Tab</h3>
                            <p className="text-xs text-purple-200/70">
                                Show or hide the Activity Feed tab inside the Community page.
                            </p>
                        </div>
                        <button 
                            onClick={() => handleToggleGlobalFeature('activityFeed', features.activityFeed)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${features.activityFeed ? 'bg-purple-600' : 'bg-gray-600'}`}
                        >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${features.activityFeed ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between pl-6 border-l-2 border-purple-500/40 gap-x-4">
                        <div>
                            <h3 className="text-white font-medium mb-1 text-sm">↳ Events Calendar Tab</h3>
                            <p className="text-xs text-purple-200/70">
                                Show or hide the Events Calendar tab inside the Community page.
                            </p>
                        </div>
                        <button 
                            onClick={() => handleToggleGlobalFeature('eventsCalendar', features.eventsCalendar)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${features.eventsCalendar ? 'bg-purple-600' : 'bg-gray-600'}`}
                        >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${features.eventsCalendar ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                        </button>
                    </div>
                    </>
                )}

                <div className="flex items-center justify-between border-t border-purple-500/20 pt-4 gap-x-4">
                    <div>
                        <h3 className="text-white font-medium mb-1">Member Directory</h3>
                        <p className="text-xs text-purple-200/70">
                            Enable or disable the Member Directory in the navigation.
                        </p>
                    </div>
                    <button 
                        onClick={() => handleToggleGlobalFeature('directory', features.directory)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${features.directory ? 'bg-purple-600' : 'bg-gray-600'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${features.directory ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                <div className="flex items-center justify-between border-t border-purple-500/20 pt-4 gap-x-4">
                    <div>
                        <h3 className="text-white font-medium mb-1">Global Player Normalization</h3>
                        <p className="text-xs text-purple-200/70">
                            When enabled, the player will automatically adjust track volumes to a standard loudness (-14 LUFS). 
                            Turn this off globally if users report issues with playback volume.
                        </p>
                    </div>
                    <button 
                        onClick={() => handleToggleGlobalFeature('playerNormalization', features.playerNormalization)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${features.playerNormalization ? 'bg-purple-600' : 'bg-gray-600'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${features.playerNormalization ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                
                <div className="flex items-center justify-between border-t border-purple-500/20 pt-4 gap-x-4">
                    <div>
                        <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                            Download Bug Reports
                        </h3>
                        <p className="text-xs text-purple-200/70">
                            Download a CSV of all bug reports submitted by users.
                        </p>
                    </div>
                    <button 
                        onClick={handleDownloadBugReports}
                        className="bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 border border-purple-500/50 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition"
                    >
                        <Upload className="w-4 h-4" /> 
                        Download CSV
                    </button>
                </div>
            </div>
          </section>
          )}

          {/* Global Landing Page Editor Section */}
          {isAdmin && (
          <section id="landing-editor" className="scroll-mt-20 lg:scroll-mt-8 bg-gradient-to-br from-purple-950/20 via-gray-900 to-gray-900 border border-purple-500/30 rounded-2xl p-5 sm:p-7 shadow-xl shadow-black/20">
            <LandingPageEditor />
          </section>
          )}

          {/* Global Dashboard Editor Section */}
          {isAdmin && (
          <section id="dashboard-editor" className="scroll-mt-20 lg:scroll-mt-8 bg-gradient-to-br from-purple-950/20 via-gray-900 to-gray-900 border border-purple-500/30 rounded-2xl p-5 sm:p-7 shadow-xl shadow-black/20">
            <DashboardEditor />
          </section>
          )}
        </div>
      </div>
    </div>
  );
}
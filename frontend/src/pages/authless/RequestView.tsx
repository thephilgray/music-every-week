import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { doc, getDoc, collection, addDoc, query, where, getDocs, updateDoc } from 'firebase/firestore'; // Firebase functions
import { Loader2, ArrowRight, UserCircle, Clock } from 'lucide-react'; // Lucide icons
import { AuthlessLogin } from './components/AuthlessLogin';
import { AuthlessComments } from './components/AuthlessComments';
import { AuthlessSubmissionForm } from './components/AuthlessSubmissionForm';
import { ArtworkDisplay } from '../../components/ui/ArtworkDisplay';
import { uploadToR2 } from '../../lib/r2';
import type { Submission } from '../../types'; // Re-use types if possible, or cast

interface RequestData {
  id: string;
  title: string;
  description: string;
  deadline: string;
  accessList: string[];
  playlistId: string;
  artworkUrl?: string;
  hostSecret?: string;
  hostEmail?: string;
}

interface UserProfile {
  id?: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
}

export function RequestView() {
  const { id } = useParams<{ id: string }>();
  
  const [loading, setLoading] = useState(true);
  const [requestData, setRequestData] = useState<RequestData | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(sessionStorage.getItem('mew_auth_email'));
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [extendedDeadline, setExtendedDeadline] = useState<string | null>(null);
  const [userSubmission, setUserSubmission] = useState<Submission | null>(null); // NEW STATE

  // Load Request Data
  useEffect(() => {
    async function loadRequest() {
      if (!id) return;
      setLoading(true);
      try {
        const docRef = doc(db, 'requests', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setRequestData({ id: docSnap.id, ...docSnap.data() } as RequestData);
        } else {
          setError('Request not found');
        }
      } catch (err) {
        console.error("Error fetching request:", err);
        setError('Failed to load request');
      } finally {
        setLoading(false);
      }
    }
    loadRequest();
  }, [id]);

  // Process Extension Token
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const extToken = searchParams.get('ext_token');
    if (extToken && requestData) {
      async function fetchExtension() {
        try {
          const tokenDoc = await getDoc(doc(db, 'extension_tokens', extToken as string));
          if (tokenDoc.exists()) {
            const tokenData = tokenDoc.data();
            if (tokenData.requestId === id) {
              const originalDeadline = new Date(requestData!.deadline);
              const extendedMs = originalDeadline.getTime() + tokenData.hours * 60 * 60 * 1000;
              setExtendedDeadline(new Date(extendedMs).toISOString().slice(0, 16)); // Format for datetime-local
            } else {
              console.warn("Extension token not for this request.");
            }
          } else {
            console.warn("Extension token not found.");
          }
        } catch (err) {
          console.error("Error fetching extension token:", err);
        }
      }
      fetchExtension();
    }
  }, [searchParams, requestData, id]);

  // Auto-login Host
  useEffect(() => {
      if (requestData?.hostEmail && !currentUserEmail) {
          const unsubscribe = auth.onAuthStateChanged(user => {
              if (user?.email && user.email.toLowerCase() === requestData.hostEmail?.toLowerCase()) {
                  sessionStorage.setItem('mew_auth_email', user.email);
                  setCurrentUserEmail(user.email);
              }
          });
          return () => unsubscribe();
      }
  }, [requestData, currentUserEmail]);

  // Load User Submission if logged in and requestData is available
  useEffect(() => {
    async function loadUserSubmission() {
      if (!id || !currentUserEmail || !requestData) {
        setUserSubmission(null); // Clear submission if dependencies are missing
        return;
      }

      try {
        const q = query(
          collection(db, 'submissions'),
          where('requestId', '==', id),
          where('uploaderEmail', '==', currentUserEmail)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const docSnap = querySnapshot.docs[0];
          setUserSubmission({ id: docSnap.id, ...docSnap.data() } as Submission);
        } else {
          setUserSubmission(null);
        }
      } catch (err) {
        console.error("Error fetching user submission:", err);
        // Optionally set an error state for submission loading
      }
    }
    loadUserSubmission();
  }, [id, currentUserEmail, requestData]); // Dependencies: re-run if these change

  // Load User Profile if logged in
  useEffect(() => {
    async function loadProfile() {
      if (!currentUserEmail) return;
      
      const q = query(collection(db, 'profiles'), where('email', '==', currentUserEmail));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        setUserProfile({ id: docSnap.id, ...docSnap.data() } as UserProfile);
      } else {
        // Create default profile if not exists
        const newProfile = { email: currentUserEmail, displayName: '' };
        const docRef = await addDoc(collection(db, 'profiles'), newProfile);
        setUserProfile({ id: docRef.id, ...newProfile });
      }
    }
    loadProfile();
  }, [currentUserEmail]);

  const handleLogin = (email: string) => {
    if (!requestData) return;
    
    // Check if email is in access list (case insensitive trim)
    const normalizedEmail = email.toLowerCase().trim();
    const isAllowed = requestData.accessList.some(e => e.toLowerCase().trim() === normalizedEmail);
    const isHost = (sessionStorage.getItem('mew_host_secret') === requestData.hostSecret) || 
                   (requestData.hostEmail && requestData.hostEmail.toLowerCase() === normalizedEmail);

    if (isAllowed || isHost) {
      sessionStorage.setItem('mew_auth_email', normalizedEmail);
      setCurrentUserEmail(normalizedEmail);
      setError(null);
    } else {
      setError('Access denied: Email not on the list.');
    }
  };

  const handleUpdateProfile = async (displayName: string, bio: string) => {
      if (!currentUserEmail || !userProfile?.id) return;
      
      try {
        const docRef = doc(db, 'profiles', userProfile.id);
        await updateDoc(docRef, { displayName, bio });
        setUserProfile({ ...userProfile, displayName, bio });
      } catch (err) {
        console.error("Error updating profile:", err);
      }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !userProfile?.id) return;

      setIsUploadingAvatar(true);
      try {
          const { url } = await uploadToR2(file);
          const docRef = doc(db, 'profiles', userProfile.id);
          await updateDoc(docRef, { avatarUrl: url });
          setUserProfile({ ...userProfile, avatarUrl: url });
      } catch (err) {
          console.error("Avatar upload failed", err);
          alert("Failed to upload avatar");
      } finally {
          setIsUploadingAvatar(false);
      }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <Loader2 className="animate-spin w-12 h-12 text-blue-500" />
      </div>
    );
  }

  if (error && !currentUserEmail) { // Show error only if not logged in (e.g. 404)
     return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
            <h1 className="text-4xl font-bold mb-4 text-red-500">Error</h1>
            <p className="text-xl text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!currentUserEmail && requestData) {
    return (
      <AuthlessLogin 
        onLogin={handleLogin} 
        error={error || undefined}
      />
    );
  }

  if (!requestData) return null;

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        {/* Header / Banner */}
        <div className="flex flex-col md:flex-row gap-8 mb-10">
            <div className="w-full md:w-48 md:h-48 rounded-lg overflow-hidden flex-shrink-0 border border-gray-700 mx-auto">
                <ArtworkDisplay
                    src={requestData.artworkUrl}
                    alt="Request Artwork"
                    className="w-full h-full object-cover"
                />
            </div>
            
            <div className="text-center md:text-left">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{requestData.title}</h1>
                
                <p className={`text-gray-300 text-lg mb-4 whitespace-pre-wrap transition-all ${isDescriptionExpanded ? '' : 'line-clamp-3'}`}>
                    {requestData.description}
                </p>
                {requestData.description && requestData.description.length > 150 && (
                    <button 
                        type="button"
                        onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                        className="text-blue-400 hover:text-blue-300 text-sm font-medium mb-4 focus:outline-none"
                    >
                        {isDescriptionExpanded ? 'Show Less' : 'Read Prompt / Show More'}
                    </button>
                )}
                
                <div className="flex flex-col md:flex-row items-center gap-2 md:gap-6 text-sm text-gray-400 mb-6 justify-center md:justify-start">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>
                            Due: {new Date(extendedDeadline || requestData.deadline).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
                        </span>
                    </div>
                </div>
            </div>        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Main Content Area */}
          <div className="md:col-span-2 space-y-8">
              {/* Submission Area */}
              <AuthlessSubmissionForm 
                requestId={requestData.id}
                playlistId={requestData.playlistId}
                currentUserEmail={currentUserEmail!}
                userProfileId={userProfile?.id}
                deadline={extendedDeadline || requestData.deadline}
                submission={userSubmission} // Pass the user's submission
              />

                                      {/* Comments Section */}

                                      <AuthlessComments 

                                          requestId={requestData.id} 

                                          submissionId={null} // Pass null for request-level comments

                                          currentUserEmail={currentUserEmail!}

                                          userProfile={userProfile || undefined}

                                      />          </div>

          {/* Sidebar / Profile */}
          <div className="space-y-6">
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <UserCircle className="w-5 h-5 text-purple-400" />
                      Your Profile
                  </h2>
                  {userProfile ? (
                      <div className="space-y-4">
                          <div className="flex items-center gap-3">
                              <label className="relative cursor-pointer group">
                                  <div className="w-12 h-12 bg-purple-900 rounded-full flex items-center justify-center text-purple-200 text-lg font-bold overflow-hidden border border-purple-700 group-hover:border-purple-500 transition">
                                      {isUploadingAvatar ? (
                                          <Loader2 className="w-5 h-5 animate-spin" />
                                      ) : userProfile.avatarUrl ? (
                                          <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                      ) : (
                                          userProfile.displayName?.[0]?.toUpperCase() || userProfile.email[0].toUpperCase()
                                      )}
                                  </div>
                                  <input 
                                      type="file" 
                                      className="hidden" 
                                      accept="image/*"
                                      onChange={handleAvatarUpload}
                                      disabled={isUploadingAvatar}
                                  />
                                  <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center text-[8px] uppercase tracking-tighter text-white font-bold transition">
                                      Edit
                                  </div>
                              </label>
                              <div className="flex-1 min-w-0">
                                  <input 
                                      type="text" 
                                      className="bg-transparent border-b border-gray-700 focus:border-purple-500 outline-none text-white font-medium w-full transition"
                                      value={userProfile.displayName || ''}
                                      onChange={(e) => handleUpdateProfile(e.target.value, userProfile.bio || '')}
                                      placeholder="Display Name"
                                  />
                                  <p className="text-xs text-gray-500 truncate">{currentUserEmail}</p>
                              </div>
                          </div>
                          <textarea 
                              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-purple-500 outline-none resize-none transition"
                              rows={3}
                              placeholder="Add a bio..."
                              value={userProfile.bio || ''}
                              onChange={(e) => handleUpdateProfile(userProfile.displayName || '', e.target.value)}
                          />
                      </div>
                  ) : (
                      <Loader2 className="animate-spin mx-auto text-gray-500" />
                  )}
              </div>

               <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-lg font-bold mb-2">Links</h2>
                  <a href={`/p/${requestData.playlistId}`} className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition text-sm">
                      View Playlist <ArrowRight className="w-4 h-4" />
                  </a>
              </div>
          </div>

        </div>
      </div>
    </div>
  );
}
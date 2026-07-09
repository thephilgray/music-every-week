import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Music, Image as ImageIcon, Loader2, Users, Mic, Square, Trash2, Search, UserCheck, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { uploadToR2 } from '../lib/r2';
import { analyzeAudio } from '../lib/audio';
import { MiniPlayer } from './ui/MiniPlayer';
import { ConfirmModal } from './ui/ConfirmModal';
import { Tooltip } from './ui/Tooltip';
import type { Submission, UserProfile } from '../types';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, query, where, getDocs, increment } from 'firebase/firestore';

interface SubmitTrackProps {
  requestId: string;
  participants?: Record<string, { status: 'pending' | 'accepted', alias?: string, email?: string }>;
  existingSubmission?: Submission;
  onClose: () => void;
  onSuccess: (submission?: Submission) => void;
  accessMode?: string;
}

export function SubmitTrack({ requestId, participants, existingSubmission, onClose, onSuccess }: SubmitTrackProps) {
  const { user, participantEmail, isAdmin, addPoints } = useAuth();
  const [title, setTitle] = useState('');
  const [byline, setByline] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false); // Default: Not Anonymous (Linked)
  const [lyrics, setLyrics] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>(''); // Added for better feedback
  const [error, setError] = useState<string | null>(null);
  
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  
  // Admin Proxy
  const [proxyUser, setProxyUser] = useState<UserProfile | null>(null);
  const [proxySearch, setProxySearch] = useState('');
  const [proxyResults, setProxyResults] = useState<UserProfile[]>([]);
  const [proxyAlias, setProxyAlias] = useState(''); // Fallback for legacy/non-existent users
  
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [collabNames, setCollabNames] = useState<Record<string, string>>({}); // New state for names
  const [collabSearch, setCollabSearch] = useState('');
  const [collabResults, setCollabResults] = useState<UserProfile[]>([]);
  const [requestAccessList, setRequestAccessList] = useState<string[]>([]);

  // Load Request Access List
  useEffect(() => {
      const fetchAccessList = async () => {
          try {
              const reqDoc = await getDoc(doc(db, 'requests', requestId));
              if (reqDoc.exists()) {
                  const data = reqDoc.data();
                  setRequestAccessList(data.accessList || []);
              }
          } catch (e) {
              console.error("Error fetching request access list:", e);
          }
      };
      fetchAccessList();
  }, [requestId]);

  // Search for proxy user
  useEffect(() => {
    if (!isAdmin || proxySearch.length < 2) {
        setProxyResults([]);
        return;
    }

    const search = async () => {
        try {
            const term = proxySearch.trim();
            const termLower = term.toLowerCase();
            const variations = Array.from(new Set([
                term,
                termLower,
                term.charAt(0).toUpperCase() + term.slice(1).toLowerCase(),
                term.toUpperCase()
            ]));

            const queries = variations.flatMap(v => [
                query(collection(db, 'profiles'), where('alias', '>=', v), where('alias', '<=', v + '\uf8ff')),
                query(collection(db, 'profiles'), where('displayName', '>=', v), where('displayName', '<=', v + '\uf8ff')),
                query(collection(db, 'profiles'), where('email', '>=', v.toLowerCase()), where('email', '<=', v.toLowerCase() + '\uf8ff'))
            ]);

            const snapshots = await Promise.all(queries.map(q => getDocs(q)));
            
            const resultsMap = new Map<string, UserProfile>();
            const processSnap = (snap: any) => {
                snap.forEach((d: any) => {
                    const profile = { uid: d.id, ...d.data() } as UserProfile;
                    const matchesSearch = (profile.alias && profile.alias.toLowerCase().includes(termLower)) ||
                                          (profile.displayName && profile.displayName.toLowerCase().includes(termLower)) ||
                                          (profile.email && profile.email.toLowerCase().includes(termLower));
                    if (matchesSearch) {
                        resultsMap.set(d.id, profile);
                    }
                });
            };

            snapshots.forEach(processSnap);
            
            setProxyResults(Array.from(resultsMap.values()).slice(0, 5));
        } catch (e) {
            console.error("Proxy search failed", e);
        }
    };

    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [proxySearch, isAdmin]);

  // Search for collaborators
  useEffect(() => {
      if (collabSearch.length < 2) {
          setCollabResults([]);
          return;
      }

      const search = async () => {
          try {
              const term = collabSearch.trim();
              const termLower = term.toLowerCase();
              const variations = Array.from(new Set([
                  term,
                  termLower,
                  term.charAt(0).toUpperCase() + term.slice(1).toLowerCase(),
                  term.toUpperCase()
              ]));

              const queries = variations.flatMap(v => [
                  query(collection(db, 'profiles'), where('alias', '>=', v), where('alias', '<=', v + '\uf8ff')),
                  query(collection(db, 'profiles'), where('displayName', '>=', v), where('displayName', '<=', v + '\uf8ff'))
              ]);

              const snapshots = await Promise.all(queries.map(q => getDocs(q)));
              
              const resultsMap = new Map<string, UserProfile>();
              
              // Check in-memory participants first
              if (participants) {
                  Object.entries(participants).forEach(([uid, data]) => {
                      const isSelf = uid === user?.uid || (data.email && data.email === participantEmail);
                      if (isSelf) return;
                      if (data.alias && data.alias.toLowerCase().includes(termLower)) {
                          resultsMap.set(uid, {
                              uid,
                              alias: data.alias,
                              displayName: data.alias,
                              email: data.email || ''
                          } as UserProfile);
                      }
                  });
              }

              const processSnap = (snap: any) => {
                  snap.forEach((d: any) => {
                      const profile = { uid: d.id, ...d.data() } as UserProfile;
                      const isSelf = profile.uid === user?.uid || (profile.email && profile.email === participantEmail);
                      if (isSelf) return;

                      const matchesSearch = (profile.alias && profile.alias.toLowerCase().includes(termLower)) ||
                                            (profile.displayName && profile.displayName.toLowerCase().includes(termLower));
                      if (!matchesSearch) return;

                      const hasJoined = participants && !!participants[profile.uid];
                      const isInvited = profile.email && requestAccessList.includes(profile.email);
                      
                      if (hasJoined || isInvited || isAdmin) {
                          resultsMap.set(profile.uid, profile);
                      }
                  });
              };

              snapshots.forEach(processSnap);
              
              setCollabResults(Array.from(resultsMap.values()));
          } catch (e) {
              console.error("Collab search failed", e);
          }
      };

      const timer = setTimeout(search, 300);
      return () => clearTimeout(timer);
  }, [collabSearch, requestAccessList, participants, user?.uid, participantEmail, isAdmin]);

  // Load data (Edit Mode or Defaults)
  const [stage, setStage] = useState('First Draft / Demo');
  const [feedbackFocus, setFeedbackFocus] = useState<string[]>([]);
  const [doesNotUseAI, setDoesNotUseAI] = useState(true);
  const [isFragile, setIsFragile] = useState(false);

  // Audio Recording
  const [step, setStep] = useState<number>(() => existingSubmission ? 2 : 1);
  const [stepTransitioning, setStepTransitioning] = useState(false);
  const [audioType, setAudioType] = useState<'upload' | 'record'>('upload');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedPreview, setRecordedPreview] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Load data (Edit Mode or Defaults)
  useEffect(() => {
    // Lock Body Scroll
    document.body.style.overflow = 'hidden';
    
    // Hide Root to prevent z-index fighting/flashing on mobile
    const root = document.getElementById('root');
    if (root) root.style.visibility = 'hidden';
    
    if (existingSubmission) {
        setTitle(existingSubmission.title);
        setByline(existingSubmission.byline || '');
        
        // Load Anonymous state (Inverse of linkProfile)
        if (existingSubmission.linkProfile !== undefined) {
            setIsAnonymous(!existingSubmission.linkProfile);
        } else {
            setIsAnonymous(false); // Default to linked if undefined
        }

        setLyrics(existingSubmission.lyrics || '');
        setStage(existingSubmission.stage || 'First Draft / Demo');
        if (existingSubmission.usesAI) setDoesNotUseAI(false);
        if (existingSubmission.fragile) setIsFragile(true);
        
        if (existingSubmission.proxyFor) {
            if (typeof existingSubmission.proxyFor === 'string') {
                setProxyAlias(existingSubmission.proxyFor);
            } else if (existingSubmission.proxyFor.alias) {
                setProxyAlias(existingSubmission.proxyFor.alias);
            }
        }
        
        // If it was a proxy submission, try to resolve the original uploader as the proxy user
        if (isAdmin && existingSubmission.uploaderUid && existingSubmission.uploaderUid !== user?.uid) {
            const fetchProxyUser = async () => {
                const pDoc = await getDoc(doc(db, 'profiles', existingSubmission.uploaderUid!));
                if (pDoc.exists()) {
                    setProxyUser({ uid: pDoc.id, ...pDoc.data() } as UserProfile);
                }
            };
            fetchProxyUser();
        }

        // Load Collaborators
        let rawCollabs = existingSubmission.collaborators || {};
        
        // Parse if it's a string (New flattened format handling)
        if (typeof rawCollabs === 'string') {
            try {
                rawCollabs = JSON.parse(rawCollabs);
            } catch (e) {
                console.warn("Failed to parse collaborators JSON:", e);
                rawCollabs = {};
            }
        }

        const directKeys = Object.keys(rawCollabs).filter(k => k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#'));
        
        if (directKeys.length > 0) {
            setCollaborators(directKeys);
            // Fetch names for existing collaborators
            directKeys.forEach(async (uid) => {
                try {
                    const pDoc = await getDoc(doc(db, 'profiles', uid));
                    if (pDoc.exists()) {
                        const pData = pDoc.data();
                        setCollabNames(prev => ({ ...prev, [uid]: pData.displayName || pData.alias || uid }));
                    }
                } catch (e) {
                    console.error("Error fetching collab name:", e);
                }
            });
        }
        
        let parsedFocus: string[] = [];
        if (existingSubmission.feedbackFocus) {
            if (typeof existingSubmission.feedbackFocus === 'string') {
                try { parsedFocus = JSON.parse(existingSubmission.feedbackFocus); } catch(e) {}
            } else if (Array.isArray(existingSubmission.feedbackFocus)) {
                parsedFocus = existingSubmission.feedbackFocus;
            }
        }
        setFeedbackFocus(parsedFocus);
    } 
    
    return () => {
        document.body.style.overflow = 'unset';
        if (root) root.style.visibility = 'visible';
    };
  }, [existingSubmission, isAdmin, user?.uid]);

  const toggleCollaborator = (userOrPub: string, name?: string) => {
    if (collaborators.includes(userOrPub)) {
      setCollaborators(collaborators.filter(p => p !== userOrPub));
    } else {
      setCollaborators([...collaborators, userOrPub]);
      if (name) {
          setCollabNames(prev => ({ ...prev, [userOrPub]: name }));
      }
    }
  };

  const removeCollaborator = (uid: string) => {
      setCollaborators(prev => prev.filter(c => c !== uid));
  };

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'audio/webm'; // Fallback
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const file = new File([audioBlob], `recorded-track.${mimeType.split('/')[1].split(';')[0]}`, { type: mimeType });
        setAudioFile(file);
        
        const url = URL.createObjectURL(audioBlob);
        setRecordedPreview(url);
        
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
    }
  };

  const cancelRecording = () => {
      setAudioFile(null);
      setRecordedPreview(null);
      setIsRecording(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!audioFile && !existingSubmission) || !title) {
        setError("Title and Audio file are required.");
        return;
    }
    
    if (!user && !participantEmail) {
        setError("Authentication error: Please log in again to submit or update a track.");
        return;
    }

    setIsUploading(true);
    setError(null);

    try {
        let audioUrlStr = existingSubmission?.audioUrl || '';
        let waveformData = existingSubmission?.waveform || [];
        let volumeAdjustmentDb = existingSubmission?.volumeAdjustmentDb || 0;
        
        // 1. Handle Audio (New Upload or Keep Existing)
        if (audioFile) {
            setUploadStep('Analyzing & Uploading...');
            
            // Run analysis and upload in parallel
            const analysisPromise = (async () => {
                try {
                    const analysisResult = await analyzeAudio(audioFile);
                    return analysisResult;
                } catch (e) {
                    console.warn("Audio analysis failed", e);
                    return { waveform: [], volumeAdjustmentDb: 0 };
                }
            })();

            const uploadPromise = uploadToR2(audioFile);

            const [analysisResult, uploadResult] = await Promise.all([analysisPromise, uploadPromise]);
            
            waveformData = analysisResult.waveform;
            volumeAdjustmentDb = analysisResult.volumeAdjustmentDb;
            audioUrlStr = uploadResult.url;
        }

        // 2. Handle Art (New Upload or Keep Existing)
        let artworkUrlStr = existingSubmission?.artworkUrl || '';
        if (artFile) {
            setUploadStep('Uploading artwork...');
            const { url } = await uploadToR2(artFile);
            artworkUrlStr = url;
        }

        // 3. Prepare Data for Firestore
        setUploadStep('Saving details...');
        const collaboratorsMap: Record<string, boolean> = {};
        collaborators.forEach(c => collaboratorsMap[c] = true);

        // Determine final byline
        let finalByline = byline.trim();
        if (isAnonymous) {
            if (!finalByline) finalByline = 'Anonymous';
        } else {
             if (!finalByline) finalByline = ''; 
        }

        const linkProfile = !isAnonymous;

        // uploaderIdentifier and uploaderUid logic
        let uploaderEmailToStore = (user ? user.email : participantEmail) || null;
        if (uploaderEmailToStore) uploaderEmailToStore = uploaderEmailToStore.toLowerCase();
        
        let uploaderUidToStore = user?.uid || null;
        let isProxy = false;

        if (isAdmin && (proxyUser || proxyAlias)) {
            isProxy = true;
            if (proxyUser) {
                uploaderUidToStore = proxyUser.uid;
                uploaderEmailToStore = proxyUser.email?.toLowerCase() || null;
            } else {
                // Legacy behavior: keep admin as uploader, but mark as proxy for name
                uploaderUidToStore = user?.uid || null;
                uploaderEmailToStore = user?.email?.toLowerCase() || null;
            }
        }

        const submissionData: any = { 
            requestId,
            title,
            byline: finalByline,
            linkProfile,
            lyrics: String(lyrics || ''),
            audioUrl: audioUrlStr,
            artworkUrl: artworkUrlStr,
            uploaderEmail: uploaderEmailToStore,
            uploaderUid: uploaderUidToStore,
            collaborators: collaboratorsMap, 
            waveform: waveformData,
            volumeAdjustmentDb,
            stage,
            feedbackFocus: feedbackFocus,
            usesAI: !doesNotUseAI,
            fragile: isFragile,
            proxyFor: isProxy ? (proxyUser ? { alias: proxyUser.displayName || proxyUser.alias, uid: proxyUser.uid } : { alias: proxyAlias }) : null
        };

        if (existingSubmission && existingSubmission.id) {
            // Update
             await updateDoc(doc(db, 'submissions', existingSubmission.id), {
                ...submissionData,
                updatedAt: serverTimestamp()
             });

             // Send notifications to NEW collaborators
             const existingCollabs = Object.keys(existingSubmission.collaborators || {}).filter(k => k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#'));
             const newCollabs = collaborators.filter(c => !existingCollabs.includes(c));
             
             if (newCollabs.length > 0) {
                 const notificationPromises = newCollabs.map(async (collabUid) => {
                     try {
                         const profileDoc = await getDoc(doc(db, 'profiles', collabUid));
                         if (profileDoc.exists()) {
                             const profileData = profileDoc.data();
                             const recipientEmail = profileData.email;
                             if (recipientEmail) {
                                 const notifData = {
                                     type: 'collaborator',
                                     message: `You've been added as a collaborator on "${title}" by ${user?.displayName || user?.email || participantEmail}`,
                                     link: `/prompt/${requestId}?submission=${existingSubmission.id}`,
                                     fromUid: user?.uid || 'participant',
                                     fromName: user?.displayName || user?.email || participantEmail,
                                     fromEmail: user?.email || participantEmail,
                                     createdAt: serverTimestamp(),
                                     read: false,
                                     requestId,
                                     recipientEmail
                                 };
                                 await addDoc(collection(db, 'notifications'), notifData);
                             }
                         }
                     } catch (e) {
                         console.error("Error sending collaborator notification:", e);
                     }
                 });
                 await Promise.all(notificationPromises);
             }

             onSuccess({ ...existingSubmission, ...submissionData });
        } else {
            // Create
            const docRef = await addDoc(collection(db, 'submissions'), {
                ...submissionData,
                createdAt: serverTimestamp()
            });

            // Send notifications to all collaborators
            if (collaborators.length > 0) {
                const notificationPromises = collaborators.map(async (collabUid) => {
                    try {
                        const profileDoc = await getDoc(doc(db, 'profiles', collabUid));
                        if (profileDoc.exists()) {
                            const profileData = profileDoc.data();
                            const recipientEmail = profileData.email;
                            if (recipientEmail) {
                                const notifData = {
                                    type: 'collaborator',
                                    message: `You've been added as a collaborator on "${title}" by ${user?.displayName || user?.email || participantEmail}`,
                                    link: `/prompt/${requestId}?submission=${docRef.id}`,
                                    fromUid: user?.uid || 'participant',
                                    fromName: user?.displayName || user?.email || participantEmail,
                                    fromEmail: user?.email || participantEmail,
                                    createdAt: serverTimestamp(),
                                    read: false,
                                    requestId,
                                    recipientEmail
                                };
                                await addDoc(collection(db, 'notifications'), notifData);
                            }
                        }
                    } catch (e) {
                        console.error("Error sending collaborator notification:", e);
                    }
                });
                await Promise.all(notificationPromises);
            }
            
            // Award points (Only if NOT proxy or if we want to award to original artist)
            const pointsToUid = isProxy && proxyUser ? proxyUser.uid : user?.uid;
            if (pointsToUid && addPoints) {
                if (pointsToUid === user?.uid) {
                    addPoints(5);
                } else {
                     await updateDoc(doc(db, 'profiles', pointsToUid), {
                        points: increment(5)
                    }).catch(err => console.warn(`Failed to award points to proxy user ${pointsToUid}:`, err));
                }
            }

            // Award points to collaborators
            if (collaborators.length > 0) {
                const collabPromises = collaborators.map(uid => 
                    updateDoc(doc(db, 'profiles', uid), {
                        points: increment(5)
                    }).catch(err => console.warn(`Failed to award points to collaborator ${uid}:`, err))
                );
                await Promise.all(collabPromises);
            }
            
            onSuccess({ id: docRef.id, ...submissionData });
        }

        onClose();

    } catch (err: any) {
        console.error("SubmitTrack: Submission failed.", err);
        setError(err.message || "Failed to submit track.");
    } finally {
        setIsUploading(false);
    }
  };

  const handleDeleteClick = () => {
      setShowConfirmDelete(true);
  };

  const executeDelete = async () => {
      if (!existingSubmission || !existingSubmission.id) return;
      setShowConfirmDelete(false);
      setIsUploading(true);
      try {
          await deleteDoc(doc(db, 'submissions', existingSubmission.id));
          onSuccess();
          onClose();
      } catch (e) {
          console.error("Delete failed", e);
          setError("Failed to delete submission.");
      } finally {
          setIsUploading(false);
      }
  };

  const STEPS = [
    { n: 1, label: 'Audio' },
    { n: 2, label: 'Info' },
    { n: 3, label: 'Details' },
  ];

  return createPortal(
    <div className="fixed top-0 left-0 w-full h-[100dvh] z-[9999] flex items-center justify-center p-3 sm:p-6 bg-gray-950 overscroll-none touch-none">
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative flex flex-col"
        style={{ maxHeight: 'min(92vh, 680px)' }}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-white p-1.5 rounded-lg bg-gray-800/80 z-10 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-bold text-white pr-8">
            {existingSubmission ? 'Edit Submission' : 'Submit Track'}
          </h2>

          {/* Step pips */}
          <div className="flex items-center mt-4">
            {STEPS.map(({ n, label }, i) => (
              <div key={n} className="flex items-center" style={{ flex: i < 2 ? 1 : 'none' }}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-200 ${
                    step > n
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : step === n
                      ? 'border-blue-400 text-blue-400 bg-blue-950/40'
                      : 'border-gray-700 text-gray-600'
                  }`}>
                    {step > n ? <Check className="w-3.5 h-3.5" /> : n}
                  </div>
                  <span className={`text-[10px] font-medium leading-none ${
                    step === n ? 'text-blue-400' : step > n ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {label}
                  </span>
                </div>
                {i < 2 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-3.5 transition-colors duration-300 ${
                    step > n ? 'bg-blue-600' : 'bg-gray-700'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mt-3 flex-shrink-0 bg-red-900/50 border border-red-800 text-red-200 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* ── Step Content ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">

          {/* ── STEP 1: Audio ── */}
          {step === 1 && (
            <>
              {/* Admin Proxy */}
              {isAdmin && (
                <div className="bg-purple-900/20 border border-purple-500/30 p-3 rounded-lg">
                  <label className="block text-sm font-bold text-purple-300 mb-2 flex items-center gap-2">
                    <UserCheck className="w-4 h-4" /> Admin: Act as User
                    <Tooltip content="Submit this track on behalf of another artist. If the artist has an account, search and select them. Otherwise, enter their name below." icon />
                  </label>

                  {proxyUser ? (
                    <div className="flex items-center justify-between bg-purple-900/40 p-2 rounded border border-purple-500/50">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{proxyUser.displayName || proxyUser.alias}</span>
                        <span className="text-xs text-purple-300">{proxyUser.email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProxyUser(null)}
                        className="text-purple-300 hover:text-white text-xs px-2 py-1 rounded bg-purple-800/50"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 w-4 h-4 text-purple-400" />
                        <input
                          type="text"
                          value={proxySearch}
                          onChange={(e) => setProxySearch(e.target.value)}
                          className="w-full bg-gray-900 border border-purple-500/50 rounded p-2 pl-8 text-white focus:border-purple-500 outline-none text-base sm:text-sm"
                          placeholder="Search user by name or email..."
                        />
                        {proxyResults.length > 0 && (
                          <div className="absolute z-[10001] w-full bg-gray-800 border border-purple-500/50 rounded mt-1 shadow-2xl max-h-40 overflow-y-auto">
                            {proxyResults.map(res => (
                              <button
                                key={res.uid}
                                type="button"
                                onClick={() => { setProxyUser(res); setProxySearch(''); setProxyResults([]); }}
                                className="w-full text-left px-3 py-2 hover:bg-purple-900/30 border-b border-purple-500/10 last:border-0"
                              >
                                <div className="text-sm font-bold text-white">{res.displayName || res.alias}</div>
                                <div className="text-xs text-gray-400">{res.email}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="h-px bg-purple-500/20 flex-1" />
                        <span className="text-[10px] text-purple-400 uppercase font-bold">OR (Non-User)</span>
                        <div className="h-px bg-purple-500/20 flex-1" />
                      </div>

                      <input
                        type="text"
                        value={proxyAlias}
                        onChange={(e) => setProxyAlias(e.target.value)}
                        className="w-full bg-gray-900 border border-purple-500/50 rounded p-2 text-white focus:border-purple-500 outline-none text-base sm:text-sm"
                        placeholder="Artist name for non-account holder..."
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Audio source tabs */}
              <div>
                <div className="flex gap-4 mb-4 border-b border-gray-800 pb-2">
                  <button
                    type="button"
                    onClick={() => { setAudioType('upload'); setAudioFile(null); }}
                    className={`text-sm pb-1 font-medium transition-colors ${
                      audioType === 'upload' ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    Upload File
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAudioType('record'); setAudioFile(null); }}
                    className={`text-sm pb-1 font-medium transition-colors ${
                      audioType === 'record' ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    Record Audio
                  </button>
                </div>

                {/* Existing audio chip (edit mode) */}
                {existingSubmission && !audioFile && !isRecording && (
                  <div className="bg-gray-800 p-3 rounded-lg mb-4 border border-gray-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Music className="w-5 h-5 text-blue-400" />
                      <span className="text-sm text-gray-300">Using existing audio</span>
                    </div>
                    <div className="text-xs text-gray-500">Select new to replace</div>
                  </div>
                )}

                {audioType === 'upload' ? (
                  <div className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                    audioFile
                      ? 'border-green-600 bg-green-900/10'
                      : 'border-gray-700 hover:border-blue-600/50 hover:bg-blue-950/10'
                  }`}>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/aac,audio/ogg,audio/x-m4a,audio/mp4,.mp3,.wav,.ogg,.m4a,.aac"
                      onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="audio-upload"
                    />
                    <label htmlFor="audio-upload" className="cursor-pointer flex flex-col items-center gap-3">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                        audioFile ? 'bg-green-900/40' : 'bg-gray-800'
                      }`}>
                        <Music className={`w-8 h-8 ${ audioFile ? 'text-green-400' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-200">
                          {audioFile
                            ? audioFile.name
                            : existingSubmission
                            ? 'Click to replace audio'
                            : 'Click to select audio file'}
                        </p>
                        {!audioFile && (
                          <p className="text-xs text-gray-500 mt-1">MP3, WAV, M4A, OGG</p>
                        )}
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="border border-gray-700 rounded-xl p-4 bg-gray-900/50">
                    {!audioFile && !isRecording && (
                      <div className="text-center py-6">
                        <button
                          type="button"
                          onClick={startRecording}
                          className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center mx-auto mb-3 transition shadow-lg shadow-red-900/30"
                        >
                          <Mic className="w-10 h-10 text-white" />
                        </button>
                        <p className="text-sm text-gray-400">Click to start recording</p>
                      </div>
                    )}

                    {isRecording && (
                      <div className="text-center py-6">
                        <div className="animate-pulse text-red-500 font-bold mb-4 flex items-center justify-center gap-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full" />
                          Recording...
                        </div>
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="w-20 h-20 rounded-full bg-gray-800 border-2 border-red-500 flex items-center justify-center mx-auto mb-3 hover:bg-gray-700 transition"
                        >
                          <Square className="w-8 h-8 text-red-500 fill-current" />
                        </button>
                        <p className="text-sm text-gray-400">Click to stop</p>
                      </div>
                    )}

                    {audioFile && !isRecording && (
                      <div className="flex flex-col gap-3">
                        <div className="bg-gray-800 p-2 rounded border border-gray-700">
                          <MiniPlayer src={recordedPreview!} />
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={cancelRecording}
                            className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" /> Discard &amp; Record Again
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── STEP 2: Info ── */}
          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Track Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none text-base"
                  placeholder="e.g. My Awesome Demo"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                  Artist Name
                  <Tooltip content="The artist name displayed for this track. Your user alias if blank. If 'Anonymous' is enabled, this is hidden from your profile." icon />
                  <span className="text-gray-600 text-xs font-normal">(Optional)</span>
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={byline}
                    onChange={(e) => setByline(e.target.value)}
                    className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none text-base"
                    placeholder="e.g. The Band Name"
                  />
                  <button
                    type="button"
                    onClick={() => setIsAnonymous(!isAnonymous)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-3 rounded-lg border transition-colors flex-shrink-0 whitespace-nowrap ${
                      isAnonymous ? 'bg-blue-900/30 border-blue-500/50' : 'bg-gray-800 border-gray-700'
                    }`}
                  >
                    <div className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${
                      isAnonymous ? 'bg-blue-500' : 'bg-gray-600'
                    }`}>
                      <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${
                        isAnonymous ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </div>
                    <span className={`text-xs sm:text-sm font-medium whitespace-nowrap ${ isAnonymous ? 'text-blue-200' : 'text-gray-400'}`}>
                      Anonymous
                    </span>
                  </button>
                </div>
              </div>

              {/* Artwork */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Artwork <span className="text-gray-600 text-xs font-normal">(Optional)</span>
                </label>
                <div className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                  artFile ? 'border-green-600 bg-green-900/10' : 'border-gray-700 hover:border-gray-600'
                }`}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => setArtFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="art-upload"
                  />
                  <label htmlFor="art-upload" className="cursor-pointer flex items-center justify-center gap-3">
                    <ImageIcon className={`w-6 h-6 ${ artFile ? 'text-green-500' : 'text-gray-500'}`} />
                    <span className="text-sm text-gray-300">
                      {artFile
                        ? artFile.name
                        : existingSubmission?.artworkUrl
                        ? 'Change current image'
                        : 'Select artwork image'}
                    </span>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* ── STEP 3: Details ── */}
          {step === 3 && (
            <>
              {/* Collaborators */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Collaborators
                  <Tooltip content="Add others who worked on this track. They'll get participation points." icon />
                </label>

                <div className="relative mb-3">
                  <input
                    type="text"
                    value={collabSearch}
                    onChange={(e) => setCollabSearch(e.target.value)}
                    placeholder="Search by name..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-base sm:text-sm text-white focus:border-blue-500 outline-none"
                  />
                  {collabResults.length > 0 && (
                    <div className="absolute z-[10000] w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 shadow-2xl max-h-48 overflow-y-auto">
                      {collabResults.map(res => (
                        <button
                          key={res.uid}
                          type="button"
                          onClick={() => {
                            const name = res.displayName || res.alias;
                            if (!collaborators.includes(res.uid)) {
                              setCollaborators([...collaborators, res.uid]);
                              setCollabNames(prev => ({ ...prev, [res.uid]: name }));
                            }
                            setCollabSearch('');
                            setCollabResults([]);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center justify-between group"
                        >
                          <div className="text-sm font-bold text-white">{res.displayName || res.alias}</div>
                          <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100">Add</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {collaborators.map(uid => {
                    const joinedPart = participants?.[uid];
                    const label = joinedPart?.alias || collabNames[uid] || uid.substring(0, 8);
                    return (
                      <button
                        key={uid}
                        type="button"
                        onClick={() => removeCollaborator(uid)}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-blue-600 border border-blue-500 text-white flex items-center gap-2"
                      >
                        {label} <span className="opacity-70">×</span>
                      </button>
                    );
                  })}
                  {participants && Object.entries(participants).map(([key, data]) => {
                    if (data.email && (data.email === user?.email || data.email === participantEmail)) return null;
                    if (collaborators.includes(key)) return null;
                    if (!data.alias) return null;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleCollaborator(key, data.alias)}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600"
                      >
                        {data.alias}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stage */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                  Completion Stage
                  <Tooltip content="Set the completion status of your track to help reviewers set expectations." icon />
                </label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none text-base sm:text-sm"
                >
                  {["Seed of an Idea", "First Draft / Demo", "In Production / Full Arrangement",
                    "Ready for Mixing", "Final Polish / Mastering"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Flags */}
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    id="fragile-check"
                    checked={isFragile}
                    onChange={(e) => setIsFragile(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-pink-500 focus:ring-pink-500"
                  />
                  <span className="text-sm text-pink-300 flex items-center gap-2 font-medium select-none">
                    Fragile / Compliments Only
                    <Tooltip content="Check this if you only want positive feedback. Reviewers will be notified." icon />
                  </span>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    id="ai-check"
                    checked={doesNotUseAI}
                    onChange={(e) => setDoesNotUseAI(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-300 flex items-center gap-2 select-none">
                    My track does not use AI
                    <Tooltip content="Some users may filter out AI-generated submissions." icon />
                  </span>
                </label>
              </div>

              {/* Feedback Focus */}
              <details className="group border border-gray-700 rounded-lg bg-gray-800/30">
                <summary className="p-3 cursor-pointer text-sm font-medium text-gray-300 hover:text-white flex justify-between items-center select-none">
                  <span className="flex items-center gap-2">
                    Feedback Focus
                    <Tooltip content="Select specific areas you want feedback on." icon />
                    {feedbackFocus.length > 0 && (
                      <span className="ml-1 text-blue-400 text-xs">({feedbackFocus.length} selected)</span>
                    )}
                  </span>
                  <span className="text-gray-500 text-xs group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-4 pt-2 border-t border-gray-700/50 space-y-4 max-h-52 overflow-y-auto">
                  {Object.entries({
                    "Songwriting & Composition": ["Lyrics", "Melody", "Harmony / Chords"],
                    "Arrangement & Structure": ["Song Structure", "Instrumentation", "Dynamics / Pacing"],
                    "Performance": ["Vocal Performance", "Instrumental Performance"],
                    "Production & Mix": ["Recording Quality", "Mixing", "Sound Design / Vibe"]
                  }).map(([category, items]) => (
                    <div key={category}>
                      <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">{category}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {items.map(item => (
                          <label key={item} className="flex items-center gap-2 cursor-pointer hover:bg-gray-700/50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={feedbackFocus.includes(item)}
                              onChange={(e) => {
                                if (e.target.checked) setFeedbackFocus([...feedbackFocus, item]);
                                else setFeedbackFocus(feedbackFocus.filter(i => i !== item));
                              }}
                              className="rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-300">{item}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>

              {/* Lyrics / Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Lyrics / Notes <span className="text-gray-600 text-xs font-normal">(Optional)</span>
                </label>
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none h-24 text-base sm:text-sm resize-none"
                  placeholder="Lyrics, keys, bpm, or notes..."
                />
              </div>
            </>
          )}

        </div>{/* end step content */}

        {/* ── Footer ── */}
        <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            {step === 1 ? (
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-gray-400 hover:text-white transition"
                disabled={isUploading}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(prev => prev - 1)}
                className="text-sm text-gray-400 hover:text-white transition flex items-center gap-1"
                disabled={isUploading}
              >
                ← Back
              </button>
            )}

            {/* Delete — only on step 3 in edit mode */}
            {existingSubmission && step === 3 && (
              <button
                type="button"
                onClick={handleDeleteClick}
                className="text-red-500 hover:text-red-400 text-sm flex items-center gap-1 transition"
                disabled={isUploading}
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
              setStep(prev => prev + 1);
              setStepTransitioning(true);
              setTimeout(() => setStepTransitioning(false), 500);
            }}
              disabled={
                (step === 1 && !existingSubmission && !audioFile) ||
                (step === 2 && !title.trim()) ||
                isUploading
              }
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-semibold text-sm transition"
            >
              Next →
            </button>
          ) : (
            <button
              type="submit"
              disabled={isUploading || stepTransitioning}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 sm:px-6 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed text-sm transition relative overflow-hidden min-w-[140px]"
            >
              {isUploading ? (
                <span key="uploading" className="flex items-center justify-center gap-2 w-full">
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span className="whitespace-nowrap">
                    {uploadStep || (existingSubmission ? 'Updating...' : 'Uploading...')}
                  </span>
                </span>
              ) : (
                <span key="idle" className="flex items-center justify-center gap-2 w-full">
                  <Upload className="w-4 h-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">
                    {existingSubmission ? 'Update' : 'Submit Track'}
                  </span>
                </span>
              )}
            </button>
          )}
        </div>

        <ConfirmModal
          isOpen={showConfirmDelete}
          title="Delete Submission?"
          message="Are you sure you want to delete this track? This cannot be undone."
          confirmLabel="Delete Forever"
          isDestructive={true}
          onConfirm={executeDelete}
          onCancel={() => setShowConfirmDelete(false)}
        />
      </form>
    </div>,
    document.body
  );
}

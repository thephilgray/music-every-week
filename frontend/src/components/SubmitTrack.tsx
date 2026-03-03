import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Music, Image as ImageIcon, Loader2, Users, Mic, Square, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { uploadToR2 } from '../lib/r2';
import { generateWaveform } from '../lib/audio';
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
  const [proxyAlias, setProxyAlias] = useState('');
  
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

  // Search for collaborators
  useEffect(() => {
      if (collabSearch.length < 2) {
          setCollabResults([]);
          return;
      }

      const search = async () => {
          try {
              // Search by both alias and displayName
              const qAlias = query(
                  collection(db, 'profiles'), 
                  where('alias', '>=', collabSearch), 
                  where('alias', '<=', collabSearch + '\uf8ff')
              );
              const qDisplay = query(
                  collection(db, 'profiles'), 
                  where('displayName', '>=', collabSearch), 
                  where('displayName', '<=', collabSearch + '\uf8ff')
              );

              const [snapAlias, snapDisplay] = await Promise.all([getDocs(qAlias), getDocs(qDisplay)]);
              
              const resultsMap = new Map<string, UserProfile>();
              
              const processSnap = (snap: any) => {
                  snap.forEach((d: any) => {
                      const profile = { uid: d.id, ...d.data() } as UserProfile;
                      const isSelf = profile.uid === user?.uid || (profile.email && profile.email === participantEmail);
                      if (isSelf) return;

                      const hasJoined = participants && !!participants[profile.uid];
                      const isInvited = profile.email && requestAccessList.includes(profile.email);
                      
                      if (hasJoined || isInvited || isAdmin) {
                          resultsMap.set(profile.uid, profile);
                      }
                  });
              };

              processSnap(snapAlias);
              processSnap(snapDisplay);
              
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
        if (existingSubmission.proxyFor && existingSubmission.proxyFor.alias) setProxyAlias(existingSubmission.proxyFor.alias);
        
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
  }, [existingSubmission]);

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
        
        // 1. Handle Audio (New Upload or Keep Existing)
        if (audioFile) {
            // Generate Waveform
            setUploadStep('Processing audio...');
            try {
                // Defensive timeout for waveform generation
                const waveformPromise = generateWaveform(audioFile);
                const timeoutPromise = new Promise<number[]>((_, reject) => 
                    setTimeout(() => reject(new Error("Waveform timeout")), 15000)
                );
                waveformData = await Promise.race([waveformPromise, timeoutPromise]) as number[];
            } catch (e) {
                console.warn("Waveform generation failed or timed out", e);
                waveformData = [];
            }

            // Upload to R2
            setUploadStep(`Uploading audio (${(audioFile.size / (1024 * 1024)).toFixed(1)}MB)...`);
            const { url } = await uploadToR2(audioFile);
            audioUrlStr = url;
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
             // If no byline and linked, we might want to default to something, 
             // but user.displayName might not be available here easily if it's participant.
             // We'll leave it empty if not provided, UI usually handles fallback display.
             if (!finalByline) finalByline = ''; 
        }

        const linkProfile = !isAnonymous;
        const uploaderIdentifier = user ? user.email : participantEmail; // Use email as identifier

        const submissionData: any = { 
            requestId,
            title,
            byline: finalByline,
            linkProfile,
            lyrics: String(lyrics || ''),
            audioUrl: audioUrlStr,
            artworkUrl: artworkUrlStr,
            uploaderEmail: uploaderIdentifier, // New field for Firestore
            // uploaderUid is handled conditionally below
            collaborators: collaboratorsMap, 
            waveform: waveformData,
            stage,
            feedbackFocus: feedbackFocus,
            usesAI: !doesNotUseAI,
            fragile: isFragile,
            proxyFor: proxyAlias ? { alias: proxyAlias } : null
        };

        if (user?.uid) {
            submissionData.uploaderUid = user.uid;
        }

        if (existingSubmission && existingSubmission.id) {
            // Update
             await updateDoc(doc(db, 'submissions', existingSubmission.id), {
                ...submissionData,
                updatedAt: serverTimestamp()
             });
             onSuccess({ ...existingSubmission, ...submissionData });
        } else {
            // Create
            const docRef = await addDoc(collection(db, 'submissions'), {
                ...submissionData,
                createdAt: serverTimestamp()
            });
            
            // Award points to uploader
            if (addPoints) {
                addPoints(5);
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

  return createPortal(
    <div className="fixed top-0 left-0 w-full h-[100dvh] z-[9999] flex items-center justify-center p-4 bg-gray-950 backdrop-blur-none overscroll-none touch-none">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto overscroll-contain touch-auto">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white">{existingSubmission ? 'Edit Submission' : 'Submit Track'}</h2>
            <p className="text-sm text-gray-400">
                {existingSubmission ? 'Update your contribution details.' : 'Upload your contribution to this request.'}
            </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
                <div className="bg-red-900/50 border border-red-800 text-red-200 p-3 rounded text-sm">
                    {error}
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Track Title</label>
                <input 
                    type="text" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    placeholder="e.g. My Awesome Demo"
                    required
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                    Artist Name (Optional)
                    <Tooltip content="The artist name displayed for this track. Your user alias name if blank. If 'Anonymous' is enabled, this is hidden from your profile and defaults to 'Anonymous' if left blank." icon />
                </label>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <input 
                        type="text" 
                        value={byline}
                        onChange={(e) => setByline(e.target.value)}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                        placeholder="e.g. The Band Name"
                    />
                    
                    {/* Anonymous Toggle */}
                    <button
                        type="button"
                        onClick={() => setIsAnonymous(!isAnonymous)}
                        className={`flex items-center gap-2 cursor-pointer select-none transition-colors p-2 rounded-lg border w-fit ${isAnonymous ? 'bg-blue-900/30 border-blue-500/50' : 'bg-gray-800 border-gray-700'}`}
                        title="Submit anonymously?"
                    >
                        <div className={`w-10 h-5 rounded-full relative transition-colors ${isAnonymous ? 'bg-blue-500' : 'bg-gray-600'}`}>
                            <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isAnonymous ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                        <span className={`text-sm ${isAnonymous ? 'text-blue-200' : 'text-gray-400'}`}>
                            Anonymous
                        </span>
                    </button>
                </div>
            </div>

            {/* Audio Section */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Audio Source</label>
                <div className="flex gap-4 mb-3 border-b border-gray-800 pb-2">
                    <button
                        type="button"
                        onClick={() => { setAudioType('upload'); setAudioFile(null); }}
                        className={`text-sm pb-1 ${audioType === 'upload' ? 'text-white border-b-2 border-blue-500' : 'text-gray-400'}`}
                    >
                        Upload File
                    </button>
                    <button
                        type="button"
                        onClick={() => { setAudioType('record'); setAudioFile(null); }}
                        className={`text-sm pb-1 ${audioType === 'record' ? 'text-white border-b-2 border-blue-500' : 'text-gray-400'}`}
                    >
                        Record Audio
                    </button>
                </div>

                {existingSubmission && !audioFile && !isRecording && (
                    <div className="bg-gray-800 p-3 rounded mb-4 border border-gray-700 flex items-center justify-between">
                         <div className="flex items-center gap-2">
                             <Music className="w-5 h-5 text-blue-400" />
                             <span className="text-sm text-gray-300">Using existing audio</span>
                         </div>
                         <div className="text-xs text-gray-500">Select new to replace</div>
                    </div>
                )}

                {audioType === 'upload' ? (
                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        audioFile ? 'border-green-600 bg-green-900/10' : 'border-gray-700 hover:border-gray-600'
                    }`}>
                        <input 
                            type="file" 
                            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/aac,audio/ogg,audio/x-m4a,audio/mp4,.mp3,.wav,.ogg,.m4a,.aac"
                            onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                            className="hidden"
                            id="audio-upload"
                        />
                        <label htmlFor="audio-upload" className="cursor-pointer flex flex-col items-center gap-2">
                            <Music className={`w-8 h-8 ${audioFile ? 'text-green-500' : 'text-gray-500'}`} />
                            <span className="text-sm text-gray-300">
                                {audioFile ? audioFile.name : (existingSubmission ? 'Click to replace audio file' : 'Click to select audio file')}
                            </span>
                        </label>
                    </div>
                ) : (
                    <div className="border border-gray-700 rounded-lg p-4 bg-gray-900/50">
                        {(!audioFile && !isRecording) && (
                            <div className="text-center py-4">
                                <button
                                    type="button"
                                    onClick={startRecording}
                                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center mx-auto mb-2 transition"
                                >
                                    <Mic className="w-8 h-8 text-white" />
                                </button>
                                <p className="text-sm text-gray-400">Click to start recording</p>
                            </div>
                        )}

                        {isRecording && (
                            <div className="text-center py-4">
                                <div className="animate-pulse text-red-500 font-bold mb-4 flex items-center justify-center gap-2">
                                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                    Recording...
                                </div>
                                <button
                                    type="button"
                                    onClick={stopRecording}
                                    className="w-16 h-16 rounded-full bg-gray-800 border-2 border-red-500 flex items-center justify-center mx-auto mb-2 hover:bg-gray-700 transition"
                                >
                                    <Square className="w-6 h-6 text-red-500 fill-current" />
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
                                        <Trash2 className="w-4 h-4" /> Discard & Record Again
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Artwork Upload */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Artwork (Optional)</label>
                <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                    artFile ? 'border-green-600 bg-green-900/10' : 'border-gray-700 hover:border-gray-600'
                }`}>
                    <input 
                        type="file" 
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={(e) => setArtFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="art-upload"
                    />
                    <label htmlFor="art-upload" className="cursor-pointer flex flex-col items-center gap-2">
                        <ImageIcon className={`w-6 h-6 ${artFile ? 'text-green-500' : 'text-gray-500'}`} />
                        <span className="text-xs text-gray-300">
                            {artFile ? artFile.name : (existingSubmission?.artworkUrl ? 'Change current image' : 'Select image')}
                        </span>
                    </label>
                </div>
            </div>
            
            {/* Admin Proxy Upload */}
            {isAdmin && (
                <div className="bg-purple-900/20 border border-purple-500/30 p-3 rounded">
                    <label className="block text-sm font-bold text-purple-300 mb-1 flex items-center gap-2">
                        <Users className="w-4 h-4" /> Admin Proxy Upload
                    </label>
                    <input 
                        type="text" 
                        value={proxyAlias}
                        onChange={(e) => setProxyAlias(e.target.value)}
                        className="w-full bg-gray-900 border border-purple-500/50 rounded p-2 text-white focus:border-purple-500 outline-none text-sm"
                        placeholder="Enter original artist name (e.g. from email)"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        If set, this track will appear as uploaded by "Admin (on behalf of [Name])".
                    </p>
                </div>
            )}

            {/* Collaborators */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2 justify-between">
                    <span className="flex items-center gap-2">
                        <Users className="w-4 h-4" /> Collaborators
                        <Tooltip content="Add others who worked on this track. They will see this submission on their profile and get participation points." icon />
                    </span>
                </label>
                
                {/* Search Bar */}
                <div className="relative mb-3">
                    <input 
                        type="text"
                        value={collabSearch}
                        onChange={(e) => setCollabSearch(e.target.value)}
                        placeholder="Search by name..."
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
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
                                    <div>
                                        <div className="text-sm font-bold text-white">{res.displayName || res.alias}</div>
                                    </div>
                                    <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100">Add</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected & Suggested */}
                <div className="flex flex-wrap gap-2">
                    {/* Selected List */}
                    {collaborators.map(uid => {
                        // Find profile name if possible
                        const joinedPart = participants?.[uid];
                        const label = joinedPart?.alias || collabNames[uid] || uid.substring(0, 8);

                        return (
                            <button
                                key={uid}
                                type="button"
                                onClick={() => removeCollaborator(uid)}
                                className="px-3 py-1 rounded-full text-xs font-medium bg-blue-600 border border-blue-500 text-white flex items-center gap-2"
                            >
                                {label}
                                <span className="opacity-70">×</span>
                            </button>
                        );
                    })}

                    {/* Participants from Request (Suggestions) */}
                    {participants && Object.entries(participants).map(([key, data]) => {
                         if (data.email && (data.email === user?.email || data.email === participantEmail)) return null;
                         if (collaborators.includes(key)) return null; // Already selected
                         
                         // Only suggest participants who have an alias/name set
                         if (!data.alias) return null;

                         const name = data.alias;

                         return (
                             <button
                                key={key}
                                type="button"
                                onClick={() => toggleCollaborator(key, name)} 
                                className="px-3 py-1 rounded-full text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600"
                             >
                                 {name}
                             </button>
                         );
                    })}
                </div>
            </div>

            {/* Stage & Feedback */}
            <div className="grid grid-cols-1 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                        Completion Stage
                        <Tooltip content="Set the completion status of your track to help reviewers set their expectations." icon />
                    </label>
                    <select 
                        value={stage}
                        onChange={(e) => setStage(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    >
                        {["Seed of an Idea", "First Draft / Demo", "In Production / Full Arrangement", 
                          "Ready for Mixing", "Final Polish / Mastering"].map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="fragile-check"
                        checked={isFragile}
                        onChange={(e) => setIsFragile(e.target.checked)}
                        className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-pink-500 focus:ring-pink-500"
                    />
                    <label htmlFor="fragile-check" className="text-sm text-pink-300 select-none flex items-center gap-2 font-medium">
                        Fragile / Compliments Only
                        <Tooltip content="Check this if you only want positive feedback or encouragement. Reviewers will be notified." icon />
                    </label>
                </div>

                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="ai-check"
                        checked={doesNotUseAI}
                        onChange={(e) => setDoesNotUseAI(e.target.checked)}
                        className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="ai-check" className="text-sm text-gray-300 select-none flex items-center gap-2">
                        My track does not use AI
                        <Tooltip content="Some users may choose to filter out AI-generated submissions in their settings. Unchecking this might hide your submission from them." icon />
                    </label>
                </div>

                <details className="group border border-gray-700 rounded bg-gray-800/30">
                    <summary className="p-3 cursor-pointer text-sm font-medium text-gray-300 hover:text-white flex justify-between items-center select-none">
                        <span className="flex items-center gap-2">
                            Feedback Focus
                            <Tooltip content="Select specific areas you want feedback on. This guides the reviewers." icon />
                            {feedbackFocus.length > 0 && <span className="ml-2 text-blue-400 text-xs">({feedbackFocus.length} selected)</span>}
                        </span>
                        <span className="text-gray-500 text-xs group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="p-4 pt-0 border-t border-gray-700/50 mt-2 space-y-4 max-h-60 overflow-y-auto">
                        {Object.entries({
                            "Songwriting & Composition": ["Lyrics", "Melody", "Harmony / Chords"],
                            "Arrangement & Structure": ["Song Structure", "Instrumentation", "Dynamics / Pacing"],
                            "Performance": ["Vocal Performance", "Instrumental Performance"],
                            "Production & Mix": ["Recording Quality", "Mixing", "Sound Design / Vibe"]
                        }).map(([category, items]) => (
                            <div key={category}>
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 mt-2">{category}</h4>
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
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Lyrics / Notes (Optional)</label>
                <textarea 
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none h-24"
                    placeholder="Lyrics, keys, bpm, or notes..."
                />
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-800 mt-6">
                <div>
                    {existingSubmission && (
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
                <div className="flex gap-3">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white transition"
                        disabled={isUploading}
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        disabled={isUploading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {uploadStep || (existingSubmission ? 'Updating...' : 'Uploading...')}
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                {existingSubmission ? 'Update' : 'Submit Track'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
        
        <ConfirmModal 
            isOpen={showConfirmDelete}
            title="Delete Submission?"
            message="Are you sure you want to delete this track? This cannot be undone."
            confirmLabel="Delete Forever"
            isDestructive={true}
            onConfirm={executeDelete}
            onCancel={() => setShowConfirmDelete(false)}
        />
      </div>
    </div>,
    document.body
  );
}
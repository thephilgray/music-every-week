import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Music, Image as ImageIcon, Loader2, Users, Search, Mic, Square, Trash2 } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { uploadFile } from '../lib/upload';
import { generateWaveform } from '../lib/audio';
import { MiniPlayer } from './ui/MiniPlayer';
import { ConfirmModal } from './ui/ConfirmModal';
import type { Notification, UserProfile, Submission } from '../types';

// Define a timeout for GunDB acknowledgments (e.g., 30 seconds)
const GUN_ACK_TIMEOUT = 30000;

interface SubmitTrackProps {
  requestId: string;
  participants?: Record<string, { status: 'pending' | 'accepted', alias?: string, email?: string }>;
  existingSubmission?: Submission;
  onClose: () => void;
  onSuccess: (submission?: Submission) => void;
  accessMode?: string;
}

export function SubmitTrack({ requestId, participants, existingSubmission, onClose, onSuccess, accessMode }: SubmitTrackProps) {
  const { gun, user, pubKey, userProfile, userPair } = useGun(); // Destructure userPair
  const [title, setTitle] = useState('');
  const [byline, setByline] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false); // Default: Not Anonymous (Linked)
  const [lyrics, setLyrics] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [knownAliases, setKnownAliases] = useState<Record<string, string>>({}); // Store aliases for UI display
  
  // Feedback Metadata
  const [stage, setStage] = useState('First Draft / Demo');
  const [feedbackFocus, setFeedbackFocus] = useState<string[]>([]);

  // Audio Recording
  const [audioType, setAudioType] = useState<'upload' | 'record'>('upload');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedPreview, setRecordedPreview] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Collaborator Search Logic
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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
        
        // Load Collaborators (Handle GunDB references or JSON string)
        let rawCollabs = existingSubmission.collaborators || {};
        
        // Parse if it's a string (New flattened format)
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
        } else if (existingSubmission.id) {
            // If no direct keys, it might be a reference (Old format). Fetch from User Graph source.
            user.get('submissions').get(existingSubmission.id).get('collaborators').once((data: any) => {
                if (data && typeof data === 'object') {
                    const fetchedKeys = Object.keys(data).filter(k => k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#'));
                    setCollaborators(fetchedKeys);
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
    } else {
        if (!user) return;
        user.get('preferences').get('lastByline').once((data: any) => {
            if (data && typeof data === 'string') {
                setByline(data);
            }
        });
    }
    
    return () => {
        document.body.style.overflow = 'unset';
        if (root) root.style.visibility = 'visible';
    };
  }, [existingSubmission, user]);

  // Fetch Aliases for Collaborators
  useEffect(() => {
      collaborators.forEach(pub => {
          if (!knownAliases[pub]) {
              gun.get('all_users').get(pub).once((u: any) => {
                  if (u && (u.alias || u.displayName)) {
                      setKnownAliases(prev => ({
                          ...prev,
                          [pub]: u.displayName || u.alias
                      }));
                  }
              });
          }
      });
  }, [collaborators, gun]);

  const searchUsers = (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    
    // We search all_users
    // Note: In a real app with many users, this map() is inefficient. 
    // We would use an index. For now, it's fine.
    gun.get('all_users').map().once((user: any, pub: string) => {
      if (user && user.alias && user.alias.toLowerCase().includes(term.toLowerCase())) {
        if (pub !== pubKey && !collaborators.includes(pub)) {
             // Avoid dupes in results
             setSearchResults(prev => {
                const existing = new Set(prev.map(p => p.pub));
                if (!existing.has(pub)) return [...prev, { ...user, pub }];
                return prev;
             });
        }
      }
    });
  };

  const toggleCollaborator = (userOrPub: string | UserProfile) => {
    let pub = '';
    let alias = '';

    if (typeof userOrPub === 'string') {
        pub = userOrPub;
    } else {
        pub = userOrPub.pub;
        alias = userOrPub.alias;
    }

    if (collaborators.includes(pub)) {
      setCollaborators(collaborators.filter(p => p !== pub));
    } else {
      setCollaborators([...collaborators, pub]);
      if (alias) {
          setKnownAliases(prev => ({ ...prev, [pub]: alias }));
      }
    }
    // Clear search
    setSearchTerm('');
    setSearchResults([]);
    setIsSearching(false);
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
    return 'audio/webm'; // Fallback, though likely to cause issues if no other type supported
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
    
    // Ensure userPair is available for signing operations
    if (!userPair || !userPair.pub || !userPair.priv) {
        setError("Authentication error: Please log in again to submit or update a track.");
        console.error("SubmitTrack: Submission failed: User pair (with private key) is not available.");
        return;
    }

    setIsUploading(true);
    setError(null);

    try {
        let audioUrlStr = existingSubmission?.audioUrl || '';
        let waveformStr = '';
        
        // Handle Waveform string/array mismatch from existing data
        if (existingSubmission?.waveform) {
            waveformStr = typeof existingSubmission.waveform === 'string' 
                ? existingSubmission.waveform 
                : JSON.stringify(existingSubmission.waveform);
        }

        // 1. Handle Audio (New Upload or Keep Existing)
        if (audioFile) {
            // Generate Waveform
            try {
                const wf = await generateWaveform(audioFile);
                waveformStr = JSON.stringify(wf);
            } catch (e) {
                console.warn("Waveform generation failed", e);
                waveformStr = '[]';
            }

            // Upload using the reliable userPair
            const { url } = await uploadFile(audioFile, userPair);
            audioUrlStr = url;
        }

        // 2. Handle Art (New Upload or Keep Existing)
        let artworkUrlStr = existingSubmission?.artworkUrl || '';
        if (artFile) {
            // Upload using the reliable userPair
            const { url } = await uploadFile(artFile, userPair);
            artworkUrlStr = url;
        }

        // 3. Save to Gun
        const submissionId = existingSubmission?.id || crypto.randomUUID();
        
        // Convert collaborators array to Record<string, boolean>
        const collaboratorsMap: Record<string, boolean> = {};
        collaborators.forEach(c => collaboratorsMap[c] = true);

        // Determine final byline
        let finalByline = byline.trim();
        if (isAnonymous) {
            // If Anonymous and empty byline, use "Anonymous"
            if (!finalByline) finalByline = 'Anonymous';
        } else {
            // If Linked and empty byline, use Alias
            if (!finalByline) finalByline = userProfile?.alias || '';
        }
        
        // Save preference if user typed something (only if not anonymous?)
        // Or should we always save the text they typed? Let's save it.
        if (byline.trim()) {
            user.get('preferences').get('lastByline').put(byline.trim());
        }

        const linkProfile = !isAnonymous;

        // Ensure no undefined values are passed to GunDB
        const submission: any = { 
            id: submissionId,
            requestId,
            title,
            byline: finalByline,
            linkProfile,
            lyrics: String(lyrics || ''), // Ensure empty string if null/undefined
            audioUrl: audioUrlStr,
            artworkUrl: artworkUrlStr,
            uploaderPub: pubKey as string,
            createdAt: existingSubmission?.createdAt || Date.now(),
            collaborators: JSON.stringify(collaboratorsMap), // Flattened as JSON string
            waveform: waveformStr,
            stage,
            feedbackFocus: JSON.stringify(feedbackFocus)
        };

        const gunPromises: Promise<any>[] = [];

        // Helper function to create a GunDB put promise with a timeout
        const createGunPutPromise = (node: any, data: any, logMessage: string) => {
            let timer: ReturnType<typeof setTimeout>;
            return Promise.race([
                new Promise<void>((resolve, reject) => {
                    node.put(data, (ack: any) => {
                        clearTimeout(timer);
                        if (ack.err) {
                            console.error(`SubmitTrack: ${logMessage} FAILED:`, ack.err);
                            return reject(new Error(`${logMessage} failed: ${ack.err}`));
                        }
                        resolve();
                    });
                }),
                new Promise<void>((_, reject) => {
                    timer = setTimeout(() => {
                        console.warn(`SubmitTrack: ${logMessage} TIMEOUT after ${GUN_ACK_TIMEOUT / 1000}s.`);
                        reject(new Error(`${logMessage} timed out.`));
                    }, GUN_ACK_TIMEOUT);
                })
            ]);
        };

        // Save safely (User Graph and Request Node)
        gunPromises.push(createGunPutPromise(
            user.get('submissions').get(submissionId), 
            submission, 
            'Saved to user graph (submissions)'
        ));
        gunPromises.push(createGunPutPromise(
            gun.get('request_submissions').get(requestId).get(submissionId), 
            submission, 
            'Linked to request_submissions'
        ));

        // Also link to user's public profile (Double-Linking)
        // This is crucial for the "Profile" view to show all works
        if (pubKey) {
            gunPromises.push(createGunPutPromise(
                user.get('my_submissions').get(submissionId), 
                user.get('submissions').get(submissionId), 
                'Linked to my_submissions'
            ));

            if (linkProfile) {
                gunPromises.push(createGunPutPromise(
                    gun.get('all_users').get(pubKey).get('submissions').get(submissionId), 
                    pubKey, 
                    'Linked to all_users (public profile)'
                ));
            } else {
                // If Anonymous, ensure we REMOVE any existing link if editing
                gunPromises.push(createGunPutPromise(
                    gun.get('all_users').get(pubKey).get('submissions').get(submissionId), 
                    null, 
                    'Unlinked from all_users (public profile)'
                ));
            }
        }

        // Link to collaborators' profiles and Notify Collaborator
        collaborators.forEach(collabPub => {
            gunPromises.push(createGunPutPromise(
                gun.get('all_users').get(collabPub).get('submissions').get(submissionId), 
                pubKey, 
                `Linked to collaborator ${collabPub} profile`
            ));
            
            const notifId = crypto.randomUUID();
            const notification: Notification = {
                id: notifId,
                type: 'submission',
                message: `You were added as a collaborator on "${title}"`,
                link: `/request/${requestId}?submission=${submissionId}`,
                fromPub: pubKey as string,
                createdAt: Date.now(),
                read: false
            };
            gunPromises.push(createGunPutPromise(
                gun.get('inboxes').get(collabPub).get(notifId), 
                notification, 
                `Sent notification to collaborator ${collabPub}`
            ).catch(e => {
                console.warn(`Failed to notify collaborator ${collabPub} (non-fatal):`, e);
            }));
        });

        // Notify Request Owner
                    gunPromises.push(new Promise<void>((resolve) => {
            gun.get('file_requests').get(requestId).once((req: any) => {
                if (req && req.ownerPub && req.ownerPub !== pubKey) {
                    const notifId = crypto.randomUUID();
                    const notification: Notification = {
                        id: notifId,
                        type: 'submission',
                        message: `New submission "${title}" on "${req.title}"`,
                        link: `/request/${requestId}?submission=${submissionId}`,
                        fromPub: pubKey as string,
                        createdAt: Date.now(),
                        read: false
                    };
                    createGunPutPromise(
                        gun.get('inboxes').get(req.ownerPub).get(notifId),
                        notification,
                        `Sent notification to request owner ${req.ownerPub}`
                    ).then(resolve).catch((e) => {
                        console.warn("Notification to request owner failed (non-fatal):", e);
                        resolve();
                    }); // Resolve anyway so submission succeeds
                } else {
                    resolve();
                }
            });
        }));

        // Write to Global Feed if Public and New
        if (accessMode === 'direct' && !existingSubmission && linkProfile) {
            const pulseId = crypto.randomUUID();
            const dateStr = new Date().toISOString().split('T')[0];
            const bucketKey = `global_pulse_${dateStr}`;
            
                        gunPromises.push(new Promise<void>((resolve) => {
                gun.get('file_requests').get(requestId).once((req: any) => { // Using once to get req.title reliably
                    const feedItem = {
                        id: pulseId,
                        type: 'submission',
                        text: `Submitted a new track: "${title}"`,
                        authorPub: pubKey as string,
                        submissionId,
                        requestId,
                        submissionTitle: req?.title || 'Unknown Request',
                        createdAt: Date.now()
                    };
                    createGunPutPromise(
                        gun.get(bucketKey).get(pulseId),
                        feedItem,
                        'Wrote to global feed'
                    ).then(resolve).catch((e) => {
                        console.warn("Global feed update failed (non-fatal):", e);
                        resolve();
                    }); // Resolve anyway so submission succeeds
                });
            }));
        }

        await Promise.all(gunPromises);

        onSuccess(submission);
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
          const subId = existingSubmission.id;
          
          // 1. Remove from User Graph
          user.get('submissions').get(subId).put(null);
          user.get('my_submissions').get(subId).put(null);
          
          // 2. Remove from Request Node
          gun.get('request_submissions').get(requestId).get(subId).put(null);
          
          // 3. Remove from Public Profile
          if (pubKey) {
              gun.get('all_users').get(pubKey).get('submissions').get(subId).put(null);
          }
          
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
                <label className="block text-sm font-medium text-gray-400 mb-1">Byline (Optional)</label>
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
                            accept="audio/*"
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
                        accept="image/*"
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
            
            {/* Collaborators */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2 justify-between">
                    <span className="flex items-center gap-2"><Users className="w-4 h-4" /> Collaborators</span>
                    <button 
                        type="button" 
                        onClick={() => setIsSearching(!isSearching)}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                        <Search className="w-3 h-3" /> {isSearching ? 'Close Search' : 'Add Collaborator'}
                    </button>
                </label>
                
                {/* Search Box */}
                {isSearching && (
                    <div className="mb-3 relative">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => searchUsers(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                            placeholder="Search user by alias..."
                            autoFocus
                        />
                        {searchResults.length > 0 && (
                           <div className="absolute z-10 w-full bg-gray-800 border border-gray-600 rounded mt-1 max-h-40 overflow-y-auto shadow-xl">
                             {searchResults.map(user => (
                               <div 
                                 key={user.pub}
                                 onClick={() => toggleCollaborator(user)}
                                 className="p-2 hover:bg-gray-700 cursor-pointer text-white text-sm flex justify-between items-center"
                               >
                                 <span>{user.alias}</span>
                                 <span className="text-xs text-gray-400">Add</span>
                               </div>
                             ))}
                           </div>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap gap-2">
                    {/* Pre-defined Participants from Request */}
                    {participants && Object.entries(participants).map(([pub, data]) => {
                         if (pub === pubKey) return null; // Don't show self
                         const isSelected = collaborators.includes(pub);
                         return (
                             <button
                                key={pub}
                                type="button"
                                onClick={() => toggleCollaborator({ pub, alias: data.alias || '' } as any)} 
                                className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                                    isSelected  
                                    ? 'bg-blue-600 border-blue-500 text-white' 
                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                                }`}
                             >
                                 {data.alias || pub.substring(0, 6)}
                             </button>
                         );
                    })}
                    
                    {/* Manually Added Collaborators (who are NOT in the participants list) */}
                    {collaborators.map(pub => {
                        // If already shown above, skip
                        if (participants && participants[pub]) return null;
                        return (
                             <button
                                key={pub}
                                type="button"
                                onClick={() => toggleCollaborator(pub)}
                                className="px-3 py-1 rounded-full text-xs font-medium border bg-blue-600 border-blue-500 text-white"
                             >
                                 {knownAliases[pub] || searchResults.find(u => u.pub === pub)?.alias || pub.substring(0, 6)}
                             </button>
                        );
                    })}
                </div>
            </div>

            {/* Stage & Feedback */}
            <div className="grid grid-cols-1 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Completion Stage</label>
                    <select 
                        value={stage}
                        onChange={(e) => setStage(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    >
                        {["Seed of an Idea", "First Draft / Demo", "In Production / Full Arrangement", 
                          "Ready for Mixing", "Final Polish / Mastering", "All or Mostly AI"].map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                <details className="group border border-gray-700 rounded bg-gray-800/30">
                    <summary className="p-3 cursor-pointer text-sm font-medium text-gray-300 hover:text-white flex justify-between items-center select-none">
                        <span>
                            Feedback Focus
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
                                {existingSubmission ? 'Updating...' : 'Uploading...'}
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
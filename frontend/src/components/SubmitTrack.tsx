import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Music, Image as ImageIcon, Loader2, Users, Search, Mic, Square, Trash2 } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { APP_SCOPE } from '../config/appConfig';
import { useToast } from '../contexts/ToastContext';
import { uploadFile } from '../lib/upload';
import { generateWaveform } from '../lib/audio';
import { MiniPlayer } from './ui/MiniPlayer';
import { ConfirmModal } from './ui/ConfirmModal';
import type { Notification, UserProfile, Submission } from '../types';

interface SubmitTrackProps {
  requestId: string;
  participants?: Record<string, { status: 'pending' | 'accepted', alias?: string, email?: string }>;
  existingSubmission?: Submission;
  onClose: () => void;
  onSuccess: (submission?: Submission) => void;
  accessMode?: string;
}

// Helper to decode for display (if we used the above)
// Not strictly needed if we assume Gun fixes this eventually, but for now we want stability.
// Actually, let's just strip high bytes if they cause crashes, or assume the user inputs standard text for now.
// Better: encodeURIComponent the whole string if it has high bytes?
// Let's try to just use raw strings but catch the error.

// Temporary fix for SEA btoa crash: Strip non-Latin1 characters
const cleanString = (str: string) => {
    return str.replace(/[^\x00-\x7F]/g, "").trim();
};

export function SubmitTrack({ requestId, participants, existingSubmission, onClose, onSuccess, accessMode }: SubmitTrackProps) {
  const { gun, user, pubKey, userProfile } = useGun();
  const { success, error: toastError } = useToast();
  const [title, setTitle] = useState('');
  const [byline, setByline] = useState('');
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
        // Decode potentially safe-string'd values if we were doing that
        // For now assume standard
        setTitle(existingSubmission.title);
        setByline(existingSubmission.byline || '');
        setLyrics(existingSubmission.lyrics || '');
        setCollaborators(Object.keys(existingSubmission.collaborators || {}));
        setStage(existingSubmission.stage || 'First Draft / Demo');
        
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
        user.get(APP_SCOPE).get('preferences').get('lastByline').once((data: any) => {
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

  const searchUsers = (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    
    gun.get('all_users').map().once((user: any, pub: string) => {
      if (user && user.alias && user.alias.toLowerCase().includes(term.toLowerCase())) {
        if (pub !== pubKey && !collaborators.includes(pub)) {
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
    return 'audio/webm'; 
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
    
    setIsUploading(true);
    setError(null);

    try {
        let audioUrlStr = existingSubmission?.audioUrl || '';
        let waveformStr = '[]';
        
        // Handle Waveform
        if (existingSubmission?.waveform) {
            waveformStr = typeof existingSubmission.waveform === 'string' 
                ? existingSubmission.waveform 
                : JSON.stringify(existingSubmission.waveform);
        }

        // 1. Handle Audio 
        if (audioFile) {
            // Generate Waveform
            try {
                const wf = await generateWaveform(audioFile);
                waveformStr = JSON.stringify(wf);
            } catch (e) {
                console.warn("Waveform generation failed", e);
                waveformStr = '[]';
            }

            // Upload
            const { url } = await uploadFile(audioFile, (user as any).is);
            audioUrlStr = url;
        }

        // 2. Handle Art
        let artworkUrlStr = existingSubmission?.artworkUrl || '';
        if (artFile) {
            const { url } = await uploadFile(artFile, (user as any).is);
            artworkUrlStr = url;
        }

        // 3. Save to Gun
        const submissionId = existingSubmission?.id || crypto.randomUUID();
        
        const collaboratorsMap: Record<string, boolean> = {};
        collaborators.forEach(c => collaboratorsMap[c] = true);

        const finalByline = byline.trim() || userProfile?.alias || '';
        
        if (byline.trim()) {
            user.get(APP_SCOPE).get('preferences').get('lastByline').put(byline.trim());
        }

        // ! IMPORTANT: Sanitize input if necessary to prevent SEA crash
        // For now, we assume simple text. If crash persists, we might need to escape unicode.
        
        const submission: any = { 
            id: submissionId,
            requestId,
            title: cleanString(title),
            byline: cleanString(finalByline),
            lyrics: cleanString(String(lyrics)),
            audioUrl: audioUrlStr,
            artworkUrl: artworkUrlStr,
            uploaderPub: pubKey as string,
            createdAt: existingSubmission?.createdAt || Date.now(),
            collaborators: collaboratorsMap,
            waveform: waveformStr,
            stage,
            feedbackFocus: JSON.stringify(feedbackFocus)
        };

        console.log("Submitting:", submission);

        // Ensure User has keys for signing (fix for 'hanging' put)
        // @ts-ignore
        if (user.is && !user.is.priv) {
             console.warn("User instance missing private key. Attempting restoration...");
             const stored = sessionStorage.getItem('pair'); // Try standard key
             if (stored) {
                 try {
                     const pair = JSON.parse(stored);
                     // @ts-ignore
                     if (pair.priv) {
                         // @ts-ignore
                         user.is = { ...user.is, ...pair };
                         // @ts-ignore
                         user._.is = user.is;
                         console.log("Restored private key to User instance.");
                     }
                 } catch(e) {}
             }
        }

        // Save safely
        const savePromises = [
            // User Graph
            new Promise<void>((resolve) => {
                user.get(APP_SCOPE).get('submissions').get(submissionId).put(submission, (ack: any) => {
                    if (ack.err) console.error('Error saving to user graph:', ack.err);
                    resolve();
                });
            }),
            // Request Node
            new Promise<void>((resolve) => {
                gun.get('request_submissions').get(requestId).get(submissionId).put(submission, (ack: any) => {
                    if (ack.err) console.error('Error linking to request_submissions:', ack.err);
                    resolve();
                });
            })
        ];

        // Double-Linking (Fire and forget or await?)
        if (pubKey) {
            gun.get('all_users').get(pubKey).get('submissions').get(submissionId).put(pubKey);
            user.get(APP_SCOPE).get('my_submissions').get(submissionId).put(user.get(APP_SCOPE).get('submissions').get(submissionId));
        }

        collaborators.forEach(collabPub => {
            gun.get('all_users').get(collabPub).get('submissions').get(submissionId).put(pubKey);
            
            const notifId = crypto.randomUUID();
            const notification: Notification = {
                id: notifId,
                type: 'submission',
                message: `You were added as a collaborator on "${title}"`,
                link: `/request/${requestId}?submission=${submissionId}`,
                fromPub: pubKey as string,
                createdAt: Date.now(),
                read: false,
                requestId: requestId
            };
            gun.get('inboxes').get(collabPub).get(notifId).put(notification);
        });

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
                    read: false,
                    requestId: requestId
                };
                gun.get('inboxes').get(req.ownerPub).get(notifId).put(notification);
            }
        });

        if (accessMode === 'direct' && !existingSubmission) {
            const pulseId = crypto.randomUUID();
            const dateStr = new Date().toISOString().split('T')[0];
            const bucketKey = `global_pulse_${dateStr}`;
            
            gun.get('file_requests').get(requestId).once((req: any) => {
                const feedItem = {
                    id: pulseId,
                    type: 'submission',
                    text: `Submitted a new track: "${title}"`,
                    authorPub: pubKey as string,
                    submissionId,
                    requestId,
                    submissionTitle: title,
                    requestTitle: req?.title || 'Unknown Request',
                    createdAt: Date.now()
                };
                gun.get(bucketKey).get(pulseId).put(feedItem);
            });
        }

        // Await primary saves to ensure at least local write is attempted
        await Promise.all(savePromises);

        success(existingSubmission ? "Track updated!" : "Track submitted!");
        onSuccess(submission);
        onClose();

    } catch (err: any) {
        console.error("Submission failed", err);
        const msg = err.message || "Failed to submit track.";
        setError(msg);
        toastError(msg);
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
          
          user.get(APP_SCOPE).get('submissions').get(subId).put(null);
          user.get(APP_SCOPE).get('my_submissions').get(subId).put(null);
          gun.get('request_submissions').get(requestId).get(subId).put(null);
          
          if (pubKey) {
              gun.get('all_users').get(pubKey).get('submissions').get(subId).put(null);
          }
          
          success("Submission deleted.");
          onSuccess();
          onClose();
      } catch (e: any) {
          console.error("Delete failed", e);
          const msg = "Failed to delete submission.";
          setError(msg);
          toastError(msg);
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
                <input 
                    type="text" 
                    value={byline}
                    onChange={(e) => setByline(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    placeholder="e.g. The Band Name"
                />
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
                    onChange={e => setLyrics(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition h-24 text-sm font-mono"
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

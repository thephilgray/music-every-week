import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Music, Image as ImageIcon, Loader2, Users, Search, Mic, Square, Trash2 } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { uploadFile } from '../lib/upload';
import { generateWaveform } from '../lib/audio';
import { MiniPlayer } from './ui/MiniPlayer';
import type { Notification, UserProfile, Submission } from '../types';

interface SubmitTrackProps {
  requestId: string;
  participants?: Record<string, { status: 'pending' | 'accepted', alias?: string, email?: string }>;
  existingSubmission?: Submission;
  onClose: () => void;
  onSuccess: () => void;
}

export function SubmitTrack({ requestId, participants, existingSubmission, onClose, onSuccess }: SubmitTrackProps) {
  const { gun, user, pubKey, userProfile } = useGun();
  const [title, setTitle] = useState('');
  const [byline, setByline] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [knownAliases, setKnownAliases] = useState<Record<string, string>>({}); // Store aliases for UI display
  
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
    if (existingSubmission) {
        setTitle(existingSubmission.title);
        setByline(existingSubmission.byline || '');
        setLyrics(existingSubmission.lyrics || '');
        setCollaborators(Object.keys(existingSubmission.collaborators || {}));
    } else {
        if (!user) return;
        user.get('preferences').get('lastByline').once((data: any) => {
            if (data && typeof data === 'string') {
                setByline(data);
            }
        });
    }
  }, [existingSubmission, user]);

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'recorded-track.webm', { type: 'audio/webm' });
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

            // Upload
            const { url } = await uploadFile(audioFile, (user as any).is);
            audioUrlStr = url;
        }

        // 2. Handle Art (New Upload or Keep Existing)
        let artworkUrlStr = existingSubmission?.artworkUrl || '';
        if (artFile) {
            const { url } = await uploadFile(artFile, (user as any).is);
            artworkUrlStr = url;
        }

        // 3. Save to Gun
        const submissionId = existingSubmission?.id || crypto.randomUUID();
        
        // Convert collaborators array to Record<string, boolean>
        const collaboratorsMap: Record<string, boolean> = {};
        collaborators.forEach(c => collaboratorsMap[c] = true);

        // Determine final byline
        const finalByline = byline.trim() || userProfile?.alias || '';
        
        // Save preference if user typed something
        if (byline.trim()) {
            user.get('preferences').get('lastByline').put(byline.trim());
        }

        const submission: any = { // Using 'any' briefly to allow waveform string vs number[] mismatch if strict typed
            id: submissionId,
            requestId,
            title,
            byline: finalByline,
            lyrics: lyrics || '',
            audioUrl: audioUrlStr,
            artworkUrl: artworkUrlStr,
            uploaderPub: pubKey as string,
            createdAt: existingSubmission?.createdAt || Date.now(),
            collaborators: collaboratorsMap,
            waveform: waveformStr // Saved as string
        };

        // Link submission to the Request
        // We'll store it under file_requests/ID/submissions/SUB_ID -> CHANGED TO request_submissions/ID
        // Securely: Store in User Graph, then Link
        const userSubNode = user.get('submissions').get(submissionId);
        userSubNode.put(submission);
        
        // Use separate root node for submissions to allow public writes
        gun.get('request_submissions').get(requestId).get(submissionId).put(userSubNode);

        // Also link to user's public profile (Double-Linking)
        // This is crucial for the "Profile" view to show all works
        if (pubKey) {
            gun.get('all_users').get(pubKey).get('submissions').get(submissionId).put(true);
            
            // Still keep private reference if needed, but 'all_users' is the directory now
            user.get('my_submissions').get(submissionId).put(userSubNode);
        }

        // Link to collaborators' profiles
        collaborators.forEach(collabPub => {
            gun.get('all_users').get(collabPub).get('submissions').get(submissionId).put(true);
            
            // Notify Collaborator
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
            gun.get('inboxes').get(collabPub).get(notifId).put(notification);
        });

        // Notify Request Owner
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
                gun.get('inboxes').get(req.ownerPub).get(notifId).put(notification);
            }
        });

        onSuccess();
        onClose();

    } catch (err: any) {
        console.error("Submission failed", err);
        setError(err.message || "Failed to submit track.");
    } finally {
        setIsUploading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
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

            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Lyrics / Notes (Optional)</label>
                <textarea 
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none h-24"
                    placeholder="Lyrics, keys, bpm, or notes..."
                />
            </div>

            <div className="flex justify-end gap-3 pt-4">
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
                            {existingSubmission ? 'Update Submission' : 'Submit Track'}
                        </>
                    )}
                </button>
            </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

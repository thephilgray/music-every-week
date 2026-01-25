import { useState } from 'react';
import { Upload, X, Music, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { uploadFile } from '../lib/upload';
import type { Submission, Notification } from '../types';

interface SubmitTrackProps {
  requestId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function SubmitTrack({ requestId, onClose, onSuccess }: SubmitTrackProps) {
  const { gun, user, pubKey } = useGun();
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile || !title) {
        setError("Title and Audio file are required.");
        return;
    }
    
    setIsUploading(true);
    setError(null);

    try {
        // 1. Upload Audio
        const { url: audioUrlStr } = await uploadFile(audioFile); 
        
        // 2. Upload Art (Optional)
        let artworkUrlStr: string | undefined = undefined;
        if (artFile) {
            const { url } = await uploadFile(artFile);
            artworkUrlStr = url;
        }

        // 3. Save to Gun
        const submissionId = crypto.randomUUID();
        const submission: Submission = {
            id: submissionId,
            requestId,
            title,
            lyrics,
            audioUrl: audioUrlStr,
            artworkUrl: artworkUrlStr,
            uploaderPub: pubKey as string,
            createdAt: Date.now()
        };

        // Link submission to the Request
        // We'll store it under file_requests/ID/submissions/SUB_ID
        gun.get('file_requests').get(requestId).get('submissions').get(submissionId).put(submission);

        // Also link to user's submissions
        user.get('my_submissions').get(submissionId).put(submission);

        // Notify Request Owner
        gun.get('file_requests').get(requestId).once((req: any) => {
            if (req && req.ownerPub && req.ownerPub !== pubKey) {
                const notifId = crypto.randomUUID();
                const notification: Notification = {
                    id: notifId,
                    type: 'submission',
                    message: `New submission "${title}" on "${req.title}"`,
                    link: `/request/${requestId}`,
                    fromPub: pubKey as string,
                    createdAt: Date.now(),
                    read: false
                };
                gun.user(req.ownerPub).get('inbox').get(notifId).put(notification);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white">Submit Track</h2>
            <p className="text-sm text-gray-400">Upload your contribution to this request.</p>
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

            {/* Audio Upload */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Audio File (MP3/WAV)</label>
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
                            {audioFile ? audioFile.name : 'Click to select audio file'}
                        </span>
                    </label>
                </div>
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
                            {artFile ? artFile.name : 'Select image'}
                        </span>
                    </label>
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
                            Uploading...
                        </>
                    ) : (
                        <>
                            <Upload className="w-4 h-4" />
                            Submit Track
                        </>
                    )}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
}

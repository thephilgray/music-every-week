import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import type { Submission } from '../../../types';
import { SubmissionFormUI } from '../../../components/ui/SubmissionFormUI';
import { CheckCircle } from 'lucide-react';
import { generateWaveform } from '../../../lib/audio';
import { uploadToR2 } from '../../../lib/r2';

interface AuthlessSubmissionFormProps {
  requestId: string;
  playlistId: string;
  currentUserEmail: string;
  userProfileId?: string;
  deadline?: string;
  submission?: Submission | null;
}

export function AuthlessSubmissionForm({ 
    requestId, 
    playlistId, 
    currentUserEmail, 
    userProfileId, 
    deadline,
    submission 
}: AuthlessSubmissionFormProps) {
  const [title, setTitle] = useState('');
  const [byline, setByline] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [audioType, setAudioType] = useState<'upload' | 'record'>('upload');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [existingAudioUrlState, setExistingAudioUrlState] = useState<string | undefined>(undefined); // NEW
  const [existingArtworkUrlState, setExistingArtworkUrlState] = useState<string | undefined>(undefined); // NEW
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string | undefined>(undefined);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [stage, setStage] = useState('First Draft / Demo');
  const [doesNotUseAI, setDoesNotUseAI] = useState(true);
  const [isFragile, setIsFragile] = useState(false);
  const [feedbackFocus, setFeedbackFocus] = useState<string[]>([]);
  const [lyrics, setLyrics] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Effect to initialize form fields when a submission prop is provided (edit mode)
  useEffect(() => {
    if (submission) {
      setTitle(submission.title || '');
      setByline(submission.byline || '');
      setIsAnonymous(!submission.linkProfile); // If linkProfile is false, it's anonymous
      setAudioType('upload'); // Assuming existing submission means uploaded audio
      setAudioFile(null); // Clear any potentially selected new audio file
      setArtFile(null);   // Clear any potentially selected new art file
      setRecordedPreviewUrl(undefined); // Clear recorded preview

      // Set existing URLs for display
      setExistingAudioUrlState(submission.audioUrl);
      setExistingArtworkUrlState(submission.artworkUrl);

      setStage(submission.stage || 'First Draft / Demo');
      setDoesNotUseAI(!submission.usesAI); // usesAI is boolean, doesNotUseAI is inverse
      setIsFragile(!!submission.fragile); // Ensure boolean
      setFeedbackFocus(submission.feedbackFocus || []);
      setLyrics(submission.lyrics || '');
      
      // Reset upload success if we're now editing
      setUploadSuccess(false);
    } else {
      // Clear form if no submission (new submission mode)
      setTitle('');
      setByline('');
      setIsAnonymous(false);
      setAudioType('upload');
      setAudioFile(null);
      setArtFile(null);
      setRecordedPreviewUrl(undefined);
      setExistingAudioUrlState(undefined); // Clear existing URLs
      setExistingArtworkUrlState(undefined); // Clear existing URLs
      setStage('First Draft / Demo');
      setDoesNotUseAI(true);
      setIsFragile(false);
      setFeedbackFocus([]);
      setLyrics('');
      setUploadSuccess(false);
    }
  }, [submission]); // Re-run effect when submission prop changes

  const isPastDeadline = deadline ? new Date(deadline) < new Date() : false;

  const getSupportedMimeType = () => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
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
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const file = new File([audioBlob], `recorded-track.${mimeType.split('/')[1].split(';')[0]}`, { type: mimeType });
        setAudioFile(file);
        const url = URL.createObjectURL(audioBlob);
        setRecordedPreviewUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone.');
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
      setRecordedPreviewUrl(undefined);
      setIsRecording(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // For new submissions, audioFile is required. For edits, it might not be if it's not changing.
    // If no existing submission and no audio file, return.
    if (!submission && !audioFile) {
        setError("Audio file is required for new submissions.");
        return;
    }
    // If existing submission, but audio file is being provided for update, validate it.
    if (submission && audioFile && !audioFile.type.startsWith('audio/')) {
        setError("Invalid audio file format.");
        return;
    }


    setIsUploading(true);
    setError(null);

    try {
      let finalAudioUrl = submission?.audioUrl;
      let finalArtworkUrl = submission?.artworkUrl || '';
      let finalWaveform = submission?.waveform || [];

      // 1. Handle Audio Upload (only if new or changed)
      if (audioFile) { // If an audio file is selected (new submission or updating audio)
          const { url: uploadedAudioUrl } = await uploadToR2(audioFile);
          finalAudioUrl = uploadedAudioUrl;

          // 2. Generate Waveform for newly uploaded audio
          try {
              finalWaveform = await generateWaveform(audioFile);
          } catch (e) {
              console.warn("Waveform gen failed", e);
              // Do not block submission, but log error
          }
      } else if (!submission) {
          // If it's a new submission and no audioFile is provided (should be caught by initial check)
          throw new Error("Audio file is required for new submissions.");
      }

      // 3. Handle Art Upload (only if new or changed)
      if (artFile) { // If an art file is selected (new submission or updating art)
          const { url: uploadedArtworkUrl } = await uploadToR2(artFile);
          finalArtworkUrl = uploadedArtworkUrl;
      }

      const submissionData = {
        requestId,
        playlistId,
        uploaderEmail: currentUserEmail,
        audioUrl: finalAudioUrl,
        artworkUrl: finalArtworkUrl,
        title,
        byline: isAnonymous ? 'Anonymous' : (byline || 'Anonymous'),
        lyrics,
        stage,
        usesAI: !doesNotUseAI,
        fragile: isFragile,
        feedbackFocus,
        waveform: finalWaveform,
        linkProfile: !isAnonymous,
        userProfileId, // Ensure userProfileId is included
      };

      if (submission) {
        // Update existing submission
        await updateDoc(doc(db, 'submissions', submission.id!), {
          ...submissionData,
          updatedAt: serverTimestamp(), // Add an update timestamp
        });
        setUploadSuccess(true); // Indicate success for update
      } else {
        // Create new submission
        await addDoc(collection(db, 'submissions'), {
          ...submissionData,
          createdAt: serverTimestamp(),
        });
        setUploadSuccess(true);
      }
    } catch (err: any) {
      console.error("Error processing submission:", err);
      setError(err.message || 'Failed to process submission. Please try again.');
    } finally {
      setIsUploading(false); // Ensure loading state is reset
    }
  };

  if (uploadSuccess) {
      return (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-8 text-center animate-in fade-in zoom-in">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-400 mb-2">
                {submission ? "Submission Updated!" : "Submission Received!"}
            </h3>
            <p className="text-gray-400">
                {submission ? "Your track has been successfully updated." : "Your track has been successfully uploaded."}
            </p>
            <button 
                onClick={() => {
                    setUploadSuccess(false);
                    // Clear form for new submission mode, or stay on edit for update
                    if (!submission) {
                        setTitle('');
                        setAudioFile(null);
                        setArtFile(null);
                        setLyrics('');
                        setByline('');
                        setDoesNotUseAI(true);
                        setFeedbackFocus([]);
                        setStage('First Draft / Demo');
                    }
                }}
                className="mt-6 text-sm text-gray-500 hover:text-white underline"
            >
                {submission ? "Return to Editing" : "Submit another track"}
            </button>
        </div>
      );
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            Submit Your Track
        </h2>
        <SubmissionFormUI 
            title={title} setTitle={setTitle}
            byline={byline} setByline={setByline}
            isAnonymous={isAnonymous} setIsAnonymous={setIsAnonymous}
            audioType={audioType} setAudioType={setAudioType}
            audioFile={audioFile} setAudioFile={setAudioFile}
            existingAudioUrl={existingAudioUrlState} // NEW
            isRecording={isRecording} startRecording={startRecording} stopRecording={stopRecording} cancelRecording={cancelRecording} recordedPreviewUrl={recordedPreviewUrl}
            artFile={artFile} setArtFile={setArtFile}
            existingArtworkUrl={existingArtworkUrlState} // NEW
            stage={stage} setStage={setStage}
            doesNotUseAI={doesNotUseAI} setDoesNotUseAI={setDoesNotUseAI}
            isFragile={isFragile} setIsFragile={setIsFragile}
            feedbackFocus={feedbackFocus} setFeedbackFocus={setFeedbackFocus}
            lyrics={lyrics} setLyrics={setLyrics}
            onSubmit={handleSubmit}
            isUploading={isUploading}
            isDisabled={isPastDeadline} // NEW PROP
            error={error}
        />
        {isPastDeadline && (
            <p className="text-red-500 text-center mt-4 text-sm font-bold">
                The deadline for this request has passed. Submissions are no longer accepted.
            </p>
        )}
    </div>
  );
}
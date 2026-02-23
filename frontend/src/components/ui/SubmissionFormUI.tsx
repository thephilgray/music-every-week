import React from 'react';
import { UploadCloud, Music, Loader2, ImageIcon, Mic, Square, Trash2 } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { MiniPlayer } from './MiniPlayer';

interface SubmissionFormUIProps {
  title: string;
  setTitle: (val: string) => void;
  byline: string;
  setByline: (val: string) => void;
  isAnonymous: boolean;
  setIsAnonymous: (val: boolean) => void;
  
  // Audio
  audioType: 'upload' | 'record';
  setAudioType: (val: 'upload' | 'record') => void;
  audioFile: File | null;
  setAudioFile: (f: File | null) => void;
  existingAudioUrl?: string;
  
  // Recording
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  recordedPreviewUrl?: string;

  // Artwork
  artFile: File | null;
  setArtFile: (f: File | null) => void;
  existingArtworkUrl?: string;

  // Metadata
  stage: string;
  setStage: (val: string) => void;
  doesNotUseAI: boolean;
  setDoesNotUseAI: (val: boolean) => void;
  isFragile: boolean;
  setIsFragile: (val: boolean) => void;
  feedbackFocus: string[];
  setFeedbackFocus: (val: string[]) => void;
  lyrics: string;
  setLyrics: (val: string) => void;

  // Actions
  onSubmit: (e: React.FormEvent) => void;
  onCancel?: () => void;
  isUploading: boolean;
  error?: string | null;
  submitLabel?: string;
  isDisabled?: boolean; // NEW PROP
}

export function SubmissionFormUI({
  title, setTitle,
  byline, setByline,
  isAnonymous, setIsAnonymous,
  audioType, setAudioType,
  audioFile, setAudioFile, existingAudioUrl,
  isRecording, startRecording, stopRecording, cancelRecording, recordedPreviewUrl,
  artFile, setArtFile, existingArtworkUrl,
  stage, setStage,
  doesNotUseAI, setDoesNotUseAI,
  isFragile, setIsFragile,
  feedbackFocus, setFeedbackFocus,
  lyrics, setLyrics,
  onSubmit, onCancel,
  isUploading, error, submitLabel = "Submit Track",
  isDisabled = false // Destructure and provide default
}: SubmissionFormUIProps) {

  const formDisabled = isDisabled || isUploading || isRecording; // NEW

  return (
    <form onSubmit={onSubmit} className="space-y-6">
       {error && (
            <div className="bg-red-900/50 border border-red-800 text-red-200 p-4 rounded text-sm flex items-center gap-2">
                <span className="font-bold">Error:</span> {error}
            </div>
        )}

        {/* Title & Artist */}
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Track Title</label>
                <input 
                    required
                    type="text" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none transition"
                    placeholder="e.g. My Awesome Demo"
                    disabled={formDisabled}
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
                        className="flex-1 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none transition"
                        placeholder="e.g. The Band Name"
                        disabled={formDisabled}
                    />
                    
                    <button
                        type="button"
                        onClick={() => setIsAnonymous(!isAnonymous)}
                        className={`flex items-center gap-2 cursor-pointer select-none transition-all p-2 rounded-lg border w-fit ${isAnonymous ? 'bg-blue-900/30 border-blue-500/50' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                        title="Submit anonymously?"
                        disabled={formDisabled}
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
        </div>

        {/* Audio Input */}
        <div className="space-y-2">
             <label className="block text-sm font-medium text-gray-400">Audio Source</label>
             <div className="flex gap-4 mb-2 border-b border-gray-800 pb-2">
                <button
                    type="button"
                    onClick={() => { setAudioType('upload'); setAudioFile(null); }}
                    className={`text-sm pb-1 transition-colors ${audioType === 'upload' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
                    disabled={formDisabled}
                >
                    Upload File
                </button>
                <button
                    type="button"
                    onClick={() => { setAudioType('record'); setAudioFile(null); }}
                    className={`text-sm pb-1 transition-colors ${audioType === 'record' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
                    disabled={formDisabled}
                >
                    Record Audio
                </button>
            </div>

            {existingAudioUrl && !audioFile && !isRecording && (
                <div className="bg-gray-800 p-3 rounded mb-4 border border-gray-700 flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-2">
                            <Music className="w-5 h-5 text-blue-400" />
                            <span className="text-sm text-gray-300">Using existing audio</span>
                        </div>
                        <div className="text-xs text-gray-500">Select new to replace</div>
                </div>
            )}

            {audioType === 'upload' ? (
                <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                    audioFile ? 'border-green-600 bg-green-900/10' : 'border-gray-700 hover:border-blue-500 hover:bg-gray-800/50'
                }`}>
                    <input 
                        type="file" 
                        accept="audio/*"
                        onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="audio-upload-ui"
                        disabled={formDisabled}
                    />
                    <label htmlFor="audio-upload-ui" className="cursor-pointer flex flex-col items-center gap-3 w-full h-full">
                        <UploadCloud className={`w-10 h-10 ${audioFile ? 'text-green-500' : 'text-gray-500'}`} />
                        <span className="text-sm font-medium text-gray-300">
                            {audioFile ? audioFile.name : (existingAudioUrl ? 'Click to replace audio file' : 'Click or Drag to upload audio')}
                        </span>
                        {!audioFile && <span className="text-xs text-gray-500">MP3, WAV, FLAC, AIFF</span>}
                    </label>
                </div>
            ) : (
                <div className="border border-gray-700 rounded-lg p-6 bg-gray-900/50 transition-all">
                    {(!audioFile && !isRecording) && (
                        <div className="text-center py-2">
                            <button
                                type="button"
                                onClick={startRecording}
                                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center mx-auto mb-3 transition shadow-lg hover:shadow-red-900/50"
                                disabled={formDisabled}
                            >
                                <Mic className="w-8 h-8 text-white" />
                            </button>
                            <p className="text-sm text-gray-400">Click to start recording</p>
                        </div>
                    )}

                    {isRecording && (
                        <div className="text-center py-2">
                            <div className="animate-pulse text-red-500 font-bold mb-4 flex items-center justify-center gap-2">
                                <div className="w-3 h-3 bg-red-500 rounded-full" />
                                Recording...
                            </div>
                            <button
                                type="button"
                                onClick={stopRecording}
                                className="w-16 h-16 rounded-full bg-gray-800 border-2 border-red-500 flex items-center justify-center mx-auto mb-3 hover:bg-gray-700 transition"
                                disabled={formDisabled}
                            >
                                <Square className="w-6 h-6 text-red-500 fill-current" />
                            </button>
                            <p className="text-sm text-gray-400">Click to stop</p>
                        </div>
                    )}

                    {audioFile && !isRecording && (
                        <div className="flex flex-col gap-4">
                            <div className="bg-gray-800 p-3 rounded border border-gray-700 shadow-inner">
                                <MiniPlayer src={recordedPreviewUrl!} />
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={cancelRecording}
                            className="text-gray-500 hover:text-red-400 transition"
                            disabled={formDisabled}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Artwork */}
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
                    id="art-upload-ui"
                    disabled={formDisabled}
                />
                <label htmlFor="art-upload-ui" className="cursor-pointer flex flex-col items-center gap-2">
                    <ImageIcon className={`w-6 h-6 ${artFile ? 'text-green-500' : 'text-gray-500'}`} />
                    <span className="text-xs text-gray-300">
                        {artFile ? artFile.name : (existingArtworkUrl ? 'Change current image' : 'Select image (JPG, PNG)')}
                    </span>
                </label>
            </div>
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Lyrics / Notes (Optional)</label>
            <textarea 
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none h-24 transition"
                placeholder="Lyrics, keys, bpm, or notes..."
                disabled={formDisabled}
            />
        </div>

        {/* Metadata Details */}
        <div className="grid grid-cols-1 gap-4 pt-4 border-t border-gray-800">
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                    Completion Stage
                    <Tooltip content="Set the completion status of your track to help reviewers set their expectations." icon />
                </label>
                <select 
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none transition"
                    disabled={formDisabled}
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
                    id="fragile-check-ui"
                    checked={isFragile}
                    onChange={(e) => setIsFragile(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-pink-500 focus:ring-pink-500"
                    disabled={formDisabled}
                />
                <label htmlFor="fragile-check-ui" className="text-sm text-pink-300 select-none flex items-center gap-2 font-medium cursor-pointer">
                    Fragile / Compliments Only
                    <Tooltip content="Check this if you only want positive feedback or encouragement. Reviewers will be notified." icon />
                </label>
            </div>

            <div className="flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="ai-check-ui"
                    checked={doesNotUseAI}
                    onChange={(e) => setDoesNotUseAI(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500"
                    disabled={formDisabled}
                />
                <label htmlFor="ai-check-ui" className="text-sm text-gray-300 select-none flex items-center gap-2 cursor-pointer">
                    My track does not use AI
                    <Tooltip content="Some users may choose to filter out AI-generated submissions in their settings. Unchecking this might hide your submission from them." icon />
                </label>
            </div>

            <details className="group border border-gray-700 rounded bg-gray-800/30">
                <summary className="p-3 cursor-pointer text-sm font-medium text-gray-300 hover:text-white flex justify-between items-center select-none transition">
                    <span className="flex items-center gap-2">
                        Feedback Focus
                        <Tooltip content="Select specific areas you want feedback on. This guides the reviewers." icon />
                        {feedbackFocus.length > 0 && <span className="ml-2 text-blue-400 text-xs font-bold">({feedbackFocus.length})</span>}
                    </span>
                    <span className="text-gray-500 text-xs group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-4 pt-0 border-t border-gray-700/50 mt-2 space-y-4 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
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
                                    <label key={item} className="flex items-center gap-2 cursor-pointer hover:bg-gray-700/50 p-1 rounded transition">
                                        <input 
                                            type="checkbox"
                                            checked={feedbackFocus.includes(item)}
                                            onChange={(e) => {
                                                if (e.target.checked) setFeedbackFocus([...feedbackFocus, item]);
                                                else setFeedbackFocus(feedbackFocus.filter(i => i !== item));
                                            }}
                                            className="rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-blue-500"
                                            disabled={formDisabled}
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

        <div className="pt-4 border-t border-gray-800 flex justify-end gap-3">
             {onCancel && (
                 <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-gray-400 hover:text-white transition"
                    disabled={formDisabled}
                 >
                     Cancel
                 </button>
             )}
             <button 
                type="submit" 
                disabled={formDisabled || (!audioFile && !existingAudioUrl && !isRecording)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-full font-bold shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
                {isUploading ? <Loader2 className="w-5 h-5" /> : null}
                {isUploading ? 'Uploading...' : (isDisabled ? 'Deadline Passed' : submitLabel)}
            </button>
        </div>
    </form>
  );
}
import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Upload, Play, FileAudio, Pause, MessageSquare, Edit, Lock, ListPlus, Copy, Check, AlertTriangle, Loader2, FileText } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { Waveform } from '../components/ui/Waveform';
import { ArtworkDisplay } from '../components/ui/ArtworkDisplay';
import { fixUrl } from '../lib/url';
import type { FileRequest, Submission } from '../types';

export function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { participantEmail, isAdmin } = useAuth();
  const { play, currentTrack, isPlaying, pause, resume, context } = usePlayer();
  
  const [request, setRequest] = useState<FileRequest | null>(null);
  const [hostName, setHostName] = useState<string>('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [expandedLyricsMap, setExpandedLyricsMap] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  // Load Request Data
  useEffect(() => {
    async function loadRequest() {
      if (!id) return;
      setIsLoading(true);
      try {
        const docRef = doc(db, 'requests', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data() as FileRequest;
          setRequest({ id: docSnap.id, ...data });

          // Fetch Host Name if email available
          if (data.hostEmail) {
              // Try to find profile by email
              const q = query(collection(db, 'profiles'), where('email', '==', data.hostEmail));
              const querySnapshot = await getDocs(q);
              if (!querySnapshot.empty) {
                  const profile = querySnapshot.docs[0].data();
                  setHostName(profile.displayName || data.hostEmail.split('@')[0]);
              } else {
                  setHostName(data.hostEmail.split('@')[0]);
              }
          }
        } else {
          setRequest(null);
        }
      } catch (err) {
        console.error("Error fetching request:", err);
        setRequest(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadRequest();
  }, [id]);

  // Load Submissions
  useEffect(() => {
      async function loadSubmissions() {
          if (!id) return;
          try {
              const q = query(collection(db, 'submissions'), where('requestId', '==', id));
              const querySnapshot = await getDocs(q);
              const loadedSubmissions: Submission[] = [];
              querySnapshot.forEach((doc) => {
                  loadedSubmissions.push({ id: doc.id, ...doc.data() } as Submission);
              });
              setSubmissions(loadedSubmissions);
          } catch (err) {
              console.error("Error fetching submissions:", err);
          }
      }
      loadSubmissions();
  }, [id]);

  // Determine Access & Roles
  const isOwner = useMemo(() => {
      if (!request || !participantEmail) return false;
      return request.hostEmail?.toLowerCase() === participantEmail.toLowerCase();
  }, [request, participantEmail]);

  const isParticipant = useMemo(() => {
      if (!request || !participantEmail) return false;
      if (isOwner) return true;
      if (isAdmin) return true;
      return request.accessList?.some(email => email.toLowerCase() === participantEmail.toLowerCase());
  }, [request, participantEmail, isOwner, isAdmin]);

  const userSubmission = useMemo(() => {
      if (!participantEmail) return undefined;
      return submissions.find(s => s.uploaderEmail?.toLowerCase() === participantEmail.toLowerCase());
  }, [submissions, participantEmail]);

  const hasSubmitted = !!userSubmission;

  // Deadline Logic
  const now = Date.now();
  let deadlineTime = 0;
  let isPastDeadline = false;

  if (request && request.deadline) {
      const deadlineDate = new Date(request.deadline);
      deadlineTime = deadlineDate.getTime();
      isPastDeadline = now > deadlineTime;
  }

  // Playlist Live Logic
  let playlistUnlockTime = deadlineTime;
  if (request?.playlistLiveDate) {
      playlistUnlockTime = new Date(request.playlistLiveDate).getTime();
  }
  const isPlaylistLive = now > playlistUnlockTime;

  // Filtering (Stubbed for now, or simple local filter)
  const filteredSubmissions = useMemo(() => {
      // Logic for AI filtering could go here
      return submissions;
  }, [submissions]);

  // Locking Logic
  const isLocked = (sub: Submission) => {
      if (isOwner || isAdmin) return false;
      if (sub.uploaderEmail?.toLowerCase() === participantEmail?.toLowerCase()) return false;
      
      // If playlist is live, we might show tracks
      if (isPlaylistLive) {
          // If "Invitees who didn't submit" are restricted, check hasSubmitted
          if (hasSubmitted) return false;
          return true; // Locked for non-submitters
      }
      
      // If not live yet, locked
      return true;
  };

  const handlePlayAll = () => {
      if (!request) return;
      const visibleSubmissions = filteredSubmissions.filter(s => !isLocked(s));
      
      if (context?.id === request.id && visibleSubmissions.length > 0) {
          if (isPlaying) {
              pause();
          } else {
              resume();
          }
      } else if (visibleSubmissions.length > 0) {
          play(visibleSubmissions[0], visibleSubmissions, {
              type: 'request',
              id: request.id!,
              name: request.title,
              link: `/request/${request.id}`
          });
      }
  };

  const copyLink = () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-[50vh] text-gray-500">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!request) {
        return (
            <div className="max-w-5xl mx-auto py-20 text-center p-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 md:p-12 inline-block shadow-2xl">
                    <div className="bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertTriangle className="w-8 h-8 text-yellow-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Request Not Found</h2>
                    <p className="text-gray-500 mb-8 max-w-md">
                        This request may have been deleted by the host or does not exist.
                    </p>
                    <Link to="/" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition flex items-center gap-2 justify-center">
                        <ArrowLeft className="w-4 h-4" /> Return Home
                    </Link>
                </div>
            </div>
        );
    }
    
    // Access Check
    if (!isParticipant) {
         return (
            <div className="max-w-5xl mx-auto py-20 text-center p-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 md:p-12 inline-block shadow-2xl">
                    <div className="bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Lock className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                    <p className="text-gray-500 mb-8 max-w-md">
                        You do not have permission to view this request.
                    </p>
                    <Link to="/" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition flex items-center gap-2 justify-center">
                        <ArrowLeft className="w-4 h-4" /> Return Home
                    </Link>
                </div>
            </div>
         );
    }

    return (
        <div className="max-w-5xl mx-auto p-2 md:p-8">
            <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6">
                <ArrowLeft className="w-4 h-4" /> Back to Requests
            </Link>

            {/* Header / Banner */}
            <div className="flex flex-col md:flex-row gap-8 mb-10">
                <div className="w-48 h-48 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 border border-gray-700 mx-auto md:mx-0">
                    {request.artworkUrl ? (
                        <img src={fixUrl(request.artworkUrl)} alt="Cover" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">No Art</div>
                    )}
                </div>
                
                <div className="flex-1 text-center md:text-left">
                    <div className="flex flex-col md:flex-row items-center md:items-start justify-between">
                        <div className="flex items-center gap-4">
                            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{request.title}</h1>
                            <div className="flex items-center gap-1 mt-1">
                                <button 
                                    onClick={copyLink}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition"
                                    title="Copy Link"
                                >
                                    {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                                </button>
                                {/* Edit Request Button (Disabled for now) */}
                                {isOwner && (
                                    <button 
                                        disabled
                                        className="p-2 text-gray-600 cursor-not-allowed rounded-full transition"
                                        title="Edit Request (Coming Soon)"
                                    >
                                        <Edit className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-gray-400 text-sm mb-2 font-medium">
                        Hosted by <span className="text-blue-400">{hostName || 'Loading...'}</span>
                    </div>

                    <div className="relative">
                        <p className={`text-gray-300 text-lg mb-4 whitespace-pre-wrap transition-all ${isDescriptionExpanded ? '' : 'line-clamp-3'}`}>
                            {request.description}
                        </p>
                        {request.description && request.description.length > 150 && (
                            <button 
                                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                className="text-blue-400 hover:text-blue-300 text-sm font-medium mb-4 focus:outline-none"
                            >
                                {isDescriptionExpanded ? 'Show Less' : 'Read Prompt / Show More'}
                            </button>
                        )}
                    </div>
                    
                    <div className="flex flex-col md:flex-row items-center gap-2 md:gap-6 text-sm text-gray-400 mb-6 justify-center md:justify-start">
                        {request.deadline && (
                            <div className="flex items-center gap-2">
                                <Clock className={`w-4 h-4 ${isPastDeadline ? 'text-red-500' : 'text-gray-400'}`} />
                                <span className={isPastDeadline ? 'text-red-500' : ''}>
                                    Due: {new Date(request.deadline).toLocaleDateString()} {new Date(request.deadline).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZoneName: 'short'})}
                                    {isPastDeadline && <span className="text-red-500 ml-2 font-bold">CLOSED</span>}
                                </span>
                            </div>
                        )}
                        <div>ID: {id?.substring(0, 8)}...</div>
                    </div>

                    {/* Submission Button (Disabled/Stubbed) */}
                    {( (isParticipant && request.allowParticipantSubmissions !== false) || hasSubmitted || isOwner ) && (
                    <button 
                        disabled
                        className={`w-full md:w-auto bg-gray-700 text-gray-400 px-6 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition cursor-not-allowed`}
                    >
                        {isPastDeadline ? 'Submission Closed' : (hasSubmitted ? 'Edit Submission (Coming Soon)' : 'Submit Track (Coming Soon)')}
                        {hasSubmitted ? <Edit className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                    </button>
                    )}
                </div>
            </div>

            {/* Submissions List */}
            <div className="border-t border-gray-800 pt-8">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-200">Submissions ({filteredSubmissions.length})</h3>
                    {filteredSubmissions.some(s => !isLocked(s)) && (
                        <button 
                            onClick={handlePlayAll}
                            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-1.5 rounded-full text-sm font-medium transition border border-gray-700 hover:border-gray-600"
                        >
                            {context?.id === request.id && isPlaying ? (
                                <>
                                    <Pause className="w-3 h-3 fill-current" /> Pause
                                </>
                            ) : (
                                <>
                                    <Play className="w-3 h-3 fill-current" /> {context?.id === request.id ? 'Resume' : 'Play All'}
                                </>
                            )}
                        </button>
                    )}
                </div>
                
                {filteredSubmissions.length === 0 ? (
                    <div className="bg-gray-900/50 rounded-lg p-10 text-center border border-gray-800 border-dashed">
                        <p className="text-gray-500">No submissions yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredSubmissions.map((sub) => {
                            const locked = isLocked(sub);
                            const isMySubmission = sub.uploaderEmail?.toLowerCase() === participantEmail?.toLowerCase();
                            
                            return (
                            <div 
                                id={`submission-${sub.id}`} 
                                key={sub.id} 
                                className={`bg-gray-900 border ${locked ? 'border-gray-800/50 opacity-75' : 'border-gray-800'} rounded-lg p-4 transition group ${!locked ? 'cursor-pointer hover:border-gray-700' : ''}`}
                                onClick={(e) => {
                                    if (locked) return;
                                    // Don't toggle if clicking buttons
                                    if ((e.target as HTMLElement).closest('button')) return;

                                    const isExpanding = expandedSubmissionId !== sub.id;
                                    setExpandedSubmissionId(isExpanding ? (sub.id || null) : null);
                                    
                                    // Also toggle lyrics if they exist
                                    if (sub.lyrics) {
                                        setExpandedLyricsMap(prev => ({
                                            ...prev,
                                            [sub.id!]: isExpanding
                                        }));
                                    }
                                }}
                            >
                                <div className="flex flex-col md:flex-row md:items-center gap-4">
                                    {/* Artwork and Info Group */}
                                    <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
                                        <div className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center flex-shrink-0 relative">
                                            <ArtworkDisplay 
                                                src={!locked ? sub.artworkUrl : null}
                                                alt="Art"
                                                className="w-full h-full object-cover rounded"
                                                FallbackIcon={FileAudio}
                                            />
                                            {locked && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded">
                                                    <Lock className="w-4 h-4 text-gray-400" />
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <h4 className={`text-white font-medium truncate ${locked ? 'blur-sm select-none' : ''}`}>
                                                {locked ? 'Hidden Track' : sub.title}
                                            </h4>
                                            <div className="flex items-center gap-2">
                                                {/* CollaboratorList replacement for now */}
                                                <span className="text-sm text-gray-400 truncate">
                                                    {sub.byline || 'Anonymous'}
                                                </span>
                                                {isMySubmission && <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-800">You</span>}
                                            </div>
                                            {sub.waveform && sub.waveform.length > 0 && !locked && (
                                                <div className="mt-2 w-full max-w-md opacity-70 hover:opacity-100 transition hidden md:block">
                                                    <Waveform data={Array.isArray(sub.waveform) ? sub.waveform : []} />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Buttons Row */}
                                    <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-gray-800 md:border-none">
                                        <div className="flex items-center gap-2">
                                            
                                            {sub.lyrics && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setExpandedLyricsMap(prev => ({ ...prev, [sub.id!]: !prev[sub.id!] })); }}
                                                    disabled={locked}
                                                    className={`p-2 rounded-full transition ${expandedLyricsMap[sub.id!] ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white'} ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    title="Lyrics / Notes"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                            )}

                                            <button 
                                                disabled
                                                className={`p-2 rounded-full transition text-gray-600 cursor-not-allowed`}
                                                title="Comments (Coming Soon)"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                            </button>
                                            
                                            <button                                      
                                                disabled
                                                className={`p-2 rounded-full transition text-gray-600 cursor-not-allowed`}
                                                title="Add to Playlist (Coming Soon)"
                                            >
                                                <ListPlus className="w-4 h-4" />
                                            </button>
                                        </div>
                                        
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (locked) return;
                                                if (currentTrack?.id === sub.id && isPlaying) {
                                                    pause();
                                                } else {
                                                    const visibleSubmissions = filteredSubmissions.filter(s => !isLocked(s));
                                                    play(sub, visibleSubmissions, {
                                                        type: 'request',
                                                        id: request.id!,
                                                        name: request.title,
                                                        link: `/request/${request.id}`
                                                    });
                                                }
                                            }}
                                            disabled={locked}
                                            className={`w-10 h-10 md:w-8 md:h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition ml-2 ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {locked ? (
                                                <Lock className="w-3 h-3 text-gray-500" />
                                            ) : currentTrack?.id === sub.id && isPlaying ? (
                                                <Pause className="w-4 h-4" />
                                            ) : (
                                                <Play className="w-4 h-4 ml-0.5" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Mobile Waveform */}
                                {sub.waveform && sub.waveform.length > 0 && !locked && (
                                    <div className="mt-2 w-full opacity-70 block md:hidden">
                                        <Waveform data={Array.isArray(sub.waveform) ? sub.waveform : []} />
                                    </div>
                                )}
                                
                                {(expandedLyricsMap[sub.id!] && !locked) && (
                                    <div className="mt-4 px-2 md:px-4 pb-2">
                                        <h5 className="text-xs font-bold text-gray-500 uppercase mb-2">Lyrics / Notes</h5>
                                        <div className="bg-gray-950 p-2 md:p-3 rounded border border-gray-800 text-sm text-gray-300 whitespace-pre-wrap break-words font-mono">
                                            {sub.lyrics}
                                        </div>
                                    </div>
                                )}
                                
                                {expandedSubmissionId === sub.id && id && sub.id && !locked && (
                                    <div className="mt-4 px-4 py-2 bg-gray-950 rounded border border-gray-800 text-gray-500 text-sm italic text-center">
                                        Comments and feedback features are being migrated. Check back soon.
                                    </div>
                                )}
                            </div>
                        )})}
                    </div>
                )}
            </div>
            
            {/* Bottom Spacer for Player */}
            <div className="h-32" />
        </div>
    );
}
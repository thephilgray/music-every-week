import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Upload, Play, FileAudio, Pause, MessageSquare, Edit, Lock, ListPlus, Copy, Check, AlertTriangle } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { usePlayer } from '../contexts/PlayerContext';
import { SubmitTrack } from '../components/SubmitTrack';
import { CommentSection } from '../components/CommentSection';
import { AddToPlaylist } from '../components/AddToPlaylist';
import { Skeleton } from '../components/ui/Skeleton';
import { EditRequest } from '../components/EditRequest';
import type { FileRequest, Submission } from '../types';

export function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { gun, pubKey, user } = useGun();
  const { play, currentTrack, isPlaying, pause } = usePlayer();
  const [request, setRequest] = useState<FileRequest | null>(null);
  const [isVerified, setIsVerified] = useState(true); // Security Check
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [addToPlaylistSubmission, setAddToPlaylistSubmission] = useState<Submission | null>(null);
  const subscribedSubmissions = useRef(new Set<string>());
  const [copied, setCopied] = useState(false);

  // Access Mode Logic
  const [myParticipationStatus, setMyParticipationStatus] = useState<'pending' | 'accepted' | 'declined' | null>(null);

  useEffect(() => {
     if (user && id) {
         user.get('participation').get(id).on((data: any) => {
             setMyParticipationStatus(data);
         });
     }
  }, [user, id]);

  // Peer Review Logic
  const [unlockedSubmissionIds, setUnlockedSubmissionIds] = useState<string[]>([]);

  const copyLink = () => {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!id) return;

    // Fetch Request Details
    gun.get('file_requests').get(id).on((data: any) => {
        if (data) {
            // Security Verification
            // Check if the node is signed by the claimed owner
            // User nodes have soul like `~PUBKEY...`
            const soul = data._ && data._['#'];
            if (soul && typeof soul === 'string' && soul.startsWith('~')) {
                const signerPub = soul.split('~')[1].split('.')[0];
                if (data.ownerPub && signerPub !== data.ownerPub) {
                    console.warn("Security Alert: Request signer does not match ownerPub. Possible spoofing.");
                    setIsVerified(false);
                } else {
                    setIsVerified(true);
                }
            }

            let parsedParticipants = {};
            if (typeof data.participants === 'string') {
                try {
                    parsedParticipants = JSON.parse(data.participants);
                } catch (e) {
                    console.error("Failed to parse participants", e);
                }
            } else if (typeof data.participants === 'object') {
                parsedParticipants = data.participants;
            }

            setRequest({
                id: id,
                ...data,
                participants: parsedParticipants
            });
        }
    });

    // Fetch Submissions
    // clearing submissions first to avoid dupes on re-mount if effect runs again
    setSubmissions([]); 
    
    gun.get('file_requests').get(id).get('submissions').map().on((data: any, key: string) => {
        if (data) {
            // Security Check for Submissions
            const soul = data._ && data._['#'];
            if (soul && typeof soul === 'string' && soul.startsWith('~')) {
                 const signerPub = soul.split('~')[1].split('.')[0];
                 if (data.uploaderPub && signerPub !== data.uploaderPub) {
                     console.warn(`Ignored spoofed submission ${key}: signer ${signerPub} != uploader ${data.uploaderPub}`);
                     return; // Ignore spoofed submission
                 }
            }

            setSubmissions(prev => {
                let parsedWaveform = data.waveform;
                // Check if waveform is stringified (new format)
                if (typeof data.waveform === 'string') {
                    try {
                        parsedWaveform = JSON.parse(data.waveform);
                    } catch (e) {
                        console.error("Failed to parse waveform", e);
                        parsedWaveform = []; // Fallback
                    }
                }

                const safeData = { ...data, id: key, waveform: parsedWaveform }; // ensure ID is present & parsed waveform
                const exists = prev.find(s => s.id === key);
                if (exists) {
                    // Avoid update if identical to prevent re-renders
                    if (JSON.stringify(exists) === JSON.stringify(safeData)) return prev;
                    return prev.map(s => s.id === key ? safeData : s);
                }
                return [...prev, safeData];
            });

            // Count Comments for this submission
            // Use ref to ensure we only subscribe once per submission ID
            if (!subscribedSubmissions.current.has(key)) {
                subscribedSubmissions.current.add(key);
                
                const commentsSet = new Set<string>(); // Use Set to avoid dupes

                gun.get('file_requests')
                .get(id)
                .get('submissions')
                .get(key)
                .get('comments')
                .map()
                .on((cData: any, cKey: string) => {
                    if (cData) { // Just existence check is enough for count
                        commentsSet.add(cKey);
                        setCommentCounts(prev => ({ ...prev, [key]: commentsSet.size }));
                    }
                });
            }
        }
    });
    
  }, [id, gun]);

  // Determine user status
  const isOwner = pubKey && request && request.ownerPub === pubKey;
  const userSubmission = useMemo(() => submissions.find(s => s.uploaderPub === pubKey), [submissions, pubKey]);
  const hasSubmitted = !!userSubmission;

  const isParticipant = useMemo(() => {
      if (!request || !pubKey) return false;
      if (request.ownerPub === pubKey) return true;
      
      const inList = request.participants && request.participants[pubKey];
      if (!inList) return false; // Must be invited/in list

      if (request.accessMode === 'direct') return true;
      
      // Invite mode: must have accepted locally OR be marked accepted in list (legacy/fallback)
      return myParticipationStatus === 'accepted' || inList.status === 'accepted';
  }, [request, pubKey, myParticipationStatus]);

  // Deadline Logic
  const now = Date.now();
  let deadlineTime = 0;
  let isPastDeadline = false;
  let extensionHours = 0;

  if (request && request.deadline) {
      const deadlineDate = new Date(request.deadline);
      // If time is not provided in string (old format), default to end of day. 
      // New format is ISO string, so it has time.
      if (request.deadline.includes('T')) {
          deadlineTime = deadlineDate.getTime();
      } else {
          deadlineDate.setHours(23, 59, 59, 999);
          deadlineTime = deadlineDate.getTime();
      }
      
      // Check for extension
      if (pubKey && request.participants && request.participants[pubKey]) {
          extensionHours = request.participants[pubKey].extensionHours || 0;
          deadlineTime += extensionHours * 3600 * 1000;
      }
      
      isPastDeadline = now > deadlineTime;
  }

  // Unlock Logic: Select 5 random tracks if user has submitted and not yet unlocked
  useEffect(() => {
      if (!id || !user || !hasSubmitted || isPastDeadline || isOwner) return;

      // Check if we already have unlocks for this request
      user.get('unlocked_submissions').get(id).once((data: any) => {
          let currentIds: string[] = [];
          if (data) {
              try {
                  currentIds = JSON.parse(data);
              } catch (e) {
                  // ignore
              }
          }
          
          if (currentIds.length < 5) {
              // Try to find more to fill up to 5
              const needed = 5 - currentIds.length;
              
              // Candidates: Not self, and not already unlocked
              const candidates = submissions
                  .filter(s => s.uploaderPub !== pubKey && s.id && !currentIds.includes(s.id))
                  .map(s => s.id!);
              
              if (candidates.length > 0) {
                  // Shuffle candidates
                  const shuffled = candidates.sort(() => 0.5 - Math.random());
                  const toAdd = shuffled.slice(0, needed);
                  
                  const newList = [...currentIds, ...toAdd];
                  user.get('unlocked_submissions').get(id).put(JSON.stringify(newList));
                  setUnlockedSubmissionIds(newList);
              } else {
                  // Just set what we have
                  setUnlockedSubmissionIds(currentIds);
              }
          } else {
              // Already have 5
              setUnlockedSubmissionIds(currentIds);
          }
      });
  }, [id, user, hasSubmitted, isPastDeadline, isOwner, submissions, pubKey]);


  const isLocked = (sub: Submission) => {
      if (isPastDeadline) return false; // Open after deadline
      if (isOwner) return false; // Host sees all
      if (sub.uploaderPub === pubKey) return false; // Own track
      if (unlockedSubmissionIds.includes(sub.id!)) return false; // Peer review
      return true; // Locked
  };

  const handlePlayAll = () => {
      if (!request) return;
      const visibleSubmissions = submissions.filter(s => !isLocked(s));
      if (visibleSubmissions.length > 0) {
          play(visibleSubmissions[0], visibleSubmissions, {
              type: 'request',
              id: request.id!,
              name: request.title,
              link: `/request/${request.id}`
          });
      }
  };

  if (!request) {
      return (
        <div className="max-w-5xl mx-auto pb-20 p-4">
            <div className="mb-6 pt-4">
                <Skeleton className="h-5 w-32" />
            </div>
            
            <div className="flex flex-col md:flex-row gap-8 mb-10">
                <Skeleton className="w-48 h-48 rounded-lg flex-shrink-0" />
                <div className="flex-1">
                    <div className="flex items-start justify-between mb-4">
                        <Skeleton className="h-10 w-2/3" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    
                    <Skeleton className="h-6 w-full mb-2" />
                    <Skeleton className="h-6 w-3/4 mb-4" />
                    
                    <div className="flex items-center gap-6 mb-6">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-5 w-40" />
                    </div>

                    <Skeleton className="h-10 w-40 rounded-lg" />
                </div>
            </div>
            
            <div className="border-t border-gray-800 pt-8">
                <Skeleton className="h-8 w-48 mb-4" />
                <div className="space-y-4">
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Requests
      </Link>

      {/* Header / Banner */}
      <div className="flex flex-col md:flex-row gap-8 mb-10">
          <div className="w-48 h-48 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 border border-gray-700 mx-auto md:mx-0">
              {request.artworkUrl ? (
                  <img src={request.artworkUrl} alt="Cover" className="w-full h-full object-cover" />
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
                        {isOwner && (
                            <button 
                                onClick={() => setIsEditOpen(true)}
                                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition"
                                title="Edit Request"
                            >
                                <Edit className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
                {!isVerified && (
                    <div className="mt-2 bg-red-900/30 border border-red-800 text-red-300 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 max-w-max">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Unverified Source: Signer does not match Owner</span>
                    </div>
                )}
              </div>
              
              <p className="text-gray-300 text-lg mb-4">{request.description}</p>
              
              <div className="flex flex-col md:flex-row items-center gap-2 md:gap-6 text-sm text-gray-400 mb-6 justify-center md:justify-start">
                 {request.deadline && (
                     <div className="flex items-center gap-2">
                        <Clock className={`w-4 h-4 ${isPastDeadline ? 'text-red-500' : 'text-gray-400'}`} />
                        <span className={isPastDeadline ? 'text-red-500' : ''}>
                            Due: {new Date(request.deadline).toLocaleDateString()} {new Date(request.deadline).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            {extensionHours > 0 && <span className="text-green-400 ml-2">(+ {extensionHours}h extension)</span>}
                            {isPastDeadline && <span className="text-red-500 ml-2 font-bold">CLOSED</span>}
                        </span>
                     </div>
                 )}
                 <div>ID: {id?.substring(0, 8)}...</div>
              </div>

              {(isParticipant || hasSubmitted || isOwner) && (
              <button 
                onClick={() => {
                    if (!isPastDeadline) setIsSubmitOpen(true);
                }}
                disabled={isPastDeadline}
                className={`w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${isPastDeadline ? 'bg-gray-700 hover:bg-gray-700' : ''}`}
              >
                  {isPastDeadline ? 'Submission Closed' : (hasSubmitted ? 'Edit Submission' : 'Submit Track')}
                  {hasSubmitted ? <Edit className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              </button>
              )}
          </div>
      </div>

      {/* Submissions List */}
      <div className="border-t border-gray-800 pt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-200">Submissions ({submissions.length})</h3>
            {submissions.some(s => !isLocked(s)) && (
                <button 
                    onClick={handlePlayAll}
                    className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-1.5 rounded-full text-sm font-medium transition border border-gray-700 hover:border-gray-600"
                >
                    <Play className="w-3 h-3 fill-current" /> Play All
                </button>
            )}
          </div>
          
          {submissions.length === 0 ? (
            <div className="bg-gray-900/50 rounded-lg p-10 text-center border border-gray-800 border-dashed">
                <p className="text-gray-500">No submissions yet. Be the first!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
                {submissions.map((sub) => {
                    const locked = isLocked(sub);
                    const isMySubmission = sub.uploaderPub === pubKey;
                    
                    return (
                    <div key={sub.id} className={`bg-gray-900 border ${locked ? 'border-gray-800/50 opacity-75' : 'border-gray-800'} rounded-lg p-4 transition group`}>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center flex-shrink-0 relative">
                                {sub.artworkUrl && !locked ? (
                                    <img src={sub.artworkUrl} className="w-full h-full object-cover rounded" alt="Art" />
                                ) : (
                                    <FileAudio className="text-gray-600" />
                                )}
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
                                <div className="text-gray-500 text-sm truncate">
                                    by <Link to={`/profile/${sub.uploaderPub}`} className="hover:text-white hover:underline relative z-10" onClick={e => e.stopPropagation()}>
                                        {sub.byline || sub.uploaderPub?.substring(0,8)}
                                    </Link>
                                    {isMySubmission && <span className="ml-2 text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-800">You</span>}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {isMySubmission && !isPastDeadline && (
                                    <button 
                                        onClick={() => setIsSubmitOpen(true)}
                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition"
                                        title="Edit Submission"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                )}
                                
                                <button 
                                    onClick={() => setExpandedSubmissionId(expandedSubmissionId === sub.id ? null : (sub.id || null))}
                                    disabled={locked}
                                    className={`p-2 rounded-full transition flex items-center gap-1 ${expandedSubmissionId === sub.id ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white'} ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    {commentCounts[sub.id!] > 0 && (
                                        <span className="text-xs font-bold">{commentCounts[sub.id!]}</span>
                                    )}
                                </button>
                                
                                <button                                      
                                    onClick={() => setAddToPlaylistSubmission(sub)}
                                    disabled={locked}
                                    className={`p-2 rounded-full transition text-gray-400 hover:text-white ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title="Add to Playlist"
                                >
                                    <ListPlus className="w-4 h-4" />
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        if (locked) return;
                                        if (currentTrack?.id === sub.id && isPlaying) {
                                            pause();
                                        } else {
                                            play(sub, submissions, {
                                                type: 'request',
                                                id: request.id!,
                                                name: request.title,
                                                link: `/request/${request.id}`
                                            });
                                        }
                                    }}
                                    disabled={locked}
                                    className={`w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition ml-2 ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                        
                        {expandedSubmissionId === sub.id && id && sub.id && !locked && (
                            <CommentSection requestId={id} submissionId={sub.id} />
                        )}
                    </div>
                )})}
            </div>
          )}
      </div>

      {isSubmitOpen && id && (
          <SubmitTrack 
            requestId={id} 
            participants={request.participants}
            existingSubmission={userSubmission}
            onClose={() => setIsSubmitOpen(false)}
            onSuccess={() => {
                // optional: trigger a toast or refresh logic if needed
            }}
          />
      )}
      
      {isEditOpen && request && (
          <EditRequest 
             request={request}
             onClose={() => setIsEditOpen(false)}
             onUpdate={() => {
                 // GunDB updates are live, so we might not need to manually refresh state 
                 // if the listener is robust, but we can trigger a re-fetch if needed.
             }}
          />
      )}

      {addToPlaylistSubmission && (
        <AddToPlaylist 
            submission={addToPlaylistSubmission}
            onClose={() => setAddToPlaylistSubmission(null)}
        />
      )}
    </div>
  );
}

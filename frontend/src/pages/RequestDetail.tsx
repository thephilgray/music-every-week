import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, Upload, Play, FileAudio, Pause, MessageSquare, Edit, Lock, ListPlus, Copy, Check, AlertTriangle, Users, Loader2, FileText } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useToast } from '../contexts/ToastContext';
import { SubmitTrack } from '../components/SubmitTrack';
import { CommentSection } from '../components/CommentSection';
import { AddToPlaylist } from '../components/AddToPlaylist';
import { EditRequest } from '../components/EditRequest';
import { Waveform } from '../components/ui/Waveform';
import { CollaboratorList } from '../components/ui/CollaboratorList';
import type { FileRequest, Submission } from '../types';

export function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { gun, pubKey, user } = useGun();
  const { success, error } = useToast();
  const { play, currentTrack, isPlaying, pause } = usePlayer();
  const [request, setRequest] = useState<FileRequest | null>(null);
  const [hostName, setHostName] = useState<string>('');
  const [participants, setParticipants] = useState<Record<string, any>>({});
  const [isVerified, setIsVerified] = useState(true); // Security Check
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [expandedLyricsMap, setExpandedLyricsMap] = useState<Record<string, boolean>>({});
  const [addToPlaylistSubmission, setAddToPlaylistSubmission] = useState<Submission | null>(null);
  const subscribedSubmissions = useRef(new Set<string>());
  const [copied, setCopied] = useState(false);

  // Deep Link Params
  const linkedSubmissionId = searchParams.get('submission');
  const linkedCommentId = searchParams.get('comment');

  // Access Mode Logic
  const [myParticipationStatus, setMyParticipationStatus] = useState<'pending' | 'accepted' | 'declined' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
     if (user && id) {
         user.get('participation').get(id).on((data: any) => {
             setMyParticipationStatus(data);
         });
     }
  }, [user, id]);

  // Auto-Sync Participation (Migration Fix)
  useEffect(() => {
      if (!id || !pubKey || !participants || !user) return;
      
      const globalStatus = participants[pubKey]?.status;
      // If globally accepted but locally missing/different, sync it.
      if (globalStatus === 'accepted' && myParticipationStatus !== 'accepted') {
          console.log("Auto-syncing participation status...");
          user.get('participation').get(id).put('accepted');
      }
  }, [id, pubKey, participants, myParticipationStatus, user]);

  // Peer Review Logic
  const [unlockedSubmissionIds, setUnlockedSubmissionIds] = useState<string[]>([]);

  const copyLink = () => {
      let url = window.location.origin + window.location.pathname;
      if (isOwner && request?.inviteCode) {
          url += `?requestInvite=${request.inviteCode}`;
      }
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);

    // Fallback timeout for "Not Found" state
    const timer = setTimeout(() => {
        setIsLoading(false);
    }, 2000);

    // Fetch Request Details
    gun.get('file_requests').get(id).on((data: any) => {
        clearTimeout(timer);
        setIsLoading(false);
        if (data) {
            // Security Verification
            const soul = data._ && data._['#'];
            if (soul && typeof soul === 'string' && soul.startsWith('~')) {
                const parts = soul.split('~');
                // Handle case where split might result in different array lengths depending on soul format
                const afterTilde = parts[1];
                const signerPub = afterTilde ? afterTilde.split('.')[0] : '';
                
                // Normalize ownerPub (remove encryption key part if present)
                const storedOwnerPub = data.ownerPub ? data.ownerPub.split('.')[0] : '';

                if (storedOwnerPub && signerPub !== storedOwnerPub) {
                    console.warn("Security Alert: Request signer does not match ownerPub.", {
                        soul,
                        signerPub,
                        ownerPub: data.ownerPub,
                        storedOwnerPub,
                        mismatch: true
                    });
                    setIsVerified(false);
                } else {
                    setIsVerified(true);
                }
            } else {
                // Not a user node (public node), technically unverified but maybe intended
                // For now, assume verified if it matches our ID structure or logic
                setIsVerified(true);
            }
            
            // We load participants separately via .map() below
            setRequest({
                id: id,
                ...data,
                participants: {} // Placeholder, populated by separate state
            });

            // Fetch Host Name
            if (data.ownerPub) {
                gun.get('all_users').get(data.ownerPub).once((u: any) => {
                    if (u) setHostName(u.displayName || u.alias || 'Unknown Host');
                });
            }
        } else if (data === null) {
            // Explicitly deleted
            setRequest(null);
        }
    });

    // Fetch Participants Live (from Open Node)
    gun.get('request_participants').get(id).map().on((data: any, pub: string) => {
        if (data) {
             setParticipants(prev => ({
                 ...prev,
                 [pub]: data
             }));
        }
    });
    
  }, [id, gun]);

  // Separate Effect for Submissions to ensure clean subscription/unsubscription
  useEffect(() => {
    if (!id) return;
    
    // clearing submissions first to avoid dupes on re-mount if effect runs again
    setSubmissions([]); 
    
    const submissionsNode = gun.get('request_submissions').get(id);
    
    submissionsNode.map().on((data: any, key: string) => {
        if (data) {
            
            // Security Check for Submissions
            const soul = data._ && data._['#'];
            if (soul && typeof soul === 'string' && soul.startsWith('~')) {
                 const parts = soul.split('~');
                 const afterTilde = parts[1];
                 const signerPub = afterTilde ? afterTilde.split('.')[0] : '';
                 
                 const uploaderPub = data.uploaderPub ? data.uploaderPub.split('.')[0] : '';

                 if (uploaderPub && signerPub !== uploaderPub) {
                     console.warn(`Ignored spoofed submission ${key}: signer ${signerPub} != uploader ${uploaderPub}`);
                     return; // Ignore spoofed submission
                 }
            }

            setSubmissions(prev => {
                let parsedWaveform = data.waveform;
                let parsedFocus = data.feedbackFocus;

                // Check if waveform is stringified (new format)
                if (typeof data.waveform === 'string') {
                    try {
                        parsedWaveform = JSON.parse(data.waveform);
                    } catch (e) {
                        console.error("Failed to parse waveform", e);
                        parsedWaveform = []; // Fallback
                    }
                }
                
                // Check if feedbackFocus is stringified
                if (typeof data.feedbackFocus === 'string') {
                    try { parsedFocus = JSON.parse(data.feedbackFocus); } catch (e) { parsedFocus = []; }
                } else if (!Array.isArray(data.feedbackFocus)) {
                    parsedFocus = [];
                }

                const safeData = { ...data, id: key, waveform: parsedWaveform, feedbackFocus: parsedFocus }; // ensure ID is present & parsed props
                
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

                // Subscribe to public comments node
                gun.get('submission_comments')
                .get(key)
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

    return () => {
        submissionsNode.map().off();
    };
  }, [id, gun]);

  // Determine user status
  const isOwner = pubKey && request && request.ownerPub === pubKey;
  const userSubmission = useMemo(() => submissions.find(s => s.uploaderPub === pubKey), [submissions, pubKey]);
  const hasSubmitted = !!userSubmission;

  const isParticipant = useMemo(() => {
      if (!request || !pubKey) return false;
      if (request.ownerPub === pubKey) return true;
      
      const inList = participants && participants[pubKey];
      if (!inList) return false; // Must be invited/in list

      if (request.accessMode === 'direct') return true;
      
      // Invite mode: must have accepted locally OR be marked accepted in list (legacy/fallback)
      return myParticipationStatus === 'accepted' || inList.status === 'accepted';
  }, [request, pubKey, participants, myParticipationStatus]); // Added participants dependency

  // Deadline Logic
  const [now] = useState(Date.now());
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
      if (pubKey && participants && participants[pubKey]) {
          extensionHours = participants[pubKey].extensionHours || 0;
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
      // If submissions are disabled for participants, it means this is a "Feedback Request" 
      // where the owner wants feedback. All tracks (owner's) should be visible immediately.
      if (request?.allowParticipantSubmissions === false) return false;
      
      // Volunteer mode is inherently open for feedback immediately
      if (request?.accessMode === 'volunteer') return false;

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

  // Deep Link Handling Effect
  useEffect(() => {
      if (linkedSubmissionId && submissions.length > 0) {
          const sub = submissions.find(s => s.id === linkedSubmissionId);
          // Check if visible (not locked)
          if (sub && !isLocked(sub)) {
              setExpandedSubmissionId(linkedSubmissionId);
              
              // Scroll to submission
              setTimeout(() => {
                  const el = document.getElementById(`submission-${linkedSubmissionId}`);
                  if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el.classList.add('ring-2', 'ring-blue-500');
                      setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500'), 2500);
                  }
              }, 600);
          }
      }
  }, [linkedSubmissionId, submissions.length]); // Intentionally minimal deps

  // Invite Acceptance Logic
  const isInvited = useMemo(() => {
      if (!pubKey || !participants) return false;
      const p = participants[pubKey];
      return p && (p.status === 'invited' || p.status === 'pending');
  }, [pubKey, participants]);

  const acceptedCount = useMemo(() => {
      return Object.values(participants).filter(p => p.status === 'accepted').length;
  }, [participants]);

  const handleAcceptInvite = async () => {
      if (!id || !pubKey || !request) return;
      
      // Check Seat Limit
      if (request.poolSeats && acceptedCount >= request.poolSeats) {
          error("Sorry, all volunteer seats for this request have been filled.");
          return;
      }

      try {
          // Write to public participants node
          const partData = {
              alias: participants[pubKey]?.alias || 'Volunteer',
              status: 'accepted',
              email: participants[pubKey]?.email || '',
              joinedAt: Date.now()
          };
          
          await gun.get('request_participants').get(id).get(pubKey).put(partData);
          
          // Write to local participation
          user.get('participation').get(id).put('accepted');
          
          success("You have successfully joined the request!");
          setMyParticipationStatus('accepted');
      } catch (e) {
          console.error("Failed to accept invite", e);
          error("Failed to accept invite. Please try again.");
      }
  };

  const handleDeclineInvite = async () => {
      if (!id || !pubKey) return;
      try {
          await gun.get('request_participants').get(id).get(pubKey).get('status').put('declined');
          user.get('participation').get(id).put('declined');
          success("Invite declined.");
          setMyParticipationStatus('declined');
      } catch (e) {
          error("Error declining invite");
      }
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
        
          return (
            <div className="max-w-5xl mx-auto p-4 md:p-8">      <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Requests
      </Link>

      {/* Volunteer Invite Banner */}
      {isInvited && (
          <div className="bg-indigo-900/40 border border-indigo-500/50 rounded-lg p-4 mb-8 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
              <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Users className="w-5 h-5 text-indigo-400" />
                      Volunteer Invite
                  </h3>
                  <p className="text-gray-300 text-sm">
                      You have been invited to provide feedback on this request.
                      {request.poolSeats && (
                          <span className="block mt-1 text-indigo-300 font-mono">
                              Open Seats: {Math.max(0, request.poolSeats - acceptedCount)} / {request.poolSeats}
                          </span>
                      )}
                  </p>
              </div>
              <div className="flex items-center gap-3">
                  <button 
                      onClick={handleDeclineInvite}
                      className="px-4 py-2 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition text-sm"
                  >
                      Decline
                  </button>
                  <button 
                      onClick={handleAcceptInvite}
                      className="px-6 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-900/50 transition transform hover:scale-105"
                  >
                      Accept Invite
                  </button>
              </div>
          </div>
      )}

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
              
              <div className="text-gray-400 text-sm mb-2 font-medium">
                  Hosted by <Link to={`/profile/${request.ownerPub}`} className="text-blue-400 hover:underline">{hostName || 'Loading...'}</Link>
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

              {( (isParticipant && request.allowParticipantSubmissions !== false) || hasSubmitted || isOwner ) && (
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
                    <div id={`submission-${sub.id}`} key={sub.id} className={`bg-gray-900 border ${locked ? 'border-gray-800/50 opacity-75' : 'border-gray-800'} rounded-lg p-4 transition group`}>
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
                                <div className="flex items-center gap-2">
                                    <CollaboratorList 
                                        uploaderPub={sub.uploaderPub!} 
                                        submissionId={sub.id}
                                        byline={sub.byline} 
                                        collaborators={sub.collaborators} 
                                    />
                                    {isMySubmission && <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-800">You</span>}
                                </div>
                                {sub.waveform && sub.waveform.length > 0 && !locked && (
                                     <div className="mt-2 w-full max-w-md opacity-70 hover:opacity-100 transition">
                                         <Waveform data={Array.isArray(sub.waveform) ? sub.waveform : []} />
                                     </div>
                                 )}
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
                                
                                {sub.lyrics && (
                                    <button 
                                        onClick={() => setExpandedLyricsMap(prev => ({ ...prev, [sub.id!]: !prev[sub.id!] }))}
                                        disabled={locked}
                                        className={`p-2 rounded-full transition ${expandedLyricsMap[sub.id!] ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white'} ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        title="Lyrics / Notes"
                                    >
                                        <FileText className="w-4 h-4" />
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
                        
                        {(expandedLyricsMap[sub.id!] && !locked) && (
                            <div className="mt-4 px-4 pb-2">
                                <h5 className="text-xs font-bold text-gray-500 uppercase mb-2">Lyrics / Notes</h5>
                                <div className="bg-gray-950 p-3 rounded border border-gray-800 text-sm text-gray-300 whitespace-pre-wrap font-mono">
                                    {sub.lyrics}
                                </div>
                            </div>
                        )}
                        
                        {expandedSubmissionId === sub.id && id && sub.id && !locked && (
                            <div className="mt-4 px-4">
                                {(sub.stage || (sub.feedbackFocus && sub.feedbackFocus.length > 0)) && (
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {sub.stage && (
                                            <span className="px-2 py-1 rounded bg-blue-900/30 border border-blue-800 text-blue-300 text-xs font-medium">
                                                Stage: {sub.stage}
                                            </span>
                                        )}
                                        {sub.feedbackFocus?.map(focus => (
                                            <span key={focus} className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs">
                                                {focus}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <CommentSection 
                                    requestId={id} 
                                    submissionId={sub.id} 
                                    highlightCommentId={linkedCommentId || undefined}
                                    accessMode={request.accessMode}
                                    requestTitle={request.title}
                                />
                            </div>
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
            accessMode={request.accessMode}
            onClose={() => setIsSubmitOpen(false)}
            onSuccess={(newSub) => {
                if (newSub) {
                    // Manually inject into state for instant feedback
                    setSubmissions(prev => {
                        // Parse feedbackFocus if stringified (which it is from SubmitTrack)
                        let parsedFocus = newSub.feedbackFocus;
                        if (typeof newSub.feedbackFocus === 'string') {
                            try { parsedFocus = JSON.parse(newSub.feedbackFocus); } catch(e) { parsedFocus = []; }
                        }
                        
                        // Parse waveform if stringified
                        let parsedWaveform = newSub.waveform;
                        if (typeof newSub.waveform === 'string') {
                            try { parsedWaveform = JSON.parse(newSub.waveform); } catch(e) { parsedWaveform = []; }
                        }

                        const safeSub = { ...newSub, feedbackFocus: parsedFocus, waveform: parsedWaveform };
                        
                        // Replace if exists (edit), else add
                        const idx = prev.findIndex(s => s.id === safeSub.id);
                        if (idx >= 0) {
                            const copy = [...prev];
                            copy[idx] = safeSub;
                            return copy;
                        }
                        return [safeSub, ...prev];
                    });
                }
            }}
          />
      )}
      
      {isEditOpen && request && (
          <EditRequest 
             request={{ ...request, participants }}
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

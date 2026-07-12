import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, Upload, Play, Pause, Edit, Lock, Copy, Check, AlertTriangle, Loader2, Shuffle, Filter } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useToast } from '../contexts/ToastContext';
import { SubmitTrack } from '../components/SubmitTrack';
import { EditPrompt } from '../components/EditPrompt'; // Added import
import { SubmissionCard } from '../components/SubmissionCard';
import { fixUrl } from '../lib/url';
import { seededRandom, getTimestampAsNumber, copyToClipboard } from '../lib/utils'; // Added imports
import { FilterPopover } from '../components/ui/FilterPopover'; // Added import
import { useListenedTracks } from '../hooks/useListenedTracks';
import { safeGetItem, safeSetItem } from '../lib/storage';
import type { Prompt, Submission } from '../types';

export function PromptDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation(); // Added useLocation
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, participantEmail, isAdmin, settings, profile: authProfile } = useAuth();
  const { play, currentTrack, isPlaying, pause, resume, context } = usePlayer();
  const { toast } = useToast();
  
  const scrolledRef = useRef(false);
  const toastShownRef = useRef(false);

  // Reset scrolledRef when ID changes
  useEffect(() => {
    scrolledRef.current = false;
    toastShownRef.current = false;
  }, [id]);

  const removeCommentParam = useCallback(() => {
    if (searchParams.has('comment')) {
        const commentId = searchParams.get('comment');
        if (commentId) setHighlightCommentIdState(commentId);
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('comment');
        setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [request, setRequest] = useState<Prompt | null>(null);
  const [hostName, setHostName] = useState<string>('');
  const [hostProfileId, setHostProfileId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [resolvedArtistNames, setResolvedArtistNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [highlightCommentIdState, setHighlightCommentIdState] = useState<string | undefined>(undefined);
  
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submissionCommentCounts, setSubmissionCommentCounts] = useState<Record<string, number>>({});
  
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submissionToEdit, setSubmissionToEdit] = useState<Submission | null>(null);
  const [isEditRequestOpen, setIsEditRequestOpen] = useState(false); // Added state
  const [isFilterModalForced, setIsFilterModalForced] = useState(false); // Added state
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [timerColor, setTimerColor] = useState<string>('text-blue-400');

  // Filter/Sort States
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [searchTerm, setSearchTerm] = useState(() => safeGetItem('requestSearchTerm') || '');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'mostComments' | 'fewestComments' | 'alpha' | 'unlistenedFirst' | 'followedFirst'>(() => (safeGetItem('requestSortBy') as any) || 'newest');
  const [filterByAI, setFilterByAI] = useState(() => safeGetItem('requestFilterByAI') === 'true');
  const [filterByFragile, setFilterByFragile] = useState(() => safeGetItem('requestFilterByFragile') === 'true');
  const [filterByUnlistened, setFilterByUnlistened] = useState(() => safeGetItem('requestFilterByUnlistened') === 'true');
  const [filterByFollowing, setFilterByFollowing] = useState(() => safeGetItem('requestFilterByFollowing') === 'true');
  const { listenedTracks } = useListenedTracks();
  const [filterByFeedbackFocus, setFilterByFeedbackFocus] = useState<string[]>(() => {
    try {
        const stored = safeGetItem('requestFilterByFeedbackFocus');
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
  });

  const areFiltersActive = useMemo(() => {
    return (
      searchTerm !== '' ||
      sortBy !== 'newest' ||
      filterByAI === true ||
      filterByFragile === true ||
      filterByUnlistened === true ||
      filterByFollowing === true ||
      filterByFeedbackFocus.length > 0
    );
  }, [searchTerm, sortBy, filterByAI, filterByFragile, filterByUnlistened, filterByFollowing, filterByFeedbackFocus]);

  const handleClearAllFilters = useCallback(() => {
    setSearchTerm('');
    setSortBy('newest');
    setFilterByAI(false);
    setFilterByFragile(false);
    setFilterByUnlistened(false);
    setFilterByFollowing(false);
    setFilterByFeedbackFocus([]);
    removeCommentParam();
  }, [removeCommentParam]);

  const handleEditFiltersFromToast = useCallback(() => {
    setIsFilterModalForced(true);
    setShowFilterPopover(true);
  }, []);

  // Debounce search term
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 1500); // 1500ms debounce delay
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  useEffect(() => {
    safeSetItem('requestSearchTerm', searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    safeSetItem('requestSortBy', sortBy);
  }, [sortBy]);

  useEffect(() => {
    safeSetItem('requestFilterByAI', String(filterByAI));
  }, [filterByAI]);

  useEffect(() => {
    safeSetItem('requestFilterByFragile', String(filterByFragile));
  }, [filterByFragile]);

  useEffect(() => {
    safeSetItem('requestFilterByUnlistened', String(filterByUnlistened));
  }, [filterByUnlistened]);

  useEffect(() => {
    safeSetItem('requestFilterByFeedbackFocus', JSON.stringify(filterByFeedbackFocus));
  }, [filterByFeedbackFocus]);

  // Load Request Data
  const loadRequest = useCallback(async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const docRef = doc(db, 'requests', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data() as Prompt;
          if (data.deleted) {
              setRequest(null);
              setIsLoading(false);
              return;
          }
          setRequest({ id: docSnap.id, ...data });

          // Fetch Host Name if email available
          if (data.hostEmail) {
              // Try to find profile by email
              const q = query(collection(db, 'profiles'), where('email', '==', data.hostEmail));
              const querySnapshot = await getDocs(q);
              if (!querySnapshot.empty) {
                  const profileDoc = querySnapshot.docs[0];
                  const profile = profileDoc.data();
                  setHostName(profile.displayName || data.hostEmail.split('@')[0]);
                  setHostProfileId(profileDoc.id); // Store UID
              } else {
                  setHostName(data.hostEmail.split('@')[0]);
                  setHostProfileId(null);
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
  }, [id]);

    // Load Submissions
  const loadSubmissions = useCallback(async () => {
      if (!id) return;
      try {
          const q = query(collection(db, 'submissions'), where('requestId', '==', id));
          const querySnapshot = await getDocs(q);
          const loadedSubmissions: Submission[] = [];
          const missingProfilesToFetch = new Set<string>();
          const newResolvedNames: Record<string, string> = {};

          querySnapshot.forEach((doc) => {
              const sub = { id: doc.id, ...doc.data() } as Submission;
              loadedSubmissions.push(sub);
              
              if (sub.byline) {
                  // If it has a byline, we use that for the final name
                  newResolvedNames[sub.id!] = sub.byline;
              } else if (sub.uploaderUid || sub.originalUploaderPub) {
                  // Need to fetch profile
                  missingProfilesToFetch.add(sub.uploaderUid || sub.originalUploaderPub);
              } else if (sub.uploaderEmail) {
                  newResolvedNames[sub.id!] = sub.uploaderEmail.split('@')[0];
              }
          });
          
          setSubmissions(loadedSubmissions);

          // Fetch profiles for those missing bylines
          if (missingProfilesToFetch.size > 0) {
              const profileNames: Record<string, string> = {};
              // Note: Firestore 'in' query is limited to 10. For larger playlists, we fetch individually to be safe
              await Promise.all(Array.from(missingProfilesToFetch).map(async (uid) => {
                  try {
                      const profileDoc = await getDoc(doc(db, 'profiles', uid));
                      if (profileDoc.exists()) {
                          const pData = profileDoc.data();
                          profileNames[uid] = pData.displayName || pData.alias || 'Unknown';
                      }
                  } catch (e) {
                      console.error("Failed to fetch profile for suggestion resolution", e);
                  }
              }));

              // Map back to submissions
              loadedSubmissions.forEach(sub => {
                  if (!sub.byline) {
                      const uid = sub.uploaderUid || sub.originalUploaderPub;
                      if (uid && profileNames[uid]) {
                           newResolvedNames[sub.id!] = profileNames[uid];
                      }
                  }
              });
          }
          
          setResolvedArtistNames(newResolvedNames);

      } catch (err) {
          console.error("Error fetching submissions:", err);
      }
  }, [id]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  useEffect(() => {
      loadSubmissions();
  }, [loadSubmissions]);

  // Extension Link Redemption
  const extensionCode = searchParams.get('extension');
  useEffect(() => {
    if (!extensionCode || !id) return;
    
    // Determine the key to use for the participants map
    // We prioritize UID if logged in, otherwise use participantEmail if available
    const participantKey = user?.uid || participantEmail?.toLowerCase();
    if (!participantKey) return;

    const redeemExtension = async () => {
        try {
            const q = query(collection(db, 'extension_codes'), where('code', '==', extensionCode));
            const snap = await getDocs(q);
            
            if (snap.empty) {
                console.error("Invalid extension code.");
                return;
            }
            
            const data = snap.docs[0].data();
            if (data.requestId !== id) {
                console.error("Extension code is for a different request.");
                return;
            }
            
            // Redeem! Update the request document.
            await updateDoc(doc(db, 'requests', id), {
                [`participants.${participantKey}.extensionHours`]: data.hours,
                [`participants.${participantKey}.status`]: 'accepted' // Ensure they're accepted
            });
            
            toast(`Extension applied! +${data.hours}h granted.`, { type: 'success' });
            
            // Clear param from URL
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('extension');
            setSearchParams(newParams, { replace: true });
            
            // Refresh request data
            loadRequest();
        } catch (e) {
            console.error("Failed to redeem extension", e);
            toast("Failed to apply extension link.", { type: 'error' });
        }
    };

    redeemExtension();
  }, [extensionCode, id, user?.uid, participantEmail, searchParams, setSearchParams, loadRequest, toast]);

  // Determine Access & Roles
  const isOwner = useMemo(() => {
     if (!request || !participantEmail) return false;
     return isAdmin || request.hostEmail?.toLowerCase() === participantEmail.toLowerCase();
  }, [request, participantEmail, isAdmin]);
  const isParticipant = useMemo(() => {
      if (!request || !participantEmail) return false;
      if (isOwner) return true;
      if (isAdmin) return true;
      
      // Check access list (emails)
      const inAccessList = request.accessList?.some(email => email.toLowerCase() === participantEmail.toLowerCase());
      if (inAccessList) return true;

      // Check participants map (UID or Email)
      const participantKey = user?.uid || participantEmail.toLowerCase();
      if (request.participants && (request.participants[participantKey] || request.participants[participantEmail.toLowerCase()] || request.participants[participantEmail])) {
          return true;
      }

      return false;
  }, [request, participantEmail, isOwner, isAdmin, user?.uid]);

  const userSubmission = useMemo(() => {
      if (!participantEmail) return undefined;
      return submissions.find(s => s.uploaderEmail?.toLowerCase() === participantEmail.toLowerCase());
  }, [submissions, participantEmail]);

  const hasSubmitted = !!userSubmission;

  // Deadline Logic
  const now = Date.now();
  const deadlineTime = getTimestampAsNumber(request?.deadline);

  // Extension Logic
  const userExtensionHours = useMemo(() => {
      if (!request?.participants) return 0;
      
      // 1. Try by current user UID
      if (user?.uid && request.participants[user.uid]) {
          return request.participants[user.uid].extensionHours || 0;
      }
      
      // 2. Try by participantEmail
      if (participantEmail) {
          const p = Object.values(request.participants).find(
              p => p.email?.toLowerCase() === participantEmail.toLowerCase()
          );
          if (p) return p.extensionHours || 0;
          
          // Also check if the email itself or normalized email is a key
          if (request.participants[participantEmail]) return request.participants[participantEmail].extensionHours || 0;
          const normalizedEmail = participantEmail.toLowerCase();
          if (request.participants[normalizedEmail]) return request.participants[normalizedEmail].extensionHours || 0;
      }
      
      return 0;
  }, [request?.participants, user?.uid, participantEmail]);

  const effectiveDeadlineTime = deadlineTime > 0 ? deadlineTime + (userExtensionHours * 60 * 60 * 1000) : 0;
  const isPastEffectiveDeadline = effectiveDeadlineTime > 0 && now > effectiveDeadlineTime;

  // Countdown Timer
  useEffect(() => {
    if (!request?.deadline || isPastEffectiveDeadline) {
        setTimeLeft('');
        return;
    }

    const updateTimer = () => {
        const remaining = effectiveDeadlineTime - Date.now();
        if (remaining <= 0) {
            setTimeLeft('CLOSED');
            setTimerColor('text-red-500');
            return;
        }

        const hoursTotal = remaining / (1000 * 60 * 60);
        if (hoursTotal < 24) {
            setTimerColor('text-red-500');
        } else if (hoursTotal < 48) {
            setTimerColor('text-orange-500');
        } else {
            setTimerColor('text-blue-400');
        }

        const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

        let str = '';
        if (days > 0) str += `${days}d `;
        str += `${hours}h ${minutes}m ${seconds}s`;
        setTimeLeft(str);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [request?.deadline, effectiveDeadlineTime, isPastEffectiveDeadline]);

  // Playlist Live Logic
  const playlistLiveTime = getTimestampAsNumber(request?.playlistLiveDate);
  const playlistUnlockTime = playlistLiveTime > 0 ? playlistLiveTime : deadlineTime;
  const isPlaylistLive = playlistUnlockTime > 0 && now > playlistUnlockTime;

  const canSeeFilters = isPlaylistLive;

  // Show filter notification toast on land
  useEffect(() => {
    if (areFiltersActive && canSeeFilters && !toastShownRef.current) {
        toast("Filters are active.", {
            duration: 15000,
            actions: [
                {
                    label: "Clear All",
                    onClick: handleClearAllFilters
                },
                {
                    label: "Edit Filters",
                    onClick: handleEditFiltersFromToast
                }
            ]
        });
        toastShownRef.current = true;
    }
  }, [canSeeFilters, areFiltersActive, toast, handleClearAllFilters, handleEditFiltersFromToast]); 

  // Determine which tracks this user is allowed to preview if they have submitted
  const previewTrackIds = useMemo(() => {
      const previewCount = request?.previewTrackCount !== undefined ? request.previewTrackCount : 5;
      if (!hasSubmitted || previewCount === 0 || isOwner || isAdmin) return [];
      
      const otherSubs = submissions.filter(s => s.uploaderEmail?.toLowerCase() !== participantEmail?.toLowerCase());
      
      // Hash email to predictably rotate assigned tracks
      let hash = 0;
      if (participantEmail) {
          for (let i = 0; i < participantEmail.length; i++) {
              hash = participantEmail.charCodeAt(i) + ((hash << 5) - hash);
          }
      }
      
      const startIndex = Math.abs(hash) % Math.max(1, otherSubs.length);
      const rotatedSubs = [...otherSubs.slice(startIndex), ...otherSubs.slice(0, startIndex)];
      
      return rotatedSubs.slice(0, previewCount).map(s => s.id);
  }, [submissions, participantEmail, hasSubmitted, request?.previewTrackCount, isOwner, isAdmin]);
  const searchSuggestions = useMemo(() => {
    const suggestions = new Set<string>();
    submissions.forEach(sub => {
      if (sub.title) suggestions.add(sub.title);
      if (sub.id && resolvedArtistNames[sub.id]) suggestions.add(resolvedArtistNames[sub.id]);
    });
    return Array.from(suggestions).sort();
  }, [submissions, resolvedArtistNames]);

// Filtering, sorting and locking logic for visible submissions
const computedVisibleSubmissions = useMemo(() => {
    let filtered = submissions;
    const followedUids = authProfile?.following || [];
    const params = new URLSearchParams(location.search);
    const targetSubmissionId = params.get('submission');

    // Always apply global AI filter if enabled in settings
    if (settings?.content?.filterAI) {
        filtered = filtered.filter(s => !s.usesAI);
    }

    const shouldApplyFilters = isPlaylistLive;

    if (shouldApplyFilters) {
        // Apply local filter if global is NOT already filtering
        if (!settings?.content?.filterAI && filterByAI) {
            filtered = filtered.filter(s => !s.usesAI);
        }

        // Apply search term filter
        if (debouncedSearchTerm) {
            const term = debouncedSearchTerm.toLowerCase();
            filtered = filtered.filter(s => 
                s.title.toLowerCase().includes(term) ||
                (s.byline && s.byline.toLowerCase().includes(term)) ||
                (s.uploaderEmail && s.uploaderEmail.toLowerCase().includes(term)) ||
                s.id === targetSubmissionId // Bypass search filter for target
            );
        }

        if (filterByFragile) {
            filtered = filtered.filter(s => s.fragile || s.id === targetSubmissionId);
        }

        if (filterByUnlistened) filtered = filtered.filter(s => (s.id && !listenedTracks.has(s.id)) || s.id === targetSubmissionId);
        
        if (filterByFollowing && user?.uid) {
            filtered = filtered.filter(s => {
                const uploaderUid = s.uploaderUid || s.originalUploaderPub;
                return (uploaderUid && followedUids.includes(uploaderUid)) || s.id === targetSubmissionId;
            });
        }

          if (filterByFeedbackFocus.length > 0) {
              filtered = filtered.filter(s => s.id === targetSubmissionId || filterByFeedbackFocus.some(f => s.feedbackFocus?.includes(f)));
          }

          // Apply sorting
          const sorted = [...filtered].sort((a, b) => {
              switch (sortBy) {
                  case 'newest':
                      return getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt);
                  case 'oldest':
                      return getTimestampAsNumber(a.createdAt) - getTimestampAsNumber(b.createdAt);
                  case 'alpha':
                      return a.title.localeCompare(b.title);
                  case 'mostComments':
                      return (submissionCommentCounts[b.id!] || 0) - (submissionCommentCounts[a.id!] || 0);
                  case 'fewestComments':
                      return (submissionCommentCounts[a.id!] || 0) - (submissionCommentCounts[b.id!] || 0);
                  case 'unlistenedFirst': {
                      const aListened = a.id && listenedTracks.has(a.id) ? 1 : 0;
                      const bListened = b.id && listenedTracks.has(b.id) ? 1 : 0;
                      if (aListened !== bListened) return aListened - bListened;
                      return getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt);
                  }
                  case 'followedFirst': {
                      const aFollowed = a.uploaderUid || a.originalUploaderPub ? (followedUids.includes(a.uploaderUid || a.originalUploaderPub!) ? 0 : 1) : 1;
                      const bFollowed = b.uploaderUid || b.originalUploaderPub ? (followedUids.includes(b.uploaderUid || b.originalUploaderPub!) ? 0 : 1) : 1;
                      if (aFollowed !== bFollowed) return aFollowed - bFollowed;
                      return getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt);
                  }
                  default:
                      return 0;
              }
          });
          filtered = sorted;
      } else {
          // Default sort by newest when filters are bypassed (e.g. not live yet)
          filtered = [...filtered].sort((a, b) => getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt));
      }

      // Apply locking logic to the filtered and sorted list
      let visibleAfterLocking = filtered.filter(sub => {
          if (isOwner || isAdmin) return true; // Owner/Admin sees all
          if (sub.uploaderEmail?.toLowerCase() === participantEmail?.toLowerCase()) return true; // User sees their own submission
          
          if (isPlaylistLive) {
              return hasSubmitted; // Only submitters see other tracks if playlist is live
          }

          // If not live yet, only preview tracks for submitters
          const previewCount = request?.previewTrackCount !== undefined ? request.previewTrackCount : 5;
          return hasSubmitted && previewCount > 0 && previewTrackIds.includes(sub.id!);
      });

      // Ensure target submission is visible even if locked or otherwise filtered
      if (targetSubmissionId && !visibleAfterLocking.some(s => s.id === targetSubmissionId)) {
          const targetSub = submissions.find(s => s.id === targetSubmissionId);
          if (targetSub) {
              visibleAfterLocking.push(targetSub);
          }
      }

      return visibleAfterLocking;
  }, [submissions, settings, debouncedSearchTerm, filterByAI, filterByFragile, filterByUnlistened, filterByFollowing, filterByFeedbackFocus, sortBy, submissionCommentCounts, listenedTracks, isOwner, isAdmin, user?.uid, participantEmail, isPlaylistLive, hasSubmitted, request?.previewTrackCount, previewTrackIds, authProfile?.following, location.search]);

  const visibleSubmissions = computedVisibleSubmissions;

  // Scroll to submission logic
  useEffect(() => {
    if (submissions.length === 0 || !id) return;
    if (scrolledRef.current) return;

    const params = new URLSearchParams(location.search);
    const submissionId = params.get('submission');

    if (submissionId) {
        // Use a longer timeout on initial load to ensure rendering is complete
        const timeout = 500;
        const timer = setTimeout(() => {
            const element = document.getElementById(`submission-${submissionId}`);
            if (element) {
                // Mark as scrolled immediately to prevent other effects from fighting
                scrolledRef.current = true;
                
                // Ensure it's expanded first so children (comments) can render
                setExpandedSubmissionId(submissionId);
                
                // If there's a comment, we might want to wait for it, 
                // but scrolling to the submission card is a good first step.
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Clear the comment/submission params after successful scroll
                // We do this in one go to avoid multiple re-renders
                const newParams = new URLSearchParams(window.location.search);
                let changed = false;
                if (newParams.has('comment')) {
                    const cId = newParams.get('comment');
                    if (cId) setHighlightCommentIdState(cId);
                    newParams.delete('comment');
                    changed = true;
                }
                if (newParams.has('submission')) {
                    newParams.delete('submission');
                    changed = true;
                }
                
                if (changed) {
                    setSearchParams(newParams, { replace: true });
                }
            }
        }, timeout);
        return () => clearTimeout(timer);
    }
  }, [submissions, visibleSubmissions, location.search, setSearchParams, id]);

  // Handle scrolling when a submission is expanded to prevent layout shifts from pushing it out of view
  useEffect(() => {
    if (expandedSubmissionId) {
      // Check if we are currently handling a deep link scroll
      const params = new URLSearchParams(location.search);
      if (params.has('submission') || params.has('comment')) return;
      // Also skip if we just finished a deep link scroll (to avoid "nearest" fighting "center")
      if (scrolledRef.current && (params.get('submission') === null)) {
          // Reset scrolledRef after a delay so subsequent manual expands still work?
          // Actually, scrolledRef is for the INITIAL deeplink.
      }

      const timer = setTimeout(() => {
        const element = document.getElementById(`submission-${expandedSubmissionId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100); 
      return () => clearTimeout(timer);
    }
  }, [expandedSubmissionId, location.search]);

  useEffect(() => {
    if (!id) return;

    const qComments = query(collection(db, 'comments'), where('requestId', '==', id));
    
    const unsubscribe = onSnapshot(qComments, (commentsSnap) => {
      const counts: Record<string, number> = {};
      commentsSnap.docs.forEach(commentDoc => {
        const commentData = commentDoc.data();
        if (commentData.submissionId) {
          counts[commentData.submissionId] = (counts[commentData.submissionId] || 0) + 1;
        }
      });
      setSubmissionCommentCounts(counts);
    }, (err) => {
      console.error("Error fetching submission comment counts:", err);
      setSubmissionCommentCounts({}); // Clear counts on error
    });

    return () => unsubscribe();
  }, [id]);

  // Scroll to current track on load
  useEffect(() => {
      const params = new URLSearchParams(location.search);
      const hasDeepLink = params.has('submission') || params.has('comment');

      if (!scrolledRef.current && currentTrack && visibleSubmissions.length > 0 && !hasDeepLink) {
          const trackIsVisible = visibleSubmissions.some(s => s.id === currentTrack.id);
          if (trackIsVisible) {
              const timer = setTimeout(() => {
                  // Double check hasDeepLink inside timeout to prevent overriding deep-link scrolls
                  const currentParams = new URLSearchParams(window.location.search);
                  if (currentParams.has('submission') || currentParams.has('comment')) return;

                  const el = document.getElementById(`submission-${currentTrack.id}`);
                  if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      scrolledRef.current = true;
                  }
              }, 500);
              return () => clearTimeout(timer);
          }
      }
  }, [visibleSubmissions, currentTrack, location.search]);

  const handlePlayAll = () => {
      if (!request) return;
      
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
              link: `/prompt/${request.id}`,
              artworkUrl: request.artworkUrl
          });
      }
      removeCommentParam();
  };

  const handleShufflePlay = useCallback(() => {
    if (visibleSubmissions.length > 0) {
      const seed = `${request?.id}-${participantEmail}-${Date.now()}`; // Use Date.now() for unique shuffle each time
      const random = seededRandom(seed);
      const shuffledSubmissions = [...visibleSubmissions].sort(() => random() - 0.5);
      play(shuffledSubmissions[0], shuffledSubmissions, { 
        type: 'request', 
        id: request?.id!,
        name: request?.title || 'Prompt', 
        link: `/prompt/${request?.id}`,
        artworkUrl: request?.artworkUrl
      });
      removeCommentParam();
    }
  }, [visibleSubmissions, request, participantEmail, play, removeCommentParam]);

  const copyLink = async () => {
      const url = window.location.href;
      const copied = await copyToClipboard(url);
      if (copied) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      }
  };

  const handleSubmissionSuccess = () => {
      loadSubmissions();
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
                    <h2 className="text-2xl font-bold text-white mb-2">Prompt Not Found</h2>
                    <p className="text-gray-500 mb-8 max-w-md">
                        This prompt may have been deleted by the host or does not exist.
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
                <ArrowLeft className="w-4 h-4" /> Back to Prompts
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
                                {/* Edit Request Button */}
                                {isOwner && (
                                    <button 
                                        onClick={() => setIsEditRequestOpen(true)}
                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition"
                                        title="Edit Prompt"
                                    >
                                        <Edit className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-gray-400 text-sm mb-2 font-medium">
                        Hosted by {hostProfileId ? (
                            <Link to={`/profile/${hostProfileId}`} className="text-blue-400 hover:underline">
                                {hostName || 'Loading...'}
                            </Link>
                        ) : (
                            <span className="text-blue-400">{hostName || 'Loading...'}</span>
                        )}
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
                            <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
                                <div className="flex items-center gap-2">
                                    <Clock className={`w-4 h-4 ${isPastEffectiveDeadline ? 'text-red-500' : 'text-gray-400'}`} />
                                    <span className={isPastEffectiveDeadline ? 'text-red-500' : ''}>
                                        Due: {new Date(effectiveDeadlineTime).toLocaleDateString()} {new Date(effectiveDeadlineTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZoneName: 'short'})}
                                        {userExtensionHours > 0 && <span className="text-green-500 ml-2 font-medium">(+{userExtensionHours}h extension applied)</span>}
                                        {isPastEffectiveDeadline && <span className="text-red-500 ml-2 font-bold">CLOSED</span>}
                                    </span>
                                </div>
                                {timeLeft && !isPastEffectiveDeadline && (
                                    <div className={`${timerColor} font-mono font-bold`}>
                                        ({timeLeft} remaining)
                                    </div>
                                )}
                            </div>
                        )}
                        <div>ID: {id?.substring(0, 8)}...</div>
                    </div>

                    {/* Submission Button */}
                    {( (isParticipant && request.allowParticipantSubmissions !== false) || hasSubmitted || isOwner ) && (
                    <button 
                        onClick={() => {
                            if (!isPastEffectiveDeadline || isAdmin) {
                                setSubmissionToEdit(null);
                                setIsSubmitModalOpen(true);
                            }
                        }}
                        disabled={isPastEffectiveDeadline && !isAdmin}
                        className={`w-full md:w-auto ${isPastEffectiveDeadline && !isAdmin ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'} px-6 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition`}
                    >
                        {(isPastEffectiveDeadline && !isAdmin) ? 'Submission Closed' : ((hasSubmitted && !isAdmin) ? 'Edit Submission' : 'Submit Track')}
                        {(hasSubmitted && !isAdmin) ? <Edit className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                    </button>
                    )}
                </div>
            </div>

            {/* Submissions List */}
            <div className="border-t border-gray-800 pt-8">
                <div className="flex flex-wrap items-center justify-between gap-y-4 mb-4 relative"> {/* Made this parent div relative */}
                    <h3 className="text-xl font-bold text-gray-200 whitespace-nowrap pr-4">Submissions ({visibleSubmissions.length})</h3>
                    <div className="flex gap-2 items-center flex-shrink-0"> {/* Flex container for play/shuffle/filter buttons */}
                        {canSeeFilters && visibleSubmissions.length > 0 && (
                            <button
                                onClick={handlePlayAll}
                                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-1.5 rounded-full text-sm font-medium transition border border-gray-700 hover:border-gray-600 whitespace-nowrap"
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
                        {canSeeFilters && visibleSubmissions.length > 0 && (
                            <button
                                onClick={handleShufflePlay}
                                className="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full transition flex-shrink-0" title="Shuffle"
                            >
                                <Shuffle className="w-5 h-5" />
                            </button>
                        )}                        {/* Filter Button and Popover, now directly within the wider flex container */}
                        {canSeeFilters && (
                        <>
                            <button 
                                onClick={() => setShowFilterPopover(!showFilterPopover)} 
                                className={`p-2 rounded-full transition ${areFiltersActive ? 'bg-blue-900/50 text-blue-400 border border-blue-500/50' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                                title="Filter & Sort"
                            >
                                <Filter className="w-5 h-5" />
                            </button>
                            {showFilterPopover && (
                                <FilterPopover
                                    searchTerm={searchTerm}
                                    setSearchTerm={setSearchTerm}
                                    searchSuggestions={searchSuggestions}
                                    sortBy={sortBy}
                                    setSortBy={setSortBy}
                                    filterByAI={filterByAI}
                                    setFilterByAI={setFilterByAI}
                                    filterByFragile={filterByFragile}
                                    setFilterByFragile={setFilterByFragile}
                                    filterByUnlistened={filterByUnlistened}
                                    setFilterByUnlistened={setFilterByUnlistened}
                                    filterByFollowing={filterByFollowing}
                                    setFilterByFollowing={setFilterByFollowing}
                                    filterByFeedbackFocus={filterByFeedbackFocus}
                                    setFilterByFeedbackFocus={setFilterByFeedbackFocus}
                                    onClose={() => {
                                        setShowFilterPopover(false);
                                        setIsFilterModalForced(false);
                                    }}
                                    forceModal={isFilterModalForced}
                                />
                            )}
                        </>
                        )}
                    </div>
                </div>                
                {visibleSubmissions.length === 0 && (searchTerm || sortBy !== 'newest' || filterByAI || filterByFragile || filterByUnlistened || filterByFollowing || filterByFeedbackFocus.length > 0) ? (
                    <div className="bg-gray-900/50 rounded-lg p-10 text-center border border-gray-800 border-dashed flex flex-col items-center gap-4">
                        <p className="text-gray-500">No submissions found matching your filters.</p>
                        <button 
                            onClick={handleClearAllFilters} 
                            className="text-blue-400 hover:text-blue-300 text-sm font-medium focus:outline-none"
                        >
                            Clear Filters
                        </button>
                    </div>
                ) : visibleSubmissions.length === 0 ? (
                    <div className="bg-gray-900/50 rounded-lg p-10 text-center border border-gray-800 border-dashed">
                        <p className="text-gray-500">No submissions yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {visibleSubmissions.map((sub) => {
                            const locked = !(isOwner || isAdmin || (sub.uploaderEmail?.toLowerCase() === participantEmail?.toLowerCase()) || (isPlaylistLive && hasSubmitted) || (hasSubmitted && previewTrackIds.includes(sub.id)));
                            const isMySubmission = sub.uploaderEmail?.toLowerCase() === participantEmail?.toLowerCase();
                            const commentCount = submissionCommentCounts[sub.id!] || 0;
                            const isCurrent = currentTrack?.id === sub.id;
                            
                            return (
                                <SubmissionCard
                                    key={sub.id}
                                    submission={sub}
                                    isLocked={locked}
                                    isPlaying={isPlaying}
                                    isCurrent={isCurrent}
                                    onPlay={() => {
                                        play(sub, visibleSubmissions, {
                                            type: 'request',
                                            id: request.id!,
                                            name: request.title,
                                            link: `/prompt/${request.id}`,
                                            artworkUrl: request.artworkUrl
                                        });
                                        removeCommentParam();
                                    }}
                                    onPause={pause}
                                    commentCount={commentCount}
                                    isExpanded={expandedSubmissionId === sub.id}
                                    onToggleExpand={() => {
                                        const isExpanding = expandedSubmissionId !== sub.id;
                                        setExpandedSubmissionId(isExpanding ? (sub.id || null) : null);
                                    }}
                                    currentUserEmail={participantEmail}
                                    requestId={id}
                                    isMySubmission={isMySubmission}
                                    isAdmin={isAdmin}
                                    onEdit={() => {
                                        setSubmissionToEdit(sub);
                                        setIsSubmitModalOpen(true);
                                    }}
                                    highlightCommentId={highlightCommentIdState || new URLSearchParams(location.search).get('comment') || undefined}
                                    isListened={sub.id ? listenedTracks.has(sub.id) : false}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
            
            {/* Submit Modal */}
            {isSubmitModalOpen && request && (
                <SubmitTrack 
                    requestId={request.id!}
                    participants={request.participants}
                    existingSubmission={submissionToEdit || (!isAdmin ? userSubmission : undefined)}
                    onClose={() => {
                        setIsSubmitModalOpen(false);
                        setSubmissionToEdit(null);
                    }}
                    onSuccess={handleSubmissionSuccess}
                    accessMode={request.accessMode}
                />
            )}

            {/* Edit Request Modal */}
            {isEditRequestOpen && request && (
                <EditPrompt 
                    request={request}
                    onClose={() => setIsEditRequestOpen(false)}
                    onUpdate={() => {
                        loadRequest();
                    }}
                />
            )}
            
            {/* Bottom Spacer for Player */}
            <div className="h-32" />
        </div>
    );
};
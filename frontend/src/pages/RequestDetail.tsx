import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Clock, Upload, Play, Pause, Edit, Lock, Copy, Check, AlertTriangle, Loader2, Shuffle, Filter } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { SubmitTrack } from '../components/SubmitTrack';
import { EditRequest } from '../components/EditRequest'; // Added import
import { SubmissionCard } from '../components/SubmissionCard';
import { fixUrl } from '../lib/url';
import { seededRandom, getTimestampAsNumber } from '../lib/utils'; // Added imports
import { FilterPopover } from '../components/ui/FilterPopover'; // Added import
import { useListenedTracks } from '../hooks/useListenedTracks'; // Added import
import type { FileRequest, Submission } from '../types';

export function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation(); // Added useLocation
  const { participantEmail, isAdmin, settings } = useAuth();
  const { play, currentTrack, isPlaying, pause, resume, context } = usePlayer();
  
  const [request, setRequest] = useState<FileRequest | null>(null);
  const [hostName, setHostName] = useState<string>('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submissionCommentCounts, setSubmissionCommentCounts] = useState<Record<string, number>>({});
  
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isEditRequestOpen, setIsEditRequestOpen] = useState(false); // Added state

  // Filter/Sort States
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [searchTerm, setSearchTerm] = useState(localStorage.getItem('requestSearchTerm') || '');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'mostComments' | 'fewestComments' | 'alpha' | 'unlistenedFirst'>(
    (localStorage.getItem('requestSortBy') as any) || 'newest'
  );
  const [filterByAI, setFilterByAI] = useState(localStorage.getItem('requestFilterByAI') === 'true');
  const [filterByFragile, setFilterByFragile] = useState(localStorage.getItem('requestFilterByFragile') === 'true');
  const [filterByUnlistened, setFilterByUnlistened] = useState(localStorage.getItem('requestFilterByUnlistened') === 'true');
  const { listenedTracks } = useListenedTracks();
  const [filterByFeedbackFocus, setFilterByFeedbackFocus] = useState<string[]>(
    JSON.parse(localStorage.getItem('requestFilterByFeedbackFocus') || '[]')
  );

  const areFiltersActive = useMemo(() => {
    return (
      searchTerm !== '' ||
      sortBy !== 'newest' ||
      filterByAI === true ||
      filterByFragile === true ||
      filterByUnlistened === true ||
      filterByFeedbackFocus.length > 0
    );
  }, [searchTerm, sortBy, filterByAI, filterByFragile, filterByUnlistened, filterByFeedbackFocus]);

  // Debounce search term
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms debounce delay
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem('requestSearchTerm', searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem('requestSortBy', sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem('requestFilterByAI', String(filterByAI));
  }, [filterByAI]);

  useEffect(() => {
    localStorage.setItem('requestFilterByFragile', String(filterByFragile));
  }, [filterByFragile]);

  useEffect(() => {
    localStorage.setItem('requestFilterByUnlistened', String(filterByUnlistened));
  }, [filterByUnlistened]);

  useEffect(() => {
    localStorage.setItem('requestFilterByFeedbackFocus', JSON.stringify(filterByFeedbackFocus));
  }, [filterByFeedbackFocus]);

  // Load Request Data
  const loadRequest = useCallback(async () => {
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
  }, [id]);

    // Load Submissions
  const loadSubmissions = useCallback(async () => {
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
  }, [id]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  // Scroll to submission logic
  useEffect(() => {
    if (submissions.length === 0) return;

    const params = new URLSearchParams(location.search);
    const submissionId = params.get('submission');
    // Extract parameters from URL

    if (submissionId) {
        // Wait a tick for rendering
        setTimeout(() => {
            const element = document.getElementById(`submission-${submissionId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Also expand it
                setExpandedSubmissionId(submissionId);
            }
        }, 100);
    }
  }, [submissions, location.search]);

      

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

      

          return () => unsubscribe(); // Unsubscribe on cleanup

        }, [id]); // Depend only on id



  useEffect(() => {
      loadSubmissions();
  }, [loadSubmissions]);

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

  // Filtering, sorting and locking logic for visible submissions
  const computedVisibleSubmissions = useMemo(() => {
      let filtered = submissions;

      // Apply global AI filter from settings
      if (settings?.content?.filterAI) {
          filtered = filtered.filter(s => !s.usesAI);
      }

      // Apply search term filter
      if (debouncedSearchTerm) {
          const term = debouncedSearchTerm.toLowerCase();
          filtered = filtered.filter(s => 
              s.title.toLowerCase().includes(term) || 
              s.byline?.toLowerCase().includes(term) ||
              s.uploaderEmail?.toLowerCase().includes(term)
          );
      }

      // Apply specific filter toggles
      if (filterByAI) filtered = filtered.filter(s => !s.usesAI);
      if (filterByFragile) filtered = filtered.filter(s => s.fragile);
      if (filterByUnlistened) filtered = filtered.filter(s => s.id && !listenedTracks.has(s.id));
      if (filterByFeedbackFocus.length > 0) {
          filtered = filtered.filter(s => filterByFeedbackFocus.some(f => s.feedbackFocus?.includes(f)));
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
              default:
                  return 0;
          }
      });
      filtered = sorted;

      // Apply locking logic to the filtered and sorted list
      const visibleAfterLocking = filtered.filter(sub => {
          if (isOwner || isAdmin) return true; // Owner/Admin sees all
          if (sub.uploaderEmail?.toLowerCase() === participantEmail?.toLowerCase()) return true; // User sees their own submission
          
          if (isPlaylistLive) {
              return hasSubmitted; // Only submitters see other tracks if playlist is live
          }

          // If not live yet, only preview tracks for submitters
          const previewCount = request?.previewTrackCount !== undefined ? request.previewTrackCount : 5;
          return hasSubmitted && previewCount > 0 && previewTrackIds.includes(sub.id!);
      });

      return visibleAfterLocking;
  }, [submissions, settings, debouncedSearchTerm, filterByAI, filterByFragile, filterByUnlistened, filterByFeedbackFocus, sortBy, submissionCommentCounts, listenedTracks, isOwner, isAdmin, participantEmail, isPlaylistLive, hasSubmitted, request?.previewTrackCount, previewTrackIds]);

  const visibleSubmissions = computedVisibleSubmissions;

  const scrolledRef = useRef(false);

  // Scroll to current track on load
  useEffect(() => {
      if (!scrolledRef.current && currentTrack && visibleSubmissions.length > 0) {
          const trackIsVisible = visibleSubmissions.some(s => s.id === currentTrack.id);
          if (trackIsVisible) {
              setTimeout(() => {
                  const el = document.getElementById(`submission-${currentTrack.id}`);
                  if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      scrolledRef.current = true;
                  }
              }, 500);
          }
      }
  }, [visibleSubmissions, currentTrack]);

  const handleClearAllFilters = useCallback(() => {
    setSearchTerm('');
    setSortBy('newest');
    setFilterByAI(false);
    setFilterByFragile(false);
    setFilterByUnlistened(false);
    setFilterByFeedbackFocus([]);
  }, []);

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
              link: `/request/${request.id}`,
              artworkUrl: request.artworkUrl
          });
      }
  };

  const handleShufflePlay = useCallback(() => {
    if (visibleSubmissions.length > 0) {
      const seed = `${request?.id}-${participantEmail}-${Date.now()}`; // Use Date.now() for unique shuffle each time
      const random = seededRandom(seed);
      const shuffledSubmissions = [...visibleSubmissions].sort(() => random() - 0.5);
      play(shuffledSubmissions[0], shuffledSubmissions, { 
        type: 'request', 
        id: request?.id!,
        name: request?.title || 'Request', 
        link: `/request/${request?.id}`,
        artworkUrl: request?.artworkUrl
      });
    }
  }, [visibleSubmissions, request, participantEmail, play]);

  const copyLink = () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
                                {/* Edit Request Button */}
                                {isOwner && (
                                    <button 
                                        onClick={() => setIsEditRequestOpen(true)}
                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition"
                                        title="Edit Request"
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

                    {/* Submission Button */}
                    {( (isParticipant && request.allowParticipantSubmissions !== false) || hasSubmitted || isOwner ) && (
                    <button 
                        onClick={() => !isPastDeadline && setIsSubmitModalOpen(true)}
                        disabled={isPastDeadline}
                        className={`w-full md:w-auto ${isPastDeadline ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'} px-6 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition`}
                    >
                        {isPastDeadline ? 'Submission Closed' : (hasSubmitted ? 'Edit Submission' : 'Submit Track')}
                        {hasSubmitted ? <Edit className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                    </button>
                    )}
                </div>
            </div>

            {/* Submissions List */}
            <div className="border-t border-gray-800 pt-8">
                <div className="flex flex-wrap items-center justify-between gap-y-4 mb-4 relative"> {/* Made this parent div relative */}
                    <h3 className="text-xl font-bold text-gray-200 whitespace-nowrap pr-4">Submissions ({visibleSubmissions.length})</h3>
                    <div className="flex gap-2 items-center flex-shrink-0"> {/* Flex container for play/shuffle/filter buttons */}
                        {visibleSubmissions.length > 0 && (
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
                        {visibleSubmissions.length > 0 && (
                            <button
                                onClick={handleShufflePlay}
                                className="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full transition flex-shrink-0" title="Shuffle"
                            >
                                <Shuffle className="w-5 h-5" />
                            </button>
                        )}                        {/* Filter Button and Popover, now directly within the wider flex container */}
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
                                sortBy={sortBy}
                                setSortBy={setSortBy}
                                filterByAI={filterByAI}
                                setFilterByAI={setFilterByAI}
                                filterByFragile={filterByFragile}
                                setFilterByFragile={setFilterByFragile}
                                filterByUnlistened={filterByUnlistened}
                                setFilterByUnlistened={setFilterByUnlistened}
                                filterByFeedbackFocus={filterByFeedbackFocus}
                                setFilterByFeedbackFocus={setFilterByFeedbackFocus}
                                onClose={() => setShowFilterPopover(false)}
                            />
                        )}
                    </div>
                </div>                
                {visibleSubmissions.length === 0 && (searchTerm || sortBy !== 'newest' || filterByAI || filterByFragile || filterByFeedbackFocus.length > 0) ? (
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
                                            link: `/request/${request.id}`,
                                            artworkUrl: request.artworkUrl
                                        });
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
                                    highlightCommentId={new URLSearchParams(location.search).get('comment') || undefined}
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
                    existingSubmission={userSubmission}
                    onClose={() => setIsSubmitModalOpen(false)}
                    onSuccess={handleSubmissionSuccess}
                    accessMode={request.accessMode}
                />
            )}

            {/* Edit Request Modal */}
            {isEditRequestOpen && request && (
                <EditRequest 
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
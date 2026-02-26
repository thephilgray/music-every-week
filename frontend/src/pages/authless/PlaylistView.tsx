import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type { User } from 'firebase/auth'; // Import User type
import { Loader2, Music2, UserCircle, Play, Pause, Lock, ListMusic, FileAudio, FileText, MessageSquare, ListPlus, Shuffle, Filter } from 'lucide-react';
import { AuthlessLogin } from './components/AuthlessLogin';
import { usePlayer } from '../../contexts/PlayerContext';
import { MyPlaylistsModal } from './components/MyPlaylistsModal';
import { seededRandom } from '../../lib/utils';
import type { Submission, FileRequest } from '../../types'; // Re-use types if possible, or cast
import { ArtworkDisplay } from '../../components/ui/ArtworkDisplay';
import { Waveform } from '../../components/ui/Waveform';
import { AuthlessComments as CommentSection } from './components/AuthlessComments';
import { FilterPopover } from '../../components/ui/FilterPopover'; // NEW IMPORT
import { fixUrl } from '../../lib/url';

interface PlaylistData {
  id: string;
  title: string;
  description: string;
  accessList: string[];
  artworkUrl?: string;
}

export function PlaylistView() {
  const { id } = useParams<{ id: string }>();
  const { play, currentTrack, isPlaying, pause, resume } = usePlayer();

  // ==========================================================================================
  // 1. ALL STATE DECLARATIONS (useState) - MUST be at the very top, unconditionally
  // ==========================================================================================
  const [loading, setLoading] = useState(true);
  const [playlistData, setPlaylistData] = useState<PlaylistData | null>(null);
  const [requestData, setRequestData] = useState<FileRequest | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(sessionStorage.getItem('mew_auth_email'));
  const [error, setError] = useState<string | null>(null);

  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showMyPlaylists, setShowMyPlaylists] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [hostName, setHostName] = useState<string>('');
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [expandedLyricsMap, setExpandedLyricsMap] = useState<Record<string, boolean>>({});
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [showFilterPopover, setShowFilterPopover] = useState(false); // NEW STATE FOR FILTER POPOVER

  // States for filtering and sorting
  const [searchTerm, setSearchTerm] = useState(localStorage.getItem('playlistSearchTerm') || '');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'mostComments' | 'fewestComments' | 'alpha'>(
    (localStorage.getItem('playlistSortBy') as any) || 'newest'
  );
  const [filterByAI, setFilterByAI] = useState(localStorage.getItem('playlistFilterByAI') === 'true');
  const [filterByFragile, setFilterByFragile] = useState(localStorage.getItem('playlistFilterByFragile') === 'true');
  const [filterByFeedbackFocus, setFilterByFeedbackFocus] = useState<string[]>(
    JSON.parse(localStorage.getItem('playlistFilterByFeedbackFocus') || '[]')
  );

  const areFiltersActive = useMemo(() => {
    return (
      searchTerm !== '' ||
      sortBy !== 'newest' ||
      filterByAI === true ||
      filterByFragile === true ||
      filterByFeedbackFocus.length > 0
    );
  }, [searchTerm, sortBy, filterByAI, filterByFragile, filterByFeedbackFocus]);

  // Debounce search term
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms debounce delay
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem('playlistSearchTerm', searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem('playlistSortBy', sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem('playlistFilterByAI', String(filterByAI));
  }, [filterByAI]);

  useEffect(() => {
    localStorage.setItem('playlistFilterByFragile', String(filterByFragile));
  }, [filterByFragile]);

  useEffect(() => {
    localStorage.setItem('playlistFilterByFeedbackFocus', JSON.stringify(filterByFeedbackFocus));
  }, [filterByFeedbackFocus]);

  // ==========================================================================================
  // 2. ALL MEMOIZED VALUES (useMemo) and CALLBACKS (useCallback) - MUST be here, unconditionally
  // ==========================================================================================
  const computedVisibleSubmissions = useMemo(() => {
    let currentLockMessage = "";
    let filtered = submissions;

    // Apply filtering
    if (debouncedSearchTerm) { // Use debounced search term
      const lowerCaseSearchTerm = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(sub =>
        sub.title.toLowerCase().includes(lowerCaseSearchTerm) ||
        sub.byline?.toLowerCase().includes(lowerCaseSearchTerm) ||
        sub.uploaderEmail?.toLowerCase().includes(lowerCaseSearchTerm)
      );
    }

    if (filterByAI) {
      filtered = filtered.filter(sub => !sub.usesAI); // Only show tracks that do NOT use AI
    }

    if (filterByFragile) {
      filtered = filtered.filter(sub => sub.fragile); // Only show fragile tracks
    }

    if (filterByFeedbackFocus.length > 0) {
      filtered = filtered.filter(sub =>
        filterByFeedbackFocus.some(focus => sub.feedbackFocus?.includes(focus))
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      // Handle optional fields for comparison safely
      const aCreatedAt = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate().getTime() : 0;
      const bCreatedAt = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate().getTime() : 0;

      switch (sortBy) {
        case 'newest':
          return bCreatedAt - aCreatedAt;
        case 'oldest':
          return aCreatedAt - bCreatedAt;
        case 'mostComments':
          return (commentCounts[b.id!] || 0) - (commentCounts[a.id!] || 0);
        case 'fewestComments':
          return (commentCounts[a.id!] || 0) - (commentCounts[b.id!] || 0);
        case 'alpha':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });
    filtered = sorted;


    // Apply locking logic (after filtering/sorting, as it's a display filter)
    if (!isHost && requestData?.playlistLiveDate) {
      const liveDate = new Date(requestData.playlistLiveDate).getTime();
      const now = Date.now();
      if (now < liveDate && hasSubmitted) {
        const seed = `${playlistData!.id}-${currentUserEmail}`;
        const random = seededRandom(seed);

        const myTrack = filtered.find(s => s.uploaderEmail === currentUserEmail);
        const others = filtered.filter(s => s.uploaderEmail !== currentUserEmail);

        const sortedOthers = [...others].sort((a, b) => {
          const commentsA = commentCounts[a.id!] || 0;
          const commentsB = commentCounts[b.id!] || 0;
          return commentsA - commentsB;
        });

        const shuffledOthers = [...sortedOthers].sort(() => random() - 0.5);
        const previewTrackCount = requestData?.previewTrackCount !== undefined ? requestData.previewTrackCount : 5;
        const previewOthers = shuffledOthers.slice(0, previewTrackCount);

        filtered = myTrack ? [myTrack, ...previewOthers] : previewOthers;
        filtered = Array.from(new Set(filtered));
        currentLockMessage = `Playlist is not live yet. Here is a preview of ${filtered.length} tracks.`;
      } else if (now < liveDate && !hasSubmitted) {
        currentLockMessage = "Playlist is locked until the live date. Submit a track to get a preview!";
        filtered = [];
      } else {
        currentLockMessage = "";
      }
    } else if (isHost) {
      currentLockMessage = "Playlist unlocked (Host View)";
    } else {
      currentLockMessage = "";
    }
    return { filtered, lockMessage: currentLockMessage };
  }, [submissions, isHost, requestData, hasSubmitted, playlistData, currentUserEmail, commentCounts, debouncedSearchTerm, sortBy, filterByAI, filterByFragile, filterByFeedbackFocus]); // Added new dependencies

  const { filtered: visibleSubmissions, lockMessage } = computedVisibleSubmissions;

  const isLocked = useCallback((sub: Submission): boolean => {
    if (isHost) return false;
    if (requestData?.allowParticipantSubmissions === false) return false;

    if (requestData?.playlistLiveDate) {
      const liveDate = new Date(requestData.playlistLiveDate).getTime();
      const now = Date.now();
      if (now < liveDate && !hasSubmitted) {
        return true;
      }
    }

    if (requestData?.playlistLiveDate) {
      const liveDate = new Date(requestData.playlistLiveDate).getTime();
      const now = Date.now();
      if (now < liveDate && hasSubmitted) {
        return !visibleSubmissions.some(vs => vs.id === sub.id);
      }
    }

    return false;
  }, [requestData, isHost, currentUserEmail, hasSubmitted, visibleSubmissions]);


  // ==========================================================================================
  // 3. ALL EFFECTS (useEffect) - MUST be here, unconditionally
  // ==========================================================================================
  useEffect(() => {
    async function loadData() {
      if (!id) return;
      setLoading(true);
      try {
        const docRef = doc(db, 'playlists', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const pData = { id: docSnap.id, ...docSnap.data() } as PlaylistData;
          setPlaylistData(pData);

          const qRequest = query(collection(db, 'requests'), where('playlistId', '==', id));
          const requestSnap = await getDocs(qRequest);
          let reqData: FileRequest | null = null;
          if (!requestSnap.empty) {
            const reqDoc = requestSnap.docs[0];
            reqData = { id: reqDoc.id, ...reqDoc.data() } as FileRequest;
            setRequestData(reqData);

            if (reqData.hostEmail) {
              const qProfile = query(collection(db, 'profiles'), where('email', '==', reqData.hostEmail));
              const profileSnap = await getDocs(qProfile);
              if (!profileSnap.empty) {
                setHostName(profileSnap.docs[0].data().displayName || reqData.hostEmail.split('@')[0]);
              } else {
                setHostName(reqData.hostEmail.split('@')[0]);
              }
            }
          }

          const qSubs = query(collection(db, 'submissions'), where('playlistId', '==', id));
          const subsSnap = await getDocs(qSubs);
          const subs = subsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
          setSubmissions(subs);

          const qComments = query(collection(db, 'comments'), where('playlistId', '==', id));
          const commentsSnap = await getDocs(qComments);
          const counts: Record<string, number> = {};
          commentsSnap.docs.forEach(commentDoc => {
            const commentData = commentDoc.data();
            if (commentData.submissionId) {
              counts[commentData.submissionId] = (counts[commentData.submissionId] || 0) + 1;
            }
          });
          setCommentCounts(counts);
          console.log("commentCounts populated:", counts);

          if (currentUserEmail && reqData) {
            const mySub = subs.find(s => s.uploaderEmail === currentUserEmail);
            if (mySub) setHasSubmitted(true);
          }

        } else {
          setError('Playlist not found');
        }
      } catch (err) {
        console.error("Error fetching playlist:", err);
        setError('Failed to load playlist');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id, currentUserEmail]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (requestData?.hostEmail && firebaseUser?.email) {
      if (firebaseUser.email.toLowerCase() === requestData.hostEmail?.toLowerCase()) {
        if (currentUserEmail !== firebaseUser.email) {
          sessionStorage.setItem('mew_auth_email', firebaseUser.email);
          setCurrentUserEmail(firebaseUser.email);
        }
        setIsHost(true);
      } else {
        setIsHost(false);
      }
    } else {
      setIsHost(false);
    }
  }, [requestData, currentUserEmail, firebaseUser]);


  // ==========================================================================================
  // 4. HELPER FUNCTIONS (NOT hooks themselves, but can use hooks' results)
  //    These are defined here so they can be passed down or used in JSX.
  // ==========================================================================================
  const handleLogin = (email: string) => {
    if (!playlistData) return;

    const normalizedEmail = email.toLowerCase().trim();
    const isAllowed = playlistData.accessList.some(e => e.toLowerCase().trim() === normalizedEmail);

    if (isAllowed) {
      sessionStorage.setItem('mew_auth_email', normalizedEmail);
      setCurrentUserEmail(normalizedEmail);
      setError(null);
    } else {
      setError('Access denied: Email not on the playlist access list.');
    }
  };

  const handlePlay = (track: Submission, trackList: Submission[]) => {
    if (currentTrack?.id === track.id) {
      isPlaying ? pause() : resume();
    } else {
      play(track, trackList, {
        type: 'playlist',
        id: playlistData!.id,
        name: playlistData!.title,
        link: `/p/${playlistData!.id}`
      });
    }
  };

  const handleBylineClick = (uploaderEmail: string) => {
    console.log("Navigating to profile for:", uploaderEmail);
    // Implement actual navigation to /profile/userProfileId later
    // For now, assume userProfile can be found by email for a clickable byline.
  };

  const handlePlayAll = () => {
    if (visibleSubmissions.length > 0) {
      console.log("handlePlayAll: Playing filtered/sorted submissions:", visibleSubmissions.map(s => s.title));
      const isAnyVisibleTrackPlaying = isPlaying && visibleSubmissions.some(sub => sub.id === currentTrack?.id);

      if (isAnyVisibleTrackPlaying) {
        pause();
      } else {
        play(visibleSubmissions[0], visibleSubmissions, {
          type: 'playlist',
          id: playlistData!.id,
          name: playlistData!.title,
          link: `/p/${playlistData!.id}`
        });
      }
    }
  };

      const handleShufflePlay = () => {
          if (visibleSubmissions.length > 0) {
              console.log("handleShufflePlay: Shuffling and playing filtered/sorted submissions:", visibleSubmissions.map(s => s.title));
              const seed = `${playlistData!.id}-${currentUserEmail}-${Date.now()}`; // Use Date.now() for unique shuffle each time
              const random = seededRandom(seed);
              const shuffledSubmissions = [...visibleSubmissions].sort(() => random() - 0.5);
              play(shuffledSubmissions[0], shuffledSubmissions, { 
                  type: 'playlist', 
                  id: playlistData!.id, 
                  name: playlistData!.title, 
                  link: `/p/${playlistData!.id}` 
              });
          }
      };
  
      const handleClearAllFilters = useCallback(() => {
          setSearchTerm('');
          setSortBy('newest');
          setFilterByAI(false);
          setFilterByFragile(false);
          setFilterByFeedbackFocus([]);
      }, [setSearchTerm, setSortBy, setFilterByAI, setFilterByFragile, setFilterByFeedbackFocus]);
  // ==========================================================================================
  // 5. CONDITIONAL EARLY RETURNS - Must be after ALL hooks are called, and after basic helper functions.
  // ==========================================================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <Loader2 className="animate-spin w-12 h-12 text-blue-500" />
      </div>
    );
  }

  if (error && !currentUserEmail) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-red-500">Error</h1>
          <p className="text-xl text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!currentUserEmail && playlistData && !isHost) {
    return (
      <AuthlessLogin
        onLogin={handleLogin}
        error={error || undefined}
      />
    );
  }

  if (!playlistData) return null;


  // ==========================================================================================
  // 6. MAIN RENDER JSX
  // ==========================================================================================
  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <MyPlaylistsModal
        isOpen={showMyPlaylists}
        onClose={() => setShowMyPlaylists(false)}
        currentUserEmail={currentUserEmail!}
      />

      <div className="bg-gradient-to-b from-purple-900/20 to-black p-8 pt-16">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-end mb-4 gap-4"> {/* Added gap-4 */}
            <button
              onClick={() => setShowMyPlaylists(true)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"
            >
              <ListMusic className="w-4 h-4" /> My Playlists
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="w-64 h-64 bg-gray-800 rounded-xl flex items-center justify-center shadow-2xl shrink-0 mx-auto">
              {playlistData.artworkUrl ? (
                <ArtworkDisplay
                  src={fixUrl(playlistData.artworkUrl)}
                  alt="Playlist Artwork"
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <Music2 className="w-24 h-24 text-gray-600" />
              )}
            </div>

            {/* Main content area: Title, Description, Links, Lock Message */}
            <div className="flex-1 mb-4">
              <h1 className="text-4xl md:text-6xl font-black mb-4 tracking-tight">{playlistData.title}</h1>
              {hostName && (
                <p className="text-gray-400 text-sm mb-2 font-medium">
                  Hosted by <span className="text-blue-400">{hostName}</span>
                </p>
              )}

              <p className={`text-xl text-gray-300 max-w-2xl whitespace-pre-wrap transition-all ${isDescriptionExpanded ? '' : 'line-clamp-3'}`}>
                {playlistData.description}
              </p>
              {playlistData.description && playlistData.description.length > 150 && (
                <button
                  type="button"
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium mt-2 focus:outline-none"
                >
                  {isDescriptionExpanded ? 'Show Less' : 'Read Prompt / Show More'}
                </button>
              )}

              {requestData && (
                <div className="mt-4 text-sm text-gray-400">
                  From request: <a href={`/s/${requestData.id}`} className="text-purple-400 hover:underline">{requestData.title}</a>
                </div>
              )}
              {lockMessage && (
                <div className="mt-4 inline-flex items-center gap-2 bg-yellow-900/30 text-yellow-200 px-3 py-1 rounded-full text-xs font-bold border border-yellow-700/50">
                  {isHost ? <UserCircle className="w-3 h-3" /> : (lockMessage ? <Lock className="w-3 h-3" /> : <Music2 className="w-3 h-3" />)}
                  {lockMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-8">

          {(lockMessage && !isHost) ? (

            <div className="text-center py-20 bg-gray-900/30 rounded-xl border border-gray-800 border-dashed flex flex-col items-center gap-4">

              <Lock className="w-12 h-12 text-gray-600" />

              <p className="text-gray-400 max-w-md">

                This playlist is locked until <strong>{new Date(requestData?.playlistLiveDate!).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</strong>.

              </p>

              {requestData && (

                <a href={`/s/${requestData.id}`} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-bold transition">

                  Submit a track to unlock preview

                </a>

              )}

            </div>

          ) : visibleSubmissions.length === 0 &&!(searchTerm || sortBy !== 'newest' || filterByAI || filterByFragile || filterByFeedbackFocus.length > 0) ? (

            <div className="text-center py-20 bg-gray-900/30 rounded-xl border border-gray-800 border-dashed">

              <p className="text-gray-500">No tracks submitted yet.</p>

            </div>

          ) : ( // Start of the final 'else' branch

            <div className="flex flex-col gap-4"> {/* Use a div as the top-level element */}



              {visibleSubmissions.length > 0 && (

                                                       <div className="mb-4 flex justify-end items-center gap-2 relative"> {/* Added relative positioning */}

                                                           <button

                                                               onClick={handlePlayAll}

                                                               className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition p-2 rounded-md bg-blue-900/20"

                                                           >

                                                               {isPlaying && visibleSubmissions.some(sub => sub.id === currentTrack?.id) ? (

                                                                   <Pause className="w-5 h-5" />

                                                               ) : (

                                                                   <Play className="w-5 h-5" />

                                                               )}

                                                               {isPlaying && visibleSubmissions.some(sub => sub.id === currentTrack?.id) ? 'Pause All' : 'Play All'}

                                                           </button>

                                                           <button

                                                               onClick={handleShufflePlay}

                                                               className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition p-2 rounded-md bg-blue-900/20"

                                                           >

                                                               <Shuffle className="w-5 h-5" /> Shuffle

                                                           </button>

                                                                           <button

                                                                             onClick={() => setShowFilterPopover(!showFilterPopover)}

                                                                             className={`p-2 rounded-md transition ${areFiltersActive ? 'bg-blue-900/30 text-blue-400' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}

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

                                                                   filterByFeedbackFocus={filterByFeedbackFocus}

                                                                   setFilterByFeedbackFocus={setFilterByFeedbackFocus}

                                                                   onClose={() => setShowFilterPopover(false)}

                                                               />

                                                           )}

                                                       </div>

              )}
              {visibleSubmissions.length === 0 && (searchTerm || sortBy !== 'newest' || filterByAI || filterByFragile || filterByFeedbackFocus.length > 0) && (
                  <div className="text-center py-4 bg-gray-900/30 rounded-lg border border-gray-800 border-dashed mb-4">
                      <p className="text-gray-500 mb-2">No tracks found matching your filters.</p>
                      <button 
                          onClick={handleClearAllFilters} 
                          className="text-blue-400 hover:text-blue-300 text-sm font-medium focus:outline-none"
                      >
                          Clear Filters
                      </button>
                  </div>
              )}





              <div className="space-y-4">

                {visibleSubmissions.map((sub) => {
                  const isCurrent = currentTrack?.id === sub.id;

                  const locked = isLocked(sub); // Assuming isLocked is defined

                  const isMySubmission = currentUserEmail === sub.uploaderEmail;



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

                      <div className="flex flex-col md:flex-row md:items-center gap-4 relative z-10">

                        {/* Watermark Track Number */}

                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-800 text-9xl font-black opacity-5 select-none z-0">

                          {submissions.findIndex(originalSub => originalSub.id === sub.id) + 1}.

                        </div>

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

                            <h4 className={`text-xl font-medium truncate ${locked ? 'blur-sm select-none' : ''}`}> {/* Adjusted title prominence */}

                              {locked ? 'Hidden Track' : sub.title}

                            </h4>

                            <div className="flex items-center gap-2">

                              <p

                                className={`text-sm text-gray-400 truncate ${sub.uploaderEmail ? 'cursor-pointer hover:text-white' : ''}`}

                                onClick={(e) => { // Modify onClick to stop propagation

                                  e.stopPropagation(); // Prevent event from bubbling up to parent div

                                  sub.uploaderEmail && handleBylineClick(sub.uploaderEmail)

                                }}

                              >

                                {sub.byline || 'Anonymous'}

                              </p>

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

                              onClick={(e) => { e.stopPropagation(); setExpandedSubmissionId(expandedSubmissionId === sub.id ? null : (sub.id || null)); }}

                              disabled={locked}

                              className={`p-2 rounded-full transition flex items-center gap-1 ${expandedSubmissionId === sub.id ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white'} ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}

                              title="Comments"

                            >

                              <MessageSquare className="w-4 h-4" />

                              {commentCounts[sub.id!] > 0 && (

                                <span className="text-xs font-bold">{commentCounts[sub.id!]}</span>

                              )}

                            </button>



                            <button

                              // onClick={(e) => { e.stopPropagation(); setAddToPlaylistSubmission(sub); }} // Add to playlist is for RequestDetail, not PlaylistView

                              disabled={true} // Disable for now

                              className={`p-2 rounded-full transition text-gray-400 hover:text-white ${true ? 'opacity-50 cursor-not-allowed' : ''}`}

                              title="Add to Playlist (Disabled in Playlist View)"

                            >

                              <ListPlus className="w-4 h-4" />

                            </button>

                          </div>



                          <button

                            onClick={(e) => {

                              e.stopPropagation();

                              if (locked) return;

                              handlePlay(sub, visibleSubmissions);

                            }}

                            disabled={locked}

                            className={`w-10 h-10 md:w-8 md:h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition ml-2 ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}

                          >

                            {locked ? (

                              <Lock className="w-3 h-3 text-gray-500" />

                            ) : isCurrent && isPlaying ? (

                              <Pause className="w-4 h-4" />

                            ) : (

                              <Play className="w-4 h-4 ml-0.5" />

                            )}

                          </button>

                        </div>

                      </div>



                      {(sub.waveform && sub.waveform.length > 0 && !locked) && (

                        <div className="mt-2 w-full opacity-70 block md:hidden">

                          <Waveform data={Array.isArray(sub.waveform) ? sub.waveform : []} />

                        </div>

                      )}



                      {(expandedLyricsMap[sub.id!] && !locked) && (

                        <div

                          className="mt-4 px-2 md:px-4 pb-2">

                          <h5 className="text-xs font-bold text-gray-500 uppercase mb-2">Lyrics / Notes</h5>

                          <div className="bg-gray-950 p-2 md:p-3 rounded border border-gray-800 text-sm text-gray-300 whitespace-pre-wrap break-words font-mono">

                            {sub.lyrics}

                          </div>

                        </div>

                      )}



                      {expandedSubmissionId === sub.id && id && sub.id && !locked && (

                        <div

                          className="mt-4 px-0 md:px-4 cursor-auto"

                          onClick={(e) => e.stopPropagation()}

                        >

                          <CommentSection

                            requestId={requestData!.id!}

                            submissionId={sub.id}

                            // highlightCommentId={linkedCommentId || undefined} // No deep linking for now

                            // accessMode={request.accessMode} // No access mode for now

                            // requestTitle={request.title} // Not directly needed

                            currentUserEmail={currentUserEmail!} // Pass current user email for comment form

                          />

                        </div>

                      )}

                    </div>

                  );

                })}

              </div>

            </div>)}
        </div>
      </div>
    </div>
  );
}
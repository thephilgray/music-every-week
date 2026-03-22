import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Loader2, CheckCheck, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from '../components/ui/Skeleton';
import { FeedItemRow, type FeedItemData } from '../components/FeedItemRow';
import { EventsCalendar } from '../components/EventsCalendar';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, startAfter, type QueryDocumentSnapshot, type DocumentData, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { Submission, Comment } from '../types';
import { getTimestampAsNumber } from '../lib/utils';

export function Community() {
  const { settings, user, profile, participantEmail } = useAuth();
  const [feed, setFeed] = useState<FeedItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'feed' | 'events') || 'feed';
  const setActiveTab = (tab: 'feed' | 'events') => setSearchParams({ tab });

  const markAllRead = async () => {
    if (!user?.uid) return;
    try {
        await updateDoc(doc(db, 'profiles', user.uid), {
            lastCommunityVisit: Date.now()
        });
    } catch (err) {
        console.error("Error marking all as read:", err);
    }
  };

  const subCursorRef = useRef<QueryDocumentSnapshot<DocumentData, DocumentData> | null>(null);
  const commCursorRef = useRef<QueryDocumentSnapshot<DocumentData, DocumentData> | null>(null);
  const eventCursorRef = useRef<QueryDocumentSnapshot<DocumentData, DocumentData> | null>(null);
  const [hasMoreSubs, setHasMoreSubs] = useState(true);
  const [hasMoreComms, setHasMoreComms] = useState(true);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const hasMoreSubsRef = useRef(true);
  const hasMoreCommsRef = useRef(true);
  const hasMoreEventsRef = useRef(true);

  // We keep these in state ONLY to trigger re-renders for the watermark
  const [lastSubT, setLastSubT] = useState(Number.MAX_SAFE_INTEGER);
  const [lastCommT, setLastCommT] = useState(Number.MAX_SAFE_INTEGER);
  const [lastEventT, setLastEventT] = useState(Number.MAX_SAFE_INTEGER);

  const reqMapRef = useRef<Record<string, string>>({});
  const validEventIdsRef = useRef<Set<string>>(new Set());
  const submissionsMapRef = useRef<Record<string, Submission>>({});
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const ITEMS_PER_PAGE = 30;

  const fetchFeedBatch = useCallback(async (isInitial = false) => {
    try {
        if (isInitial) {
            setLoading(true);
            subCursorRef.current = null;
            commCursorRef.current = null;
            eventCursorRef.current = null;
            hasMoreSubsRef.current = true;
            hasMoreCommsRef.current = true;
            hasMoreEventsRef.current = true;
            setHasMoreSubs(true);
            setHasMoreComms(true);
            setHasMoreEvents(true);
            setLastSubT(Number.MAX_SAFE_INTEGER);
            setLastCommT(Number.MAX_SAFE_INTEGER);
            setLastEventT(Number.MAX_SAFE_INTEGER);

            const email = user?.email || participantEmail;
            const uid = user?.uid;

            // 1. Fetch Requests to map Titles (Refactored for Rules)
            const reqPromises = [];
            if (uid) reqPromises.push(getDocs(query(collection(db, 'requests'), where('ownerPub', '==', uid))));
            if (email) reqPromises.push(getDocs(query(collection(db, 'requests'), where('accessList', 'array-contains', email))));
            reqPromises.push(getDocs(query(collection(db, 'requests'), where('accessMode', '==', 'volunteer'))));

            const reqSnaps = await Promise.all(reqPromises);
            reqSnaps.forEach(snap => {
                snap.docs.forEach(d => {
                    reqMapRef.current[d.id] = d.data().title;
                });
            });

            // 2. Fetch all event IDs to filter orphaned comments
            const eventSnap = await getDocs(query(collection(db, 'events')));
            validEventIdsRef.current = new Set(eventSnap.docs.map(d => d.id));
        } else {
            setIsLoadingMore(true);
        }

        const fetchSubs = async () => {
            if (!hasMoreSubsRef.current && !isInitial) return [];
            
            const constraints: any[] = [
                orderBy('createdAt', 'desc'),
                limit(ITEMS_PER_PAGE)
            ];
            
            if (!isInitial && subCursorRef.current) {
                constraints.push(startAfter(subCursorRef.current));
            }
            
            const subQuery = query(collection(db, 'submissions'), ...constraints);
            const subSnapshot = await getDocs(subQuery);
            
            if (!subSnapshot.empty) {
                const lastDoc = subSnapshot.docs[subSnapshot.docs.length - 1];
                subCursorRef.current = lastDoc as QueryDocumentSnapshot<DocumentData, DocumentData>;
                setLastSubT(getTimestampAsNumber(lastDoc.data().createdAt));
            } else {
                setLastSubT(0);
            }

            if (subSnapshot.size < ITEMS_PER_PAGE) {
                hasMoreSubsRef.current = false;
                setHasMoreSubs(false);
            }

            return subSnapshot.docs.map(d => {
                const data = d.data() as Submission;
                const reqTitle = reqMapRef.current[data.requestId];
                if (!reqTitle) return null; 
                
                submissionsMapRef.current[d.id] = data;
                
                return {
                    id: d.id,
                    type: 'submission',
                    text: `Submitted a new track: ${data.title}`,
                    authorUid: data.uploaderUid, 
                    authorEmail: data.uploaderEmail,
                    authorName: data.byline,
                    submissionId: d.id,
                    requestId: data.requestId,
                    submissionTitle: data.title,
                    requestTitle: reqTitle,
                    createdAt: getTimestampAsNumber(data.createdAt), 
                    usesAI: data.usesAI
                } as FeedItemData;
            }).filter(item => item !== null) as FeedItemData[];
        };

        const fetchComms = async () => {
            if (!hasMoreCommsRef.current && !isInitial) return [];

            const constraints: any[] = [
                orderBy('createdAt', 'desc'),
                limit(ITEMS_PER_PAGE)
            ];

            if (!isInitial && commCursorRef.current) {
                constraints.push(startAfter(commCursorRef.current));
            }
            
            const commQuery = query(collection(db, 'comments'), ...constraints);
            const commSnapshot = await getDocs(commQuery);

            if (!commSnapshot.empty) {
                const lastDoc = commSnapshot.docs[commSnapshot.docs.length - 1];
                commCursorRef.current = lastDoc as QueryDocumentSnapshot<DocumentData, DocumentData>;
                setLastCommT(getTimestampAsNumber(lastDoc.data().createdAt));
            } else {
                setLastCommT(0);
            }

            if (commSnapshot.size < ITEMS_PER_PAGE) {
                hasMoreCommsRef.current = false;
                setHasMoreComms(false);
            }

            // Resolve missing submissions for comments
            const commentsWithData = await Promise.all(commSnapshot.docs.map(async (docSnap) => {
                const data = docSnap.data() as Comment;
                
                // Event Comment
                if (data.eventId) {
                    if (!validEventIdsRef.current.has(data.eventId)) return null; 
                    return {
                        id: docSnap.id,
                        type: 'comment',
                        text: data.text,
                        authorUid: data.authorUid,
                        authorEmail: data.authorEmail,
                        authorName: data.userProfile?.displayName || (data.authorEmail ? data.authorEmail.split('@')[0] : 'Unknown'),
                        eventId: data.eventId,
                        eventTitle: data.eventTitle,
                        createdAt: getTimestampAsNumber(data.createdAt),
                    } as FeedItemData;
                }

                // Submission Comment
                if (!data.submissionId || !data.requestId) return null; 
                
                const reqTitle = reqMapRef.current[data.requestId];
                if (!reqTitle) return null; 

                let submission = submissionsMapRef.current[data.submissionId];
                if (!submission) {
                    try {
                        const subDoc = await getDoc(doc(db, 'submissions', data.submissionId));
                        if (subDoc.exists()) {
                            submission = subDoc.data() as Submission;
                            submissionsMapRef.current[data.submissionId] = submission;
                        }
                    } catch (err) {
                        console.warn(`Failed to fetch submission ${data.submissionId} for comment ${docSnap.id}`, err);
                    }
                }

                if (!submission) return null; 

                return {
                    id: docSnap.id,
                    type: 'comment',
                    text: data.text,
                    authorUid: data.authorUid,
                    authorEmail: data.authorEmail,
                    authorName: data.userProfile?.displayName || (data.authorEmail ? data.authorEmail.split('@')[0] : 'Unknown'),
                    submissionId: data.submissionId,
                    requestId: data.requestId,
                    submissionTitle: submission.title,
                    requestTitle: reqTitle,
                    createdAt: getTimestampAsNumber(data.createdAt),
                    usesAI: submission.usesAI
                } as FeedItemData;
            }));

            return commentsWithData.filter((c): c is FeedItemData => c !== null);
        };

        const fetchEvents = async () => {
            if (!hasMoreEventsRef.current && !isInitial) return [];
            
            const constraints: any[] = [
                orderBy('createdAt', 'desc'),
                limit(ITEMS_PER_PAGE)
            ];
            
            if (!isInitial && eventCursorRef.current) {
                constraints.push(startAfter(eventCursorRef.current));
            }
            
            const eventQuery = query(collection(db, 'events'), ...constraints);
            const eventSnapshot = await getDocs(eventQuery);
            
            if (!eventSnapshot.empty) {
                const lastDoc = eventSnapshot.docs[eventSnapshot.docs.length - 1];
                eventCursorRef.current = lastDoc as QueryDocumentSnapshot<DocumentData, DocumentData>;
                setLastEventT(getTimestampAsNumber(lastDoc.data().createdAt));
            } else {
                setLastEventT(0);
            }

            if (eventSnapshot.size < ITEMS_PER_PAGE) {
                hasMoreEventsRef.current = false;
                setHasMoreEvents(false);
            }

            return eventSnapshot.docs.map(d => {
                const data = d.data() as any;
                return {
                    id: d.id,
                    type: 'event',
                    text: data.title,
                    authorUid: data.submittedBy,
                    authorEmail: data.submittedByEmail,
                    authorName: data.submittedByEmail?.split('@')[0] || 'Unknown',
                    createdAt: getTimestampAsNumber(data.createdAt),
                    eventDate: new Date(data.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    eventLocation: data.location,
                    eventType: data.type
                } as FeedItemData;
            });
        };

        const [submissionFeedItems, validComments, eventItems] = await Promise.all([fetchSubs(), fetchComms(), fetchEvents()]);

        // 4. Merge and Sort
        const combinedNew = [...submissionFeedItems, ...validComments, ...eventItems];

        setFeed(prev => {
            const merged = isInitial ? combinedNew : [...prev, ...combinedNew];
            // Remove duplicates
            const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
            return unique.sort((a, b) => b.createdAt - a.createdAt);
        });

    } catch (err) {
        console.error("Error loading community feed:", err);
    } finally {
        setLoading(false);
        setIsLoadingMore(false);
    }
  }, [user?.email, user?.uid, participantEmail]);

  useEffect(() => {
    fetchFeedBatch(true);
  }, [user?.uid, fetchFeedBatch]);

  // Calculate watermark for smooth merging of streams
  let watermark = 0;
  const actives = [];
  if (hasMoreSubs) actives.push(lastSubT);
  if (hasMoreComms) actives.push(lastCommT);
  if (hasMoreEvents) actives.push(lastEventT);
  
  if (actives.length > 0) {
      watermark = Math.max(...actives);
  }

  const filteredFeed = feed.filter(item => {
      if (settings?.content?.filterAI && item.usesAI) return false;
      // Watermark filter: only show items newer than the "worst" cursor
      // to ensure correct relative ordering between streams.
      if (item.createdAt < watermark) return false;
      return true;
  });

  // Observer for marking items as read as they scroll past
  useEffect(() => {
    if (!user?.uid || filteredFeed.length === 0) return;

    const readItems = profile?.readCommunityItems || {};
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('data-id');
                const item = filteredFeed.find(f => f.id === id);
                
                if (id && !readItems[id]) {
                    const updates: Record<string, any> = {
                        [`readCommunityItems.${id}`]: true
                    };

                    // If we scroll past an item older than 2 days, mark everything as read 
                    // by updating the lastCommunityVisit timestamp to now.
                    const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
                    if (item && item.createdAt < twoDaysAgo) {
                        updates.lastCommunityVisit = serverTimestamp();
                    }

                    updateDoc(doc(db, 'profiles', user.uid), updates)
                        .catch(err => console.warn("Error updating read status:", err));
                }
            }
        });
    }, { 
        threshold: 0.5, // 50% visibility
        rootMargin: '0px' 
    });

    // Observe all feed items currently in the DOM
    const elements = document.querySelectorAll('[data-feed-item]');
    elements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [filteredFeed, user?.uid, profile?.readCommunityItems]);

  // Scroll to top when tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  const hasMore = hasMoreSubs || hasMoreComms || hasMoreEvents;

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
        const target = entries[0];
        if (target.isIntersecting && hasMore && !loading && !isLoadingMore) {
            fetchFeedBatch(false);
        }
    }, { root: null, rootMargin: '200px', threshold: 0 });

    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, isLoadingMore, fetchFeedBatch]);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-4 text-center sm:text-left">
            <div className="flex flex-col items-center sm:items-start">
                <h1 className="text-3xl font-bold text-white mb-2">Community Feed</h1>
                <p className="text-gray-400">See what's happening across all requests.</p>
            </div>
            {user?.uid && (
                <button 
                    onClick={markAllRead}
                    className="flex items-center justify-center gap-2 px-3 py-2 sm:py-1.5 text-sm font-medium text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700 rounded-lg transition-colors bg-gray-900/50 w-full sm:w-auto"
                >
                    <CheckCheck className="w-4 h-4" />
                    <span>Mark all read</span>
                </button>
            )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-gray-800 mb-8 overflow-x-auto scrollbar-hide">
            <button 
                onClick={() => setActiveTab('feed')}
                className={`flex items-center gap-2 pb-4 text-sm font-bold transition-all relative min-w-max ${activeTab === 'feed' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
                <MessageSquare className={`w-4 h-4 ${activeTab === 'feed' ? 'text-blue-500' : 'text-gray-600'}`} />
                Activity Feed
                {activeTab === 'feed' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>}
            </button>
            <button 
                onClick={() => setActiveTab('events')}
                className={`flex items-center gap-2 pb-4 text-sm font-bold transition-all relative min-w-max ${activeTab === 'events' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
                <Calendar className={`w-4 h-4 ${activeTab === 'events' ? 'text-blue-500' : 'text-gray-600'}`} />
                Events Calendar
                {activeTab === 'events' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>}
            </button>
        </div>

        {activeTab === 'feed' ? (
            loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredFeed.map(item => (
                        <div key={item.id} data-id={item.id} data-feed-item>
                            <FeedItemRow item={item} />
                        </div>
                    ))}
                    
                    {filteredFeed.length === 0 && !hasMore && (
                        <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-800">
                            <MessageSquare className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                            <p className="text-gray-500">No submission activity yet.</p>
                        </div>
                    )}

                    {hasMore && (
                        <div ref={loadMoreRef} className="py-6 flex justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                        </div>
                    )}
                    
                    {!hasMore && feed.length > 0 && filteredFeed.length > 0 && (
                        <div className="py-8 text-center text-sm text-gray-500">
                            You've reached the end of the feed.
                        </div>
                    )}
                </div>
            )
        ) : (
            <EventsCalendar />
        )}
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Loader2, CheckCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from '../components/ui/Skeleton';
import { FeedItemRow, type FeedItemData } from '../components/FeedItemRow';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, startAfter, type QueryDocumentSnapshot, type DocumentData, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { Submission, Comment } from '../types';
import { getTimestampAsNumber } from '../lib/utils';

export function Community() {
  const { settings, user, profile, participantEmail } = useAuth();
  const [feed, setFeed] = useState<FeedItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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

  const [subCursor, setSubCursor] = useState<QueryDocumentSnapshot<DocumentData, DocumentData> | null>(null);
  const [commCursor, setCommCursor] = useState<QueryDocumentSnapshot<DocumentData, DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const reqMapRef = useRef<Record<string, string>>({});
  const submissionsMapRef = useRef<Record<string, Submission>>({});
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const ITEMS_PER_PAGE = 20;

  const fetchFeedBatch = async (isInitial = false) => {
    try {
        if (isInitial) {
            setLoading(true);
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
        } else {
            setIsLoadingMore(true);
        }

        // 2. Fetch Recent Submissions
        let subQueryArgs: any[] = [collection(db, 'submissions'), orderBy('createdAt', 'desc'), limit(ITEMS_PER_PAGE)];
        if (!isInitial && subCursor) subQueryArgs.splice(2, 0, startAfter(subCursor));
        
        const subQuery = query.apply(null, subQueryArgs as any);
        const subSnapshot = await getDocs(subQuery);
        
        if (!subSnapshot.empty) {
            setSubCursor(subSnapshot.docs[subSnapshot.docs.length - 1] as QueryDocumentSnapshot<DocumentData, DocumentData>);
        }

        const submissionFeedItems = subSnapshot.docs.map(d => {
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

        // 3. Fetch Recent Comments
        let commQueryArgs: any[] = [collection(db, 'comments'), orderBy('createdAt', 'desc'), limit(ITEMS_PER_PAGE)];
        if (!isInitial && commCursor) commQueryArgs.splice(2, 0, startAfter(commCursor));
        
        const commQuery = query.apply(null, commQueryArgs as any);
        const commSnapshot = await getDocs(commQuery);

        if (!commSnapshot.empty) {
            setCommCursor(commSnapshot.docs[commSnapshot.docs.length - 1] as QueryDocumentSnapshot<DocumentData, DocumentData>);
        }

        // Resolve missing submissions for comments
        const commentsWithData = await Promise.all(commSnapshot.docs.map(async (docSnap) => {
            const data = docSnap.data() as Comment;
            if (!data.submissionId || !data.requestId) return null; 
            
            const reqTitle = reqMapRef.current[data.requestId];
            if (!reqTitle) return null; // Filter out if request not found (rules blocked it)

            let submission = submissionsMapRef.current[data.submissionId];
            
            // If submission not in our recent list, fetch it
            if (!submission) {
                try {
                    const subDoc = await getDoc(doc(db, 'submissions', data.submissionId));
                    if (subDoc.exists()) {
                        submission = subDoc.data() as Submission;
                        submissionsMapRef.current[data.submissionId] = submission; // Cache
                    }
                } catch (e) {
                    console.warn(`Failed to fetch submission ${data.submissionId} for comment ${docSnap.id}`);
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

        const validComments = commentsWithData.filter((c): c is FeedItemData => c !== null);

        if (subSnapshot.empty && commSnapshot.empty) {
            setHasMore(false);
        }

        // 4. Merge and Sort
        const combinedNew = [...submissionFeedItems, ...validComments];

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
  };

  useEffect(() => {
    fetchFeedBatch(true);
  }, [user?.uid]);

  const filteredFeed = feed.filter(item => {
      if (settings?.content?.filterAI && item.usesAI) return false;
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
  }, [hasMore, loading, isLoadingMore]);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="flex justify-between items-end mb-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Community Feed</h1>
                <p className="text-gray-400">See what's happening across all requests.</p>
            </div>
            {user?.uid && (
                <button 
                    onClick={markAllRead}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700 rounded-lg transition-colors bg-gray-900/50"
                >
                    <CheckCheck className="w-4 h-4" />
                    Mark all read
                </button>
            )}
        </div>

        {loading ? (
             <div className="space-y-4">
                 {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
             </div>
        ) : filteredFeed.length === 0 ? (
             <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-800">
                 <MessageSquare className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                 <p className="text-gray-500">No submission activity yet.</p>
             </div>
        ) : (
            <div className="space-y-4">
                {filteredFeed.map(item => (
                    <div key={item.id} data-id={item.id} data-feed-item>
                        <FeedItemRow item={item} />
                    </div>
                ))}
                
                {hasMore && (
                    <div ref={loadMoreRef} className="py-6 flex justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                    </div>
                )}
                
                {!hasMore && feed.length > 0 && (
                    <div className="py-8 text-center text-sm text-gray-500">
                        You've reached the end of the feed.
                    </div>
                )}
            </div>
        )}
    </div>
  );
}
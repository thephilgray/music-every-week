import { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from '../components/ui/Skeleton';
import { FeedItemRow, type FeedItemData } from '../components/FeedItemRow';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, where } from 'firebase/firestore';
import type { Submission, FileRequest, Comment } from '../types';
import { getTimestampAsNumber } from '../lib/utils';

export function Community() {
  const { settings } = useAuth();
  const [feed, setFeed] = useState<FeedItemData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFeed() {
        try {
            // 1. Fetch Requests to map Titles (Optimization: Could be cached or denormalized)
            const reqQuery = query(collection(db, 'requests')); // Fetch all for now (assuming low volume)
            const reqSnapshot = await getDocs(reqQuery);
            const reqMap: Record<string, string> = {};
            reqSnapshot.docs.forEach(doc => {
                const data = doc.data() as FileRequest;
                reqMap[doc.id] = data.title;
            });

            const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

            // 2. Fetch Recent Submissions
            const subQuery = query(
                collection(db, 'submissions'),
                where('createdAt', '>=', cutoff),
                orderBy('createdAt', 'desc'),
                limit(50)
            );
            const subSnapshot = await getDocs(subQuery);
            const submissionsMap: Record<string, Submission> = {}; // Cache for comment lookup
            
            const submissionFeedItems: FeedItemData[] = subSnapshot.docs.map(doc => {
                const data = doc.data() as Submission;
                submissionsMap[doc.id] = data; // Cache it
                const reqTitle = reqMap[data.requestId] || 'Unknown Request';
                
                return {
                    id: doc.id,
                    type: 'submission',
                    text: `Submitted a new track: ${data.title}`,
                    authorUid: data.uploaderUid, // Changed from authorPub
                    authorEmail: data.uploaderEmail,
                    authorName: data.byline,
                    submissionId: doc.id,
                    requestId: data.requestId,
                    submissionTitle: data.title,
                    requestTitle: reqTitle,
                    createdAt: getTimestampAsNumber(data.createdAt), // Used helper
                    usesAI: data.usesAI
                };
            });

            // 3. Fetch Recent Comments
            const commQuery = query(
                collection(db, 'comments'),
                where('createdAt', '>=', cutoff),
                orderBy('createdAt', 'desc'),
                limit(50)
            );
            const commSnapshot = await getDocs(commQuery);

            // Resolve missing submissions for comments
            const commentsWithData = await Promise.all(commSnapshot.docs.map(async (docSnap) => {
                const data = docSnap.data() as Comment;
                if (!data.submissionId || !data.requestId) return null; // Skip invalid comments
                
                let submission = submissionsMap[data.submissionId];
                
                // If submission not in our recent list, fetch it
                if (!submission) {
                    try {
                        const subDoc = await getDoc(doc(db, 'submissions', data.submissionId));
                        if (subDoc.exists()) {
                            submission = subDoc.data() as Submission;
                            submissionsMap[data.submissionId] = submission; // Cache
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch submission ${data.submissionId} for comment ${docSnap.id}`);
                    }
                }

                if (!submission) return null; // Can't display comment without submission context

                const reqTitle = reqMap[data.requestId] || 'Unknown Request';
                
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

            // 4. Merge and Sort
            const combinedFeed = [...submissionFeedItems, ...validComments].sort((a, b) => b.createdAt - a.createdAt);

            setFeed(combinedFeed);
        } catch (err) {
            console.error("Error loading community feed:", err);
        } finally {
            setLoading(false);
        }
    }

    loadFeed();
  }, []);

  const filteredFeed = feed.filter(item => {
      if (settings?.content?.filterAI && item.usesAI) return false;
      return true;
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Community Feed</h1>
            <p className="text-gray-400">See what's happening across all requests.</p>
            {/* AI Filter Toggle could go here */}
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
                    <FeedItemRow key={item.id} item={item} />
                ))}
            </div>
        )}
    </div>
  );
}

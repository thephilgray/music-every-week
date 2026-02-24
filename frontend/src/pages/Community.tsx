import { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import { FeedItemRow, type FeedItemData } from '../components/FeedItemRow';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import type { Submission, FileRequest } from '../types';

export function Community() {
  const [feed, setFeed] = useState<FeedItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAI] = useState(false);

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

            // 2. Fetch Recent Submissions
            const subQuery = query(
                collection(db, 'submissions'),
                orderBy('createdAt', 'desc'),
                limit(50)
            );
            const subSnapshot = await getDocs(subQuery);
            
            const feedItems: FeedItemData[] = subSnapshot.docs.map(doc => {
                const data = doc.data() as Submission;
                const reqTitle = reqMap[data.requestId] || 'Unknown Request';
                
                return {
                    id: doc.id,
                    type: 'submission',
                    text: `Submitted a new track: ${data.title}`,
                    authorPub: data.uploaderPub,
                    authorEmail: data.uploaderEmail,
                    authorName: data.byline,
                    submissionId: doc.id,
                    requestId: data.requestId,
                    submissionTitle: data.title,
                    requestTitle: reqTitle,
                    createdAt: data.createdAt, // Assuming number
                    usesAI: data.usesAI
                };
            });

            setFeed(feedItems);
        } catch (err) {
            console.error("Error loading community feed:", err);
        } finally {
            setLoading(false);
        }
    }

    loadFeed();
  }, []);

  const filteredFeed = feed.filter(item => {
      if (filterAI && item.usesAI) return false;
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

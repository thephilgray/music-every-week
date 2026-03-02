import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, Music } from 'lucide-react';
import { fixUrl } from '../lib/url';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type { UserProfile } from '../types';
import { formatCommentDate } from '../lib/utils';

export interface FeedItemData {
    id: string;
    type: 'comment' | 'submission';
    text: string;
    authorUid?: string; // Changed from authorPub
    authorEmail?: string; // Add email support
    authorName?: string; // Add direct name support (byline)
    submissionId: string;
    requestId: string;
    submissionTitle: string;
    requestTitle: string;
    createdAt: number;
    usesAI?: boolean;
}

interface FeedItemRowProps {
    item: FeedItemData;
}

export function FeedItemRow({ item }: FeedItemRowProps) {
    const [authorAlias, setAuthorAlias] = useState<string>(item.authorName || 'Unknown User');
    const [authorAvatar, setAuthorAvatar] = useState<string | null>(null);
    const [resolvedAuthorUid, setResolvedAuthorUid] = useState<string | undefined>(item.authorUid);

    useEffect(() => {
        let isMounted = true;
        
        // Initial setup
        if (item.authorName) {
            setAuthorAlias(item.authorName);
        } else if (item.authorEmail) {
            setAuthorAlias(item.authorEmail.split('@')[0]);
        }
        
        // If we have a UID, update state (can be overridden by fetchProfile if we find a better one via email)
        if (item.authorUid) {
            setResolvedAuthorUid(item.authorUid);
        }

        const fetchProfile = async () => {
            try {
                let profileData: UserProfile | null = null;
                let uid = item.authorUid;

                // 1. Try by UID
                if (uid) {
                    const profileDoc = await getDoc(doc(db, 'profiles', uid));
                    if (profileDoc.exists()) {
                        profileData = profileDoc.data() as UserProfile;
                    }
                } 
                
                // 2. Try by Email if no UID or profile not found by UID
                if (!profileData && item.authorEmail) {
                     const q = query(collection(db, 'profiles'), where('email', '==', item.authorEmail));
                     const querySnapshot = await getDocs(q);
                     if (!querySnapshot.empty) {
                         const profileDoc = querySnapshot.docs[0];
                         profileData = profileDoc.data() as UserProfile;
                         uid = profileDoc.id; // Found a UID!
                         if (isMounted) setResolvedAuthorUid(uid);
                     }
                }

                if (isMounted && profileData) {
                    if (profileData.avatarUrl) setAuthorAvatar(profileData.avatarUrl);
                    
                    // Prioritize profile's displayName or alias over the item's historical name
                    if (profileData.displayName || profileData.alias) {
                        setAuthorAlias(profileData.displayName || profileData.alias || item.authorName || 'Unknown User');
                    } else if (!item.authorName && item.authorEmail) {
                        setAuthorAlias(item.authorEmail.split('@')[0]);
                    }
                }
            } catch (error) {
                console.error("Error fetching profile for feed item:", error);
            }
        };

        fetchProfile();

        return () => { isMounted = false; };
    }, [item.authorUid, item.authorName, item.authorEmail]);

    // Use resolvedAuthorUid for the link
    const profileLink = resolvedAuthorUid ? `/profile/${resolvedAuthorUid}` : '#';

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 flex gap-2 md:gap-4 hover:border-gray-700 transition">
            {/* Avatar */}
            <div className="flex-shrink-0">
                <Link to={profileLink}>
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gray-800 overflow-hidden">
                        {authorAvatar ? (
                            <img src={fixUrl(authorAvatar)} alt={authorAlias} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500"><User className="w-4 h-4 md:w-5 md:h-5" /></div>
                        )}
                    </div>
                </Link>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1 gap-1 md:gap-0">
                    <div className="text-sm">
                        <Link to={profileLink} className={`font-bold text-white hover:underline ${!resolvedAuthorUid ? 'pointer-events-none' : ''}`}>
                            {authorAlias}
                        </Link>
                        <span className="text-gray-500 ml-1">
                            {item.type === 'submission' ? 'uploaded a track' : 'commented on'}
                        </span>
                    </div>
                    <span className="text-xs text-gray-600 whitespace-nowrap self-end md:self-auto">
                        {item.createdAt > 0 ? formatCommentDate(item.createdAt) : 'Date unknown'}
                    </span>
                </div>

                <div className="bg-gray-950 rounded-lg p-3 mb-2 border border-gray-800/50 flex items-center gap-3">
                    {item.type === 'submission' && (
                        <div className="w-8 h-8 bg-blue-900/20 rounded flex items-center justify-center text-blue-500 flex-shrink-0">
                            <Music className="w-4 h-4" />
                        </div>
                    )}
                    <p className="text-gray-300 text-sm line-clamp-3 italic">{item.text.replace('Submitted a new track: ', '')}</p>
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-xs text-gray-500 mt-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <Music className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{item.submissionTitle}</span>
                        <span className="flex-shrink-0">in</span>
                        <Link to={`/request/${item.requestId}`} className="text-blue-400 hover:underline truncate max-w-[150px]">
                            {item.requestTitle}
                        </Link>
                    </div>
                    
                    <div className="md:flex-1" />
                    
                    <Link 
                        to={`/request/${item.requestId}?submission=${item.submissionId}${item.type === 'comment' ? `&comment=${item.id}` : ''}`}
                        className="flex items-center gap-1 text-gray-400 hover:text-white transition self-end md:self-auto"
                    >
                        {item.type === 'submission' ? 'View Track' : 'View Thread'}
                    </Link>
                </div>
            </div>
        </div>
    );
}

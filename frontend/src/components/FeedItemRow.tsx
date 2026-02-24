import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, Music } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { fixUrl } from '../lib/url';

export interface FeedItemData {
    id: string;
    type: 'comment' | 'submission';
    text: string;
    authorPub?: string; // Optional now
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
    const { gun } = useGun();
    const [authorAlias, setAuthorAlias] = useState<string>(item.authorName || 'Unknown User');
    const [authorAvatar, setAuthorAvatar] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        
        // If we have a direct name (byline), use it as primary, but still try to fetch avatar if pub exists
        if (item.authorName) {
            setAuthorAlias(item.authorName);
        }

        if (item.authorPub && gun) {
            gun.get('all_users').get(item.authorPub).once((u: any) => {
                if (isMounted && u) {
                    // Only override alias if we don't have a direct name (or maybe we prefer the profile alias?)
                    // Let's prefer the profile alias if available, as byline might be ad-hoc?
                    // Or prefer byline if it's a submission?
                    // Current logic: Profile alias > "Unknown".
                    if (u.alias) setAuthorAlias(u.alias);
                    setAuthorAvatar(u.avatarUrl);
                }
            });
        } else if (item.authorEmail) {
            // Fallback to email if no pub and no name
            if (!item.authorName) {
                setAuthorAlias(item.authorEmail.split('@')[0]);
            }
        }

        return () => { isMounted = false; };
    }, [gun, item.authorPub, item.authorName, item.authorEmail]);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 flex gap-2 md:gap-4 hover:border-gray-700 transition">
            {/* Avatar */}
            <div className="flex-shrink-0">
                <Link to={item.authorPub ? `/profile/${item.authorPub}` : '#'}>
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
                        <Link to={item.authorPub ? `/profile/${item.authorPub}` : '#'} className="font-bold text-white hover:underline">
                            {authorAlias}
                        </Link>
                        <span className="text-gray-500 ml-1">
                            {item.type === 'submission' ? 'uploaded a track' : 'commented on'}
                        </span>
                    </div>
                    <span className="text-xs text-gray-600 whitespace-nowrap self-end md:self-auto">{new Date(item.createdAt).toLocaleDateString()}</span>
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

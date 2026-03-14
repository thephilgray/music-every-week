import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, serverTimestamp, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Send, Hash, MessageSquare } from 'lucide-react';
import type { WatchPartyMessage } from '../types';

interface WatchPartyChatProps {
    partyId: string;
    currentTrackId?: string;
    requestId?: string;
    className?: string;
}

export function WatchPartyChat({ partyId, currentTrackId, requestId, className = "" }: WatchPartyChatProps) {
    const { user, profile } = useAuth();
    const [messages, setMessages] = useState<WatchPartyMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [attachToTrack, setAttachToTrack] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!partyId) return;

        const q = query(
            collection(db, 'watchParties', partyId, 'messages'),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedMessages: WatchPartyMessage[] = [];
            snapshot.forEach((doc) => {
                fetchedMessages.push({ id: doc.id, ...doc.data() } as WatchPartyMessage);
            });
            setMessages(fetchedMessages);
        });

        return () => unsubscribe();
    }, [partyId]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user || !profile || isSubmitting) return;

        setIsSubmitting(true);
        const text = newMessage.trim();
        setNewMessage(''); // optimistic clear

        try {
            const batch = writeBatch(db);
            const partyMessageRef = doc(collection(db, 'watchParties', partyId, 'messages'));
            const timestamp = serverTimestamp();

            const messageData: WatchPartyMessage = {
                uid: user.uid,
                displayName: profile.displayName || profile.alias || 'Anonymous',
                text,
                createdAt: timestamp,
                isAttachedToTrack: attachToTrack && !!currentTrackId,
                trackId: currentTrackId
            };

            batch.set(partyMessageRef, messageData);

            if (attachToTrack && currentTrackId && requestId) {
                const trackCommentRef = doc(collection(db, 'comments'));
                batch.set(trackCommentRef, {
                    text,
                    authorUid: user.uid,
                    authorEmail: user.email,
                    createdAt: timestamp,
                    userProfile: {
                        displayName: profile.displayName || profile.alias,
                        avatarUrl: profile.avatarUrl || null
                    },
                    submissionId: currentTrackId,
                    requestId: requestId
                });
            }

            await batch.commit();

            // Reset the checkbox to prevent accidental spam
            setAttachToTrack(false);
            
        } catch (error) {
            console.error('Error sending message:', error);
            // Revert clear
            setNewMessage(text);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={`flex flex-col h-full bg-gray-900 border-l border-gray-800 ${className}`}>
            {/* Header */}
            <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-gray-400" />
                <h3 className="font-semibold text-gray-200">Live Chat</h3>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-10">
                        No messages yet. Say hello!
                    </div>
                ) : (
                    messages
                        .filter(msg => !(msg.isSystem && msg.uid === user?.uid))
                        .map((msg) => (
                        <div key={msg.id} className="group">
                            {msg.isSystem ? (
                                <div className="text-center my-2 text-xs text-gray-500 italic">
                                    {msg.displayName} {msg.text}
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-medium text-blue-400 text-sm">{msg.displayName}</span>
                                        <span className="text-xs text-gray-500">
                                            {msg.createdAt && typeof msg.createdAt === 'object' && 'toMillis' in msg.createdAt ? 
                                                new Date((msg.createdAt as any).toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
                                                ''}
                                        </span>
                                    </div>
                                    <div className="text-gray-300 text-sm mt-0.5 break-words flex items-center gap-2">
                                        <span>{msg.text}</span>
                                        {msg.isAttachedToTrack && (
                                            <span title="Attached to track comments">
                                                <Hash className="w-3 h-3 text-yellow-500/50" />
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            {user ? (
                 <div className="p-4 border-t border-gray-800 bg-gray-900/50">
                    <form onSubmit={handleSendMessage} className="space-y-3">
                        <div className="relative">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Send a message..."
                                disabled={isSubmitting}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-4 pr-12 py-3 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={!newMessage.trim() || isSubmitting}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-50"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                        
                        {currentTrackId && (
                             <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer w-fit group">
                                <input
                                    type="checkbox"
                                    checked={attachToTrack}
                                    onChange={(e) => setAttachToTrack(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                                />
                                <span className="group-hover:text-gray-300 transition-colors flex items-center gap-1">
                                    <Hash className="w-3 h-3" />
                                    Keep comment on track
                                </span>
                            </label>
                        )}
                    </form>
                </div>
            ) : (
                <div className="p-4 border-t border-gray-800 text-center">
                    <p className="text-sm text-gray-400">Sign in to join the chat</p>
                </div>
            )}
        </div>
    );
}

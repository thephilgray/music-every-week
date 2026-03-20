import { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, serverTimestamp, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Send, Hash, MessageSquare } from 'lucide-react';
import type { WatchPartyMessage } from '../types';

interface WatchPartyChatProps {
    partyId: string;
    currentTrackId?: string;
    requestId?: string;
    currentTrackTitle?: string;
    currentTrackArtist?: string;
    currentTrackTime?: number;
    className?: string;
}

export function WatchPartyChat({ partyId, currentTrackId, requestId, currentTrackTitle, currentTrackArtist, currentTrackTime, className = "" }: WatchPartyChatProps) {
    const { user, profile } = useAuth();
    const [messages, setMessages] = useState<WatchPartyMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [attachToTrack, setAttachToTrack] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!partyId) {
            console.log("[WatchPartyChat] No partyId provided, returning.");
            return;
        }

        console.log("[WatchPartyChat] Starting listener for partyId:", partyId);

        const q = query(
            collection(db, 'watchParties', partyId, 'messages')
            // Temporarily removing orderBy to diagnose if a missing index is causing the local issue
            // orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log(`[WatchPartyChat] received snapshot. size: ${snapshot.size}, fromCache: ${snapshot.metadata.fromCache}, hasPendingWrites: ${snapshot.metadata.hasPendingWrites}`);
            
            const fetchedMessages: WatchPartyMessage[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data({ serverTimestamps: 'estimate' });
                fetchedMessages.push({ id: doc.id, ...data } as WatchPartyMessage);
            });
            
            // Client-side sort to bypass missing index requirement
            fetchedMessages.sort((a, b) => {
                const aTime = (a.createdAt as any)?.toMillis?.() || Date.now();
                const bTime = (b.createdAt as any)?.toMillis?.() || Date.now();
                return aTime - bTime;
            });

            setMessages(fetchedMessages);
        }, (err) => {
            console.error("[WatchPartyChat] Error in onSnapshot:", err);
            if (err.code === 'permission-denied') {
                console.error("[WatchPartyChat] Permission denied. Check your Firestore rules.");
            }
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
            console.log("[WatchPartyChat] Attempting to send message to party:", partyId);
            const batch = writeBatch(db);
            const partyMessageRef = doc(collection(db, 'watchParties', partyId, 'messages'));
            const timestamp = serverTimestamp();

            const messageData: WatchPartyMessage = {
                uid: user.uid,
                displayName: profile.displayName || profile.alias || 'Anonymous',
                text,
                createdAt: timestamp,
                isAttachedToTrack: attachToTrack && !!currentTrackId,
                trackId: currentTrackId,
                trackTitle: currentTrackTitle,
                trackArtist: currentTrackArtist,
                trackTime: currentTrackTime
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

            console.log("[WatchPartyChat] Message batch committed successfully.");
            
        } catch (error) {
            console.error('[WatchPartyChat] Error sending message:', error);
            alert("Failed to send message: " + (error instanceof Error ? error.message : String(error)));
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
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-baseline gap-2">
                                            <span className="font-medium text-blue-400 text-sm leading-none">{msg.displayName}</span>
                                            <span className="text-[10px] text-gray-500 tabular-nums leading-none">
                                                {msg.createdAt ? (
                                                    (msg.createdAt as any).toMillis ? 
                                                        new Date((msg.createdAt as any).toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
                                                        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                ) : (
                                                    <span className="text-blue-500/50 animate-pulse">Sending...</span>
                                                )}
                                            </span>
                                        </div>
                                        
                                        {(msg.trackTitle || msg.trackTime !== undefined) && (
                                            <div className="flex items-center gap-1.5 text-[9px] text-gray-600 mt-0.5">
                                                {msg.trackTime !== undefined && (
                                                    <span className="px-1 py-0.25 bg-gray-800/50 rounded text-gray-400 font-mono">
                                                        {Math.floor(msg.trackTime / 60)}:{(Math.floor(msg.trackTime % 60)).toString().padStart(2, '0')}
                                                    </span>
                                                )}
                                                {msg.trackTitle && (
                                                    <span className="truncate italic flex items-center gap-1" title={`${msg.trackTitle}${msg.trackArtist ? ` by ${msg.trackArtist}` : ''}`}>
                                                        <span className="truncate">{msg.trackTitle}</span>
                                                        {msg.trackArtist && (
                                                            <span className="opacity-60 truncate">by {msg.trackArtist}</span>
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        <div className="text-gray-300 text-sm mt-1 break-words flex items-center gap-2">
                                            <span>{msg.text}</span>
                                            {msg.isAttachedToTrack && (
                                                <span title="Attached to permanent track comments">
                                                    <Hash className="w-3 h-3 text-yellow-500/20" />
                                                </span>
                                            )}
                                        </div>
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

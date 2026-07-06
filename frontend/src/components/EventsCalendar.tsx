import { useState, useEffect, useCallback } from 'react';
import { Calendar, MapPin, Plus, Info, Image as ImageIcon, Loader2, Upload, Edit, Trash2, CalendarCheck, MessageSquare, Send, User, Clock } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, arrayUnion, arrayRemove, where, limit } from 'firebase/firestore';
import type { MewEvent, Comment } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fixUrl } from '../lib/url';
import { uploadToR2 } from '../lib/r2';
import { BRAND_INFO } from '../config/appConfig';

export function EventsCalendar() {
    const { user, isAdmin } = useAuth();
    const { success, error: toastError } = useToast();
    const [events, setEvents] = useState<MewEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState<MewEvent | null>(null);
    const [selectedFlyer, setSelectedFlyer] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newDate, setNewDate] = useState('');
    const [newLoc, setNewLoc] = useState('');
    const [newType, setNewType] = useState<MewEvent['type']>('community');
    const [newFlyer, setNewFlyer] = useState('');
    const [newFlyerFile, setNewFlyerFile] = useState<File | null>(null);
    const [newTime, setNewTime] = useState('');

    const fetchEvents = useCallback(async (quiet = false) => {
        if (!quiet) setLoading(true);
        try {
            const q = query(collection(db, 'events'), orderBy('date', 'asc'));
            const snapshot = await getDocs(q);
            const fetched = snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data()
            } as MewEvent));
            setEvents(fetched);
        } catch (err) {
            console.error("Error fetching events:", err);
        } finally {
            if (!quiet) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setIsSubmitting(true);
        try {
            let flyerUrl = newFlyer;
            if (newFlyerFile) {
                const uploadRes = await uploadToR2(newFlyerFile);
                flyerUrl = uploadRes.url;
            }

            let fullDateTime: string | null = null;
            if (newTime) {
                // ISO strings are UTC. We create a local date from the inputs, then convert to ISO.
                fullDateTime = new Date(`${newDate}T${newTime}`).toISOString();
            }

            await addDoc(collection(db, 'events'), {
                title: newTitle,
                description: newDesc,
                date: newDate,
                location: newLoc,
                type: newType,
                flyerUrl: flyerUrl,
                time: newTime || null,
                fullDateTime,
                isOfficial: false,
                submittedBy: user.uid,
                submittedByEmail: user.email,
                createdAt: serverTimestamp()
            });
            success("Event submitted successfully!");
            setShowSubmitModal(false);
            // Reset form
            setNewTitle('');
            setNewDesc('');
            setNewDate('');
            setNewLoc('');
            setNewType('community');
            setNewFlyer('');
            setNewFlyerFile(null);
            
            // Immediate Refresh
            fetchEvents(true);
        } catch (err) {
            console.error("Error submitting event:", err);
            toastError("Failed to submit event.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !editingEvent?.id) return;
        setIsSubmitting(true);
        try {
            let flyerUrl = editingEvent.flyerUrl;
            if (newFlyerFile) {
                const uploadRes = await uploadToR2(newFlyerFile);
                flyerUrl = uploadRes.url;
            } else if (newFlyer) {
                flyerUrl = newFlyer;
            }

            let fullDateTime: string | null = null;
            if (newTime) {
                fullDateTime = new Date(`${newDate}T${newTime}`).toISOString();
            }

            const { id, ...eventData } = editingEvent;
            await updateDoc(doc(db, 'events', editingEvent.id), {
                ...eventData,
                title: newTitle,
                description: newDesc,
                date: newDate,
                location: newLoc,
                type: newType,
                flyerUrl: flyerUrl,
                time: newTime || null,
                fullDateTime,
                updatedAt: serverTimestamp()
            });
            
            success("Event updated successfully!");
            setEditingEvent(null);
            fetchEvents(true);
        } catch (err) {
            console.error("Error updating event:", err);
            toastError("Failed to update event.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const startEditing = (event: MewEvent) => {
        setEditingEvent(event);
        setNewTitle(event.title);
        setNewDesc(event.description);
        setNewDate(event.date);
        setNewLoc(event.location || '');
        setNewType(event.type);
        setNewFlyer(event.flyerUrl || '');
        setNewFlyerFile(null);
        setNewTime(event.time || '');
    };

    const handleDelete = async (eventId: string) => {
        if (!window.confirm("Are you sure you want to delete this event?")) return;
        try {
            // Delete event
            await deleteDoc(doc(db, 'events', eventId));
            
            // Cleanup comments (best effort - might fail for non-owned comments due to rules)
            const q = query(collection(db, 'comments'), where('eventId', '==', eventId));
            const snap = await getDocs(q);
            const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
            await Promise.allSettled(deletePromises);
            
            success("Event deleted.");
            fetchEvents(true);
        } catch (err) {
            console.error("Error deleting event:", err);
            toastError("Failed to delete event.");
        }
    };
    
    const toggleInterest = async (event: MewEvent) => {
        if (!user || !event.id) return;
        const isInterested = event.interestedUsers?.includes(user.uid);
        try {
            await updateDoc(doc(db, 'events', event.id), {
                interestedUsers: isInterested ? arrayRemove(user.uid) : arrayUnion(user.uid)
            });
            fetchEvents(true);
        } catch (err) {
            console.error("Error toggling interest:", err);
            toastError("Failed to update interest.");
        }
    };

    const getTypeColor = (type: MewEvent['type']) => {
        switch (type) {
            case 'session_start': return 'bg-green-500/20 text-green-400 border-green-500/30';
            case 'deadline': return 'bg-red-500/20 text-red-400 border-red-500/30';
            case 'stream': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
            case 'workshop': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'show': return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
            case 'social': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
            case 'release': return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    };

    const getEventTimestamp = (e: MewEvent) => e.fullDateTime ? new Date(e.fullDateTime).getTime() : new Date(`${e.date}T12:00:00`).getTime();
    const upcomingEvents = events.filter(e => getEventTimestamp(e) > Date.now() - (24 * 60 * 60 * 1000));
    const pastEvents = events.filter(e => getEventTimestamp(e) <= Date.now() - (24 * 60 * 60 * 1000)).reverse();

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h2 className="text-2xl font-bold text-white">Upcoming Events</h2>
                <button 
                    onClick={() => setShowSubmitModal(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition shadow-lg shadow-blue-900/20 w-full sm:w-auto"
                >
                    <Plus className="w-4 h-4" />
                    Post Event
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
                </div>
            ) : upcomingEvents.length === 0 ? (
                <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-800 border-dashed">
                    <Calendar className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                    <p className="text-gray-500">No upcoming events scheduled.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {upcomingEvents.map(event => (
                        <EventRow 
                            key={event.id} 
                            event={event} 
                            getTypeColor={getTypeColor} 
                            onEdit={() => startEditing(event)}
                            onDelete={() => handleDelete(event.id!)}
                            onFlyerClick={setSelectedFlyer}
                            onToggleInterest={() => toggleInterest(event)}
                            canEdit={isAdmin || user?.uid === event.submittedBy}
                        />
                    ))}
                </div>
            )}

            {pastEvents.length > 0 && (
                <div className="pt-8 border-t border-gray-800">
                    <h3 className="text-xl font-bold text-gray-400 mb-6">Past Events</h3>
                    <div className="space-y-4 opacity-70 grayscale-[0.5]">
                        {pastEvents.slice(0, 10).map(event => (
                            <EventRow 
                                key={event.id} 
                                event={event} 
                                getTypeColor={getTypeColor} 
                                isPast 
                                onEdit={() => startEditing(event)}
                                onDelete={() => handleDelete(event.id!)}
                                onFlyerClick={setSelectedFlyer}
                                onToggleInterest={() => toggleInterest(event)}
                                canEdit={isAdmin || user?.uid === event.submittedBy}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Disclaimer */}
            <div className="p-4 bg-gray-900/30 border border-gray-800 rounded-lg flex gap-3 text-sm text-gray-500 italic">
                <Info className="w-5 h-5 flex-shrink-0 text-gray-600 not-italic" />
                <p>Postings by community members are user-submitted and unaffiliated with {BRAND_INFO.shortName} corporate. Please verify event details independently.</p>
            </div>

            {/* Submit Modal */}
            {showSubmitModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowSubmitModal(false)}>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-extrabold text-white">Post an Event</h2>
                            <button onClick={() => setShowSubmitModal(false)} className="text-gray-500 hover:text-white transition">
                                <Plus className="w-6 h-6 rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Event Title</label>
                                <input 
                                    required
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                    placeholder={`e.g. ${BRAND_INFO.shortName} Community Show @ The Satellite`}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Date</label>
                                    <input 
                                        required
                                        type="date"
                                        value={newDate}
                                        onChange={e => setNewDate(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Type</label>
                                    <select 
                                        value={newType}
                                        onChange={e => setNewType(e.target.value as any)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
                                    >
                                        <option value="community">Community</option>
                                        <option value="show">Show</option>
                                        <option value="social">Social</option>
                                        <option value="release">Release</option>
                                        <option value="stream">Stream</option>
                                        <option value="workshop">Workshop</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Time (Optional)</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="time"
                                        value={newTime}
                                        onChange={e => setNewTime(e.target.value)}
                                        className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
                                    />
                                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-tight max-w-[120px]">
                                        Automatically converted for other timezones
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Location / Link</label>
                                <input 
                                    value={newLoc}
                                    onChange={e => setNewLoc(e.target.value)}
                                    placeholder="e.g. Los Angeles, CA or Zoom Link"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Description</label>
                                <textarea 
                                    required
                                    rows={3}
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                    placeholder="Tell the community about it..."
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors resize-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Flyer Image (Optional)</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="relative group/upload h-12 bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center cursor-pointer hover:border-blue-500 transition">
                                        <input 
                                            type="file"
                                            accept="image/*"
                                            onChange={e => setNewFlyerFile(e.target.files?.[0] || null)}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                        <div className="flex items-center gap-2 text-sm text-gray-400 group-hover/upload:text-blue-400 transition">
                                            <Upload className="w-4 h-4" />
                                            <span>{newFlyerFile ? newFlyerFile.name : 'Upload File'}</span>
                                        </div>
                                    </div>
                                    <input 
                                        value={newFlyer}
                                        onChange={e => setNewFlyer(e.target.value)}
                                        placeholder="...or paste URL"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                {newFlyerFile && (
                                    <p className="text-[10px] text-blue-500 font-bold ml-1 uppercase tracking-widest">File will be uploaded on post</p>
                                )}
                            </div>

                            <button 
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition duration-300 shadow-xl shadow-blue-900/20 disabled:opacity-50"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Post Event'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingEvent && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setEditingEvent(null)}>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-extrabold text-white">Edit Event</h2>
                            <button onClick={() => setEditingEvent(null)} className="text-gray-500 hover:text-white transition">
                                <Plus className="w-6 h-6 rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleUpdate} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Event Title</label>
                                <input 
                                    required
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                    placeholder={`e.g. ${BRAND_INFO.shortName} Community Show @ The Satellite`}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Date</label>
                                    <input 
                                        required
                                        type="date"
                                        value={newDate}
                                        onChange={e => setNewDate(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Type</label>
                                    <select 
                                        value={newType}
                                        onChange={e => setNewType(e.target.value as any)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
                                    >
                                        <option value="community">Community</option>
                                        <option value="show">Show</option>
                                        <option value="social">Social</option>
                                        <option value="release">Release</option>
                                        <option value="stream">Stream</option>
                                        <option value="workshop">Workshop</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Time (Optional)</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="time"
                                        value={newTime}
                                        onChange={e => setNewTime(e.target.value)}
                                        className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
                                    />
                                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-tight max-w-[120px]">
                                        Automatically converted for other timezones
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Location / Link</label>
                                <input 
                                    value={newLoc}
                                    onChange={e => setNewLoc(e.target.value)}
                                    placeholder="e.g. Los Angeles, CA or Zoom Link"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Description</label>
                                <textarea 
                                    required
                                    rows={3}
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                    placeholder="Tell the community about it..."
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors resize-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400 uppercase tracking-wider ml-1">Flyer Image (Optional)</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="relative group/upload h-12 bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center cursor-pointer hover:border-blue-500 transition">
                                        <input 
                                            type="file"
                                            accept="image/*"
                                            onChange={e => setNewFlyerFile(e.target.files?.[0] || null)}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                        <div className="flex items-center gap-2 text-sm text-gray-400 group-hover/upload:text-blue-400 transition">
                                            <Upload className="w-4 h-4" />
                                            <span>{newFlyerFile ? newFlyerFile.name : (editingEvent?.flyerUrl ? 'Change Flyer' : 'Upload File')}</span>
                                        </div>
                                    </div>
                                    <input 
                                        value={newFlyer}
                                        onChange={e => setNewFlyer(e.target.value)}
                                        placeholder="...or paste URL"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                {newFlyerFile && (
                                    <p className="text-[10px] text-blue-500 font-bold ml-1 uppercase tracking-widest">File will be uploaded on save</p>
                                )}
                            </div>

                            <button 
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition duration-300 shadow-xl shadow-blue-900/20 disabled:opacity-50"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save Changes'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Flyer Full-size Modal */}
            {selectedFlyer && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-0 sm:p-4 bg-black/95 backdrop-blur-md" onClick={() => setSelectedFlyer(null)}>
                    <div className="relative w-full sm:max-w-[90vw] h-full sm:h-auto sm:max-h-[90vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={() => setSelectedFlyer(null)}
                            className="absolute top-4 sm:-top-12 right-4 sm:right-0 text-white hover:text-blue-400 transition p-2 bg-black/50 sm:bg-transparent rounded-full z-10"
                        >
                            <Plus className="w-8 h-8 rotate-45" />
                        </button>
                        <img 
                            src={fixUrl(selectedFlyer)} 
                            alt="Full-size Flyer" 
                            className="w-full h-auto max-h-screen sm:max-h-[90vh] object-contain sm:rounded-lg shadow-2xl border-y sm:border border-white/10"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function LinkifiedText({ text }: { text: string }) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return (
        <>
            {parts.map((part, i) => 
                urlRegex.test(part) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-block break-all" onClick={e => e.stopPropagation()}>
                        {part}
                    </a>
                ) : part
            )}
        </>
    );
}

function formatEventTime(time: string, timezone?: string | null, fullDateTime?: string | null) {
    if (fullDateTime) {
        try {
            return new Intl.DateTimeFormat('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZoneName: 'short'
            }).format(new Date(fullDateTime));
        } catch (err) {
            console.error("Error formatting fullDateTime:", err);
        }
    }
    
    if (!time) return '';
    try {
        const [h, m] = time.split(':');
        const date = new Date();
        date.setHours(parseInt(h), parseInt(m), 0, 0);
        
        return new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: timezone || undefined,
            timeZoneName: 'short'
        }).format(date);
    } catch (err) {
        return time;
    }
}

function EventComments({ eventId, eventTitle }: { eventId: string, eventTitle: string }) {
    const { user } = useAuth();
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchComments = useCallback(async () => {
        try {
            const q = query(
                collection(db, 'comments'), 
                where('eventId', '==', eventId),
                orderBy('createdAt', 'asc'),
                limit(50)
            );
            const snap = await getDocs(q);
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
        } catch (err) {
            console.error("Error fetching comments:", err);
        } finally {
            setLoading(false);
        }
    }, [eventId]);

    useEffect(() => {
        fetchComments();
    }, [fetchComments]);

    const handlePostComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newComment.trim()) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'comments'), {
                text: newComment,
                authorUid: user.uid,
                authorEmail: user.email,
                eventId,
                eventTitle,
                createdAt: serverTimestamp(),
                userProfile: {
                    displayName: user.displayName || user.email?.split('@')[0] || 'Unknown',
                    avatarUrl: ''
                }
            });
            setNewComment('');
            fetchComments();
        } catch (err) {
            console.error("Error posting comment:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mt-4 pt-4 border-t border-gray-800 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                    <div className="flex justify-center p-4">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                    </div>
                ) : comments.length === 0 ? (
                    <p className="text-center text-xs text-gray-600 py-4 italic">No comments yet. Start the discussion!</p>
                ) : (
                    comments.map(c => (
                        <div key={c.id} className="flex gap-2">
                            <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
                                <User className="w-3 h-3 text-gray-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[10px] font-bold text-gray-400 capitalize">{c.userProfile?.displayName}</span>
                                    <span className="text-[9px] text-gray-600">
                                        {c.createdAt instanceof Object && 'seconds' in c.createdAt ? new Date((c.createdAt as any).seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-300 break-words leading-relaxed">
                                    <LinkifiedText text={c.text} />
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <form onSubmit={handlePostComment} className="flex gap-2">
                <input 
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Ask a question or discuss..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500 transition-colors"
                />
                <button 
                    disabled={isSubmitting || !newComment.trim()}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
                >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
            </form>
        </div>
    );
}

function EventRow({ event, getTypeColor, isPast, onEdit, onDelete, onFlyerClick, onToggleInterest, canEdit }: { 
    event: MewEvent, 
    getTypeColor: (type: MewEvent['type']) => string, 
    isPast?: boolean,
    onEdit: () => void,
    onDelete: () => void,
    onFlyerClick: (url: string) => void,
    onToggleInterest: () => void,
    canEdit: boolean
}) {
    const { user } = useAuth();
    const [isHovering, setIsHovering] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const date = event.fullDateTime ? new Date(event.fullDateTime) : new Date(`${event.date}T12:00:00`);

    const isInterested = user && event.interestedUsers?.includes(user.uid);
    const interestCount = event.interestedUsers?.length || 0;

    return (
        <>
        <div 
            className={`group relative flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-gray-800 bg-gray-900/40 hover:bg-gray-800/60 hover:border-gray-700 transition-all duration-300 ${isPast ? 'opacity-60' : ''}`}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            {/* Date Badge */}
            <div className="flex-shrink-0 flex items-center sm:flex-col justify-center sm:justify-center w-full sm:w-20 h-auto sm:h-20 bg-gray-800/50 sm:bg-gray-800 rounded-lg border border-gray-700 group-hover:border-blue-500/50 transition py-2 sm:py-0 gap-3 sm:gap-0">
                <div className="flex flex-col items-center sm:block">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                </div>
                <div className="flex flex-row sm:flex-col items-center gap-2 sm:gap-0">
                    <span className="text-xl sm:text-2xl font-black text-white leading-none my-0 sm:my-1">{date.getDate()}</span>
                    <span className="text-[10px] font-bold text-blue-500 uppercase">{date.toLocaleDateString('en-US', { month: 'short' })}</span>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded border inline-block ${getTypeColor(event.type)}`}>
                        {event.type.replace('_', ' ')}
                    </span>
                    {event.isOfficial && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-600 text-white rounded shadow-lg shadow-blue-900/20">{BRAND_INFO.shortName} Official</span>
                    )}
                </div>
                <h4 className="text-lg font-bold text-white mb-1 group-hover:text-blue-400 transition leading-snug">{event.title}</h4>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
                    {event.time && (
                        <div className="flex items-center gap-1.5 text-blue-400/90 font-bold bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            <Clock className="w-3" />
                            <span className="text-[10px] uppercase tracking-wider">{formatEventTime(event.time || '', event.timezone, event.fullDateTime)}</span>
                        </div>
                    )}
                    {event.location && (
                        <div className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                            <span className="text-gray-400 break-words">
                                <LinkifiedText text={event.location} />
                            </span>
                        </div>
                    )}
                    <div className="w-full sm:w-auto">
                        <p className={`italic whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-1'}`}>
                            <LinkifiedText text={event.description} />
                        </p>
                        {event.description.length > 60 && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsExpanded(!isExpanded);
                                }}
                                className="text-[10px] text-blue-500 font-bold uppercase mt-1 hover:text-blue-400 transition"
                            >
                                {isExpanded ? 'Show less' : 'Read more'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Flyer Hover (Desktop only) */}
            {event.flyerUrl && isHovering && (
                <div className="absolute left-1/2 -top-48 transform -translate-x-1/2 z-[50] pointer-events-none p-1 bg-gray-800 border-2 border-blue-500 rounded-lg shadow-2xl animate-in zoom-in-75 fade-in duration-200 hidden sm:block">
                    <img src={fixUrl(event.flyerUrl)} alt="Flyer" className="max-w-[240px] max-h-[180px] object-contain rounded" />
                </div>
            )}

            {/* Action Row */}
            <div className="flex flex-row items-center gap-1 sm:ml-auto mt-2 sm:mt-0 justify-end">
                {/* Interest Toggle */}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleInterest();
                    }}
                    className={`flex items-center gap-2 px-4 h-10 rounded-full border transition-all duration-300 ${isInterested ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-900/10' : 'bg-gray-800/40 border-gray-800 hover:border-gray-700 text-gray-500'}`}
                    title={isInterested ? "Remove interest" : "Show interest"}
                >
                    <CalendarCheck className={`w-4 h-4 ${isInterested ? 'text-emerald-400' : ''}`} />
                    <span className="text-xs font-bold whitespace-nowrap flex items-center gap-1">
                        <span className="hidden sm:inline">Interested</span>
                        {interestCount > 0 && <span>({interestCount})</span>}
                    </span>
                </button>

                {/* Comments Toggle */}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowComments(!showComments);
                    }}
                    className={`flex items-center justify-center w-10 h-10 rounded-full border border-gray-800 hover:border-blue-500 hover:bg-blue-900/20 text-gray-500 hover:text-blue-400 transition ${showComments ? 'bg-blue-900/20 border-blue-500 text-blue-400' : ''}`}
                    title="Discussion"
                >
                    <MessageSquare className="w-5 h-5" />
                </button>

                {/* Flyer Button */}
                {event.flyerUrl && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onFlyerClick(event.flyerUrl!);
                        }}
                        className="flex flex-shrink-0 items-center justify-center w-10 h-10 rounded-full border border-gray-800 hover:border-blue-500 hover:bg-blue-900/20 text-gray-600 hover:text-blue-400 transition" 
                        title="View Full-size Flyer"
                    >
                        <ImageIcon className="w-5 h-5" />
                    </button>
                )}

                {/* Edit/Delete Buttons */}
                {canEdit && (
                    <div className="flex flex-row items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit();
                            }}
                            className="p-2.5 sm:p-2 text-gray-500 hover:text-white bg-gray-800/50 rounded-lg border border-gray-700 hover:border-blue-500 transition-all"
                            title="Edit Event"
                        >
                            <Edit className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            className="p-2.5 sm:p-2 text-gray-500 hover:text-red-500 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-red-900/50 transition-all"
                            title="Delete Event"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            {showComments && event.id && (
                <div className="w-full sm:hidden">
                    <EventComments eventId={event.id} eventTitle={event.title} />
                </div>
            )}
        </div>
        {showComments && event.id && (
            <div className="hidden sm:block px-5 pb-5 -mt-2 bg-gray-900/40 rounded-b-xl border-x border-b border-gray-800 border-t-0">
                <EventComments eventId={event.id} eventTitle={event.title} />
            </div>
        )}
        </>
    );
}

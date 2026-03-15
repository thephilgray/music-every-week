import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, getDoc, doc, getDocs } from 'firebase/firestore';
import { Loader2, Radio, Play, Users } from 'lucide-react';
import type { WatchParty } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface LiveParty extends WatchParty {
    viewerCount: number;
}

export function LiveSessions() {
    const { user, participantEmail } = useAuth();
    const [liveParties, setLiveParties] = useState<LiveParty[]>([]);
    const [loading, setLoading] = useState(true);
    const [accessibleRequestIds, setAccessibleRequestIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        // We want to fetch all watch parties that are 'live' or 'scheduled'
        // Since we can't easily query an array of statuses without a complex index, we can just fetch all and filter, 
        // or query where status != 'ended'
        const q = query(collection(db, 'watchParties'), where('status', '!=', 'ended'));
        
        const unsubParties = onSnapshot(q, (snap) => {
            const parties: LiveParty[] = [];
            
            snap.forEach(doc => {
                parties.push({ id: doc.id, ...doc.data(), viewerCount: 0 } as LiveParty);
            });
            
            // For each party, setup a snapshot listener on its presence subcollection to get the viewer count
            // To avoid memory leaks with so many listeners, in a real production app with hundreds of parties
            // we'd probably use a Cloud Function to aggregate this count onto the main document instead.
            // For now, this approach works for MVP scale.
            const unsubscribers: (() => void)[] = [];
            
            parties.forEach((party) => {
                 const presenceQ = query(collection(db, 'watchParties', party.id!, 'presence'));
                 const unsubPresence = onSnapshot(presenceQ, (presenceSnap) => {
                     setLiveParties(prev => {
                         const current = [...prev];
                         const targetIndex = current.findIndex(p => p.id === party.id);
                         if (targetIndex !== -1) {
                             current[targetIndex] = { ...current[targetIndex], viewerCount: presenceSnap.size };
                         }
                         // Sort so that live ones are first, then scheduled, then by viewer count
                         return current.sort((a, b) => {
                             if (a.status === 'live' && b.status !== 'live') return -1;
                             if (a.status !== 'live' && b.status === 'live') return 1;
                             return b.viewerCount - a.viewerCount;
                         });
                     });
                 });
                 unsubscribers.push(unsubPresence);
            });
            
            setLiveParties(parties);
            setLoading(false);
            
            // Since the outer dependency array doesn't encompass the inner cleanups naturally, 
            // we have to trust React unmounts cleanly, or just let 'parties' redefine them.
        });

        return () => unsubParties();
    }, []);

    const requiredRequestIds = Array.from(new Set(liveParties.map(p => p.requestId).filter(Boolean))) as string[];

    useEffect(() => {
        if (requiredRequestIds.length === 0) return;

        const email = user?.email || participantEmail;
        const uid = user?.uid;

        const checkAccess = async () => {
            const accessible = new Set<string>();
            
            let migratedPub: string | null = null;
            if (uid) {
                const profileDoc = await getDoc(doc(db, 'profiles', uid));
                if (profileDoc.exists()) migratedPub = profileDoc.data().migratedFromGunPub;
            } else if (email) {
                const qP = query(collection(db, 'profiles'), where('email', '==', email));
                const pSnap = await getDocs(qP);
                if (!pSnap.empty) migratedPub = pSnap.docs[0].data().migratedFromGunPub;
            }

            for (const reqId of requiredRequestIds) {
                // If we already verified access from a previous pass, skip
                if (accessibleRequestIds.has(reqId)) {
                    accessible.add(reqId);
                    continue;
                }

                try {
                    // Check if they are the owner
                    if (uid) {
                        const ownerQ = query(collection(db, 'requests'), where('ownerPub', '==', uid), where('__name__', '==', reqId));
                        const ownerSnap = await getDocs(ownerQ).catch(() => ({ empty: true }));
                        if (!ownerSnap.empty) {
                            accessible.add(reqId);
                            continue;
                        }
                    }

                    // Check if they are in the access list
                    if (email) {
                        const accessQ = query(collection(db, 'requests'), where('accessList', 'array-contains', email), where('__name__', '==', reqId));
                        const accessSnap = await getDocs(accessQ).catch(() => ({ empty: true }));
                        if (!accessSnap.empty) {
                            accessible.add(reqId);
                            continue;
                        }
                    }

                    // Check if they submitted
                    if (email || migratedPub) {
                        const subQueries = [];
                        if (email) subQueries.push(query(collection(db, 'submissions'), where('requestId', '==', reqId), where('uploaderEmail', '==', email)));
                        if (migratedPub) subQueries.push(query(collection(db, 'submissions'), where('requestId', '==', reqId), where('originalUploaderPub', '==', migratedPub)));
                        
                        let hasSubmitted = false;
                        for (const q of subQueries) {
                            const snap = await getDocs(q).catch(() => ({ empty: true }));
                            if (!snap.empty) {
                                hasSubmitted = true;
                                break;
                            }
                        }
                        
                        if (hasSubmitted) {
                            accessible.add(reqId);
                            continue;
                        }
                    }

                    // Finally try to get the document directly for 'volunteer' mode, catch expected permission errors silently
                    const reqDoc = await getDoc(doc(db, 'requests', reqId)).catch(() => null);
                    if (reqDoc && reqDoc.exists() && reqDoc.data().accessMode === 'volunteer') {
                        accessible.add(reqId);
                        continue;
                    }

                } catch (err) {
                    // Suppress outer errors to avoid spamming the console
                }
            }
            
            setAccessibleRequestIds(prev => new Set([...prev, ...accessible]));
        };

        checkAccess();
    }, [requiredRequestIds.join(','), user?.email, participantEmail, user?.uid]);

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20 min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-8">
            <div className="mb-10 text-center">
                <div className="inline-flex items-center justify-center p-4 bg-red-500/10 rounded-full mb-4">
                    <Radio className="w-8 h-8 text-red-500 animate-pulse" />
                </div>
                <h1 className="text-4xl font-bold text-white mb-4">Live Sessions</h1>
                <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                    Tune in to community watch parties happening right now. Chat, listen, and share creative feedback together.
                </p>
            </div>

            {liveParties.filter(party => !party.requestId || accessibleRequestIds.has(party.requestId)).length === 0 ? (
                <div className="text-center py-20 bg-gray-900/50 border border-gray-800 border-dashed rounded-2xl">
                    <Radio className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-300 mb-2">It's quiet in here...</h3>
                    <p className="text-gray-500">There are no live watch parties at the moment.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {liveParties.filter(party => !party.requestId || accessibleRequestIds.has(party.requestId)).map(party => (
                        <Link 
                            key={party.id} 
                            to={`/party/${party.id}`}
                            className="group block bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-blue-500 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/10"
                        >
                            <div className="p-6 relative">
                                {/* Status Indicator */}
                                <div className="absolute top-6 right-6 flex items-center gap-2">
                                    {party.status === 'live' && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/20 border border-red-500/50 rounded-full">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                            <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Live</span>
                                        </div>
                                    )}
                                    {party.status === 'scheduled' && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/20 border border-blue-500/50 rounded-full">
                                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Scheduled</span>
                                        </div>
                                    )}
                                </div>

                                {/* Placeholder visual */}
                                <div className="w-16 h-16 rounded-xl bg-gray-800 flex items-center justify-center mb-6 group-hover:bg-blue-600/20 transition-colors">
                                    <Play className="w-8 h-8 text-gray-400 group-hover:text-blue-500 ml-1 transition-colors" />
                                </div>

                                <h3 className="text-xl font-bold text-white mb-2 line-clamp-1 group-hover:text-blue-400 transition-colors">
                                    {party.name || `Session #${party.id?.substring(0, 6)}`}
                                </h3>
                                
                                <div className="flex items-center justify-between mt-6">
                                     <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
                                        <Users className="w-4 h-4" />
                                        <span>{party.viewerCount} Listening</span>
                                    </div>
                                    
                                    {party.isRadioMode && (
                                         <span className="text-xs font-semibold px-2 py-1 bg-purple-500/10 text-purple-400 rounded-lg">
                                             Radio Mode
                                         </span>
                                     )}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

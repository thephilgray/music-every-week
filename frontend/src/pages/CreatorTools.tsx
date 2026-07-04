import { useState, useEffect } from 'react';
import { Download, Users, ChevronRight, Mail, SkipForward, ArrowLeft, ExternalLink, Edit, Music, List, Link as LinkIcon, Loader2, Trash2, Archive } from 'lucide-react';
import { Link } from 'react-router-dom';
import JSZip from 'jszip';
import { useAuth } from '../contexts/AuthContext'; 
import { useToast } from '../contexts/ToastContext';
import { EditPrompt } from '../components/EditPrompt';
import { SubmitTrack } from '../components/SubmitTrack'; 
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { Prompt, Submission, UserProfile, Session } from '../types';
import { getTimestampAsNumber, copyToClipboard } from '../lib/utils';
import { db } from '../lib/firebase'; 
import { collection, query, where, getDocs, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, getDoc, deleteDoc, orderBy, arrayUnion, arrayRemove } from 'firebase/firestore'; 

interface ParticipantRow {
    id: string;
    name: string;
    contact: string;
    status: string;
    type: 'user' | 'email';
    extensionHours?: number;
    hasPass?: boolean;
}

export function CreatorTools() {
  const { user, participantEmail, isAdmin } = useAuth(); 
  const { success, error } = useToast();

  
  // Tabs
  const [activeTab, setActiveTab] = useState<'sessions' | 'requests' | 'submissions'>('sessions');

  // Sessions Data
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [isEditSessionOpen, setIsEditSessionOpen] = useState(false);
  const [sessionFormName, setSessionFormName] = useState('');
  const [sessionFormDesc, setSessionFormDesc] = useState('');
  const [sessionFormStartDate, setSessionFormStartDate] = useState('');
  const [sessionFormCadence, setSessionFormCadence] = useState('Bi-weekly');
  const [addPromptToSessionId, setAddPromptToSessionId] = useState('');

  // Requests Data
  const [requestsByUid, setRequestsByUid] = useState<Prompt[]>([]);
  const [requestsByEmail, setRequestsByEmail] = useState<Prompt[]>([]);
  const [requestsAll, setRequestsAll] = useState<Prompt[]>([]); // New state for admins
  const [myRequests, setMyRequests] = useState<Prompt[]>([]);

  const [selectedRequest, setSelectedRequest] = useState<Prompt | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [isEditRequestOpen, setIsEditRequestOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Submissions Data
  const [submissionsByUid, setSubmissionsByUid] = useState<Submission[]>([]);
  const [submissionsByEmail, setSubmissionsByEmail] = useState<Submission[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [selectedRequestSubmissions, setSelectedRequestSubmissions] = useState<Submission[]>([]);

  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isEditSubmissionOpen, setIsEditSubmissionOpen] = useState(false);
  const [submissionCommentCount, setSubmissionCommentCount] = useState<number | null>(null);

  const [showDeleteRequestConfirm, setShowDeleteRequestConfirm] = useState(false);
  const [showDeleteSubmissionConfirm, setShowDeleteSubmissionConfirm] = useState(false);

  const [isActionLoading, setActionLoading] = useState(false);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const [zipStatusText, setZipStatusText] = useState<string>('');

  // Fetch comments count for selected submission
  useEffect(() => {
      if (!selectedSubmission?.id) {
          setSubmissionCommentCount(null);
          return;
      }
      const fetchComments = async () => {
          try {
              const q = query(collection(db, 'comments'), where('submissionId', '==', selectedSubmission.id));
              const snap = await getDocs(q);
              setSubmissionCommentCount(snap.size);
          } catch (e) {
              console.error("Error fetching comment count:", e);
              setSubmissionCommentCount(0);
          }
      };
      fetchComments();
  }, [selectedSubmission?.id]);

  // Combine Requests
  useEffect(() => {
      const combined = new Map<string, Prompt>();
      requestsByUid.forEach(r => combined.set(r.id!, r));
      requestsByEmail.forEach(r => combined.set(r.id!, r));
      requestsAll.forEach(r => combined.set(r.id!, r)); // Admins see everything
      
      const sorted = Array.from(combined.values()).sort((a, b) => 
          getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt)
      );
      setMyRequests(sorted);
  }, [requestsByUid, requestsByEmail, requestsAll]);

  // Combine Submissions
  useEffect(() => {
      const combined = new Map<string, Submission>();
      submissionsByUid.forEach(s => combined.set(s.id!, s));
      submissionsByEmail.forEach(s => combined.set(s.id!, s));

      const sorted = Array.from(combined.values()).sort((a, b) => 
          getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt)
      );
      setMySubmissions(sorted);
  }, [submissionsByUid, submissionsByEmail]);

  // Fetch Requests (Dual Query)
  useEffect(() => {
    if (!user?.uid && !participantEmail) return;
    
    console.log("CreatorTools: Fetching requests for UID:", user?.uid, "and Email:", user?.email || participantEmail);

    const unsubs: (() => void)[] = [];

    // 1. Query by UID (ownerPub)
    if (user?.uid) {
        const qUid = query(
            collection(db, 'requests'),
            where('ownerPub', '==', user.uid)
        );
        unsubs.push(onSnapshot(qUid, (snapshot) => {
            const res: Prompt[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.deleted) return;
                if (data.title) res.push({ id: doc.id, ...data, createdAt: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : data.createdAt } as Prompt);
            });
            console.log("CreatorTools: Requests by UID (snapshot.empty:", snapshot.empty, "):", res);
            setRequestsByUid(res);
        }));
    }

    // 2. Query by Email (ownerEmail)
    const email = user?.email || participantEmail;
    if (email) {
        const normalizedEmail = email.toLowerCase();
        const qEmail = query(
            collection(db, 'requests'),
            where('ownerEmail', 'in', Array.from(new Set([email, normalizedEmail])))
        );
        unsubs.push(onSnapshot(qEmail, (snapshot) => {
            const res: Prompt[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.deleted) return;
                if (data.title) res.push({ id: doc.id, ...data, createdAt: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : data.createdAt } as Prompt);
            });
            console.log("CreatorTools: Requests by Email (snapshot.empty:", snapshot.empty, "):", res);
            setRequestsByEmail(res);
        }));
    }

    // 3. Query for ALL requests (Admin only)
    if (isAdmin) {
        const qAll = query(
            collection(db, 'requests'),
            orderBy('createdAt', 'desc')
        );
        unsubs.push(onSnapshot(qAll, (snapshot) => {
            const res: Prompt[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.deleted) return;
                if (data.title) res.push({ id: doc.id, ...data, createdAt: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : data.createdAt } as Prompt);
            });
            console.log("CreatorTools: All Requests (Admin):", res.length);
            setRequestsAll(res);
        }));
    }

    return () => unsubs.forEach(u => u());
  }, [user, participantEmail, isAdmin]);

  // Fetch Submissions (Dual Query)
  useEffect(() => {
      if (!user?.uid && !participantEmail) return;
      
      const unsubs: (() => void)[] = [];

      // 1. Query by UID (uploaderUid)
      if (user?.uid) {
          const qUid = query(
              collection(db, 'submissions'), 
              where('uploaderUid', '==', user.uid)
          );
          unsubs.push(onSnapshot(qUid, (snapshot) => {
              const res: Submission[] = [];
              snapshot.forEach(doc => {
                  const data = doc.data();
                  if (data.deleted) return;
                  if (data.title) res.push({ id: doc.id, ...data, createdAt: getTimestampAsNumber(data.createdAt) } as Submission);
              });
              setSubmissionsByUid(res);
          }));
      }

      // 2. Query by Email (uploaderEmail)
      const email = user?.email || participantEmail;
      if (email) {
          const normalizedEmail = email.toLowerCase();
          const qEmail = query(
              collection(db, 'submissions'), 
              where('uploaderEmail', 'in', Array.from(new Set([email, normalizedEmail])))
          );
          unsubs.push(onSnapshot(qEmail, (snapshot) => {
              const res: Submission[] = [];
              snapshot.forEach(doc => {
                  const data = doc.data();
                  if (data.deleted) return;
                  if (data.title) res.push({ id: doc.id, ...data, createdAt: getTimestampAsNumber(data.createdAt) } as Submission);
              });
              setSubmissionsByEmail(res);
          }));
      }

      return () => unsubs.forEach(u => u());
  }, [user, participantEmail]);

  // Fetch Sessions
  useEffect(() => {
      if (!user?.uid && !isAdmin) return;
      
      const unsubs: (() => void)[] = [];
      if (isAdmin) {
          const qAll = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'));
          unsubs.push(onSnapshot(qAll, (snapshot) => {
              const res: Session[] = [];
              snapshot.forEach(docSnap => {
                  res.push({ id: docSnap.id, ...docSnap.data() } as Session);
              });
              setSessions(res);
          }));
      } else if (user?.uid) {
          const qUid = query(collection(db, 'sessions'), where('ownerPub', '==', user.uid));
          unsubs.push(onSnapshot(qUid, (snapshot) => {
              const res: Session[] = [];
              snapshot.forEach(docSnap => {
                  res.push({ id: docSnap.id, ...docSnap.data() } as Session);
              });
              res.sort((a, b) => getTimestampAsNumber(b.createdAt) - getTimestampAsNumber(a.createdAt));
              setSessions(res);
          }));
      }
      return () => unsubs.forEach(u => u());
  }, [user, isAdmin]);

  // Keep selectedSession synced with sessions array
  useEffect(() => {
      if (!selectedSession || selectedSession.id === 'UNASSIGNED') return;
      const updated = sessions.find(s => s.id === selectedSession.id);
      if (updated) {
          setSelectedSession(updated);
      }
  }, [sessions]);

  // Fetch details for selectedRequest
  useEffect(() => {
      if (!selectedRequest?.id) return;

      const reqId = selectedRequest.id;
      const requestDocRef = doc(db, 'requests', reqId);

      // Subscribe to Request Document
      const unsubscribe = onSnapshot(requestDocRef, (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data() as Prompt;
              setSelectedRequest(prev => {
                  if (!prev || prev.id !== reqId) return prev;
                  return {
                      ...prev,
                      ...data,
                      createdAt: getTimestampAsNumber(data.createdAt)
                  };
              });
          } else {
              // Request was deleted or doesn't exist
              setSelectedRequest(null);
          }
      });

      return () => unsubscribe(); // Cleanup the listener
  }, [selectedRequest?.id]);

  // Process Data into Rows & Fetch Submissions/Profiles
  useEffect(() => {
      if (!selectedRequest || !selectedRequest.id) {
          setParticipants([]);
          return;
      }

      const processData = async () => {
          // STEP 1: Build a comprehensive lookup for profiles (GunPub, Email -> UID)
          // This will help standardize keys in our 'rows' map
          const userProfileLookup = new Map<string, UserProfile>(); // Key: UID, Value: Profile
          const emailToUidMap = new Map<string, string>(); // Key: email, Value: UID
          const gunPubToUidMap = new Map<string, string>(); // Key: GunPub, Value: UID

          // Fetch all profiles involved (optimization: fetch only relevant profiles)
          const allProfilesQuery = query(collection(db, 'profiles')); // Potentially wide query, could optimize
          const profileSnapshot = await getDocs(allProfilesQuery);
          profileSnapshot.forEach(docSnap => {
              const rawProfileData = docSnap.data();
              const profile: UserProfile = { 
                uid: docSnap.id, 
                alias: rawProfileData.alias || rawProfileData.displayName || rawProfileData.email || docSnap.id, // Ensure alias is always set
                ...rawProfileData 
              } as UserProfile; // Cast to UserProfile
              userProfileLookup.set(profile.uid, profile); // Key by Firebase UID
              if (profile.email) emailToUidMap.set(profile.email.toLowerCase(), profile.uid);
              if (rawProfileData.migratedFromGunPub) gunPubToUidMap.set(rawProfileData.migratedFromGunPub, profile.uid);
          });

          const rows = new Map<string, ParticipantRow>(); // Key: Firebase UID or Email

          // STEP 2: Process Participants from selectedRequest (from request.participants object)
          // Standardize keys to Firebase UID when possible and add to rows
          const participantsData = selectedRequest.participants || {};
          for (const key of Object.keys(participantsData)) { // 'key' could be GunPub or Firebase UID
              const data = participantsData[key];
              if (typeof data === 'object' && data !== null) {
                  let participantId = key;
                  
                  // Try to resolve GunPub to Firebase UID
                  if (gunPubToUidMap.has(key)) {
                      participantId = gunPubToUidMap.get(key)!;
                  } else if (emailToUidMap.has(key.toLowerCase())) { // If key is email directly, resolve to UID
                      participantId = emailToUidMap.get(key.toLowerCase())!;
                  }
                  
                  const resolvedProfile = userProfileLookup.get(participantId);

                  rows.set(participantId, {
                      id: participantId,
                      name: data.alias || resolvedProfile?.displayName || resolvedProfile?.alias || 'Unknown User',
                      contact: data.email || resolvedProfile?.email || participantId,
                      status: data.status || 'pending', // Initial status from request.participants
                      type: 'user',
                      extensionHours: data.extensionHours || 0,
                      hasPass: data.hasPass || false
                  });
              }
          }

          // STEP 3: Process Pending Emails (from request.accessList)
          // Add to rows if not already present (ensuring UID-based entries take precedence)
          if (selectedRequest.accessList) {
              for (const email of selectedRequest.accessList) {
                  const normalizedEmail = email.toLowerCase();
                  let resolvedUid = emailToUidMap.get(normalizedEmail);
                  
                  if (resolvedUid) {
                      // If email resolves to a UID, and we don't have a UID-based entry yet
                      if (!rows.has(resolvedUid)) {
                           rows.set(resolvedUid, {
                              id: resolvedUid,
                              name: userProfileLookup.get(resolvedUid)?.displayName || userProfileLookup.get(resolvedUid)?.alias || email,
                              contact: email,
                              status: 'invited',
                              type: 'user',
                              extensionHours: 0,
                              hasPass: false
                          });
                      }
                  } else {
                      // No UID found for this email, keep email as the ID if not already there
                      if (!rows.has(normalizedEmail)) { 
                           rows.set(normalizedEmail, {
                              id: normalizedEmail,
                              name: email,
                              contact: email,
                              status: 'invited',
                              type: 'email'
                          });
                      }
                  }
              }
          }

          // STEP 4: Ensure Host is Listed (by Firebase UID)
          if (selectedRequest.ownerPub && !rows.has(selectedRequest.ownerPub)) {
              const hostProfile = userProfileLookup.get(selectedRequest.ownerPub);
              rows.set(selectedRequest.ownerPub, {
                  id: selectedRequest.ownerPub,
                  name: hostProfile?.displayName || hostProfile?.alias || 'Host (You)',
                  contact: hostProfile?.email || selectedRequest.ownerPub,
                  status: 'joined', 
                  type: 'user',
                  extensionHours: 0,
                  hasPass: true
              });
          }


          // STEP 5: Fetch Submissions and update participant statuses to 'submitted'
          if (selectedRequest.id) {
              const submissionsQuery = query(
                  collection(db, 'submissions'), // Query global submissions collection
                  where('requestId', '==', selectedRequest.id)
              );
              const submissionSnapshot = await getDocs(submissionsQuery);
              const fetchedSubmissions: Submission[] = [];
              submissionSnapshot.forEach(subDoc => {
                  const subData = subDoc.data();
                  if (subData.deleted) return; // Filter deleted submissions manually
                  
                  fetchedSubmissions.push({ id: subDoc.id, ...subData, createdAt: getTimestampAsNumber(subData.createdAt) } as Submission);

                  const uploaderUid = subData.uploaderUid; 
                  const uploaderEmail = subData.uploaderEmail?.toLowerCase();

                  const peopleToCredit: { uid?: string, email?: string }[] = [];
                  if (uploaderUid || uploaderEmail) {
                      peopleToCredit.push({ uid: uploaderUid, email: uploaderEmail });
                  }
                  
                  if (subData.collaborators) {
                      let collabs = subData.collaborators;
                      if (typeof collabs === 'string') {
                          try { collabs = JSON.parse(collabs); } catch(e) {}
                      }
                      if (typeof collabs === 'object' && collabs !== null) {
                          Object.keys(collabs).forEach(k => {
                              if (k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#') && k !== uploaderUid) {
                                  peopleToCredit.push({ uid: k, email: userProfileLookup.get(k)?.email?.toLowerCase() });
                              }
                          });
                      }
                  }

                  peopleToCredit.forEach(({ uid: currentUid, email: currentEmail }) => {
                      let participantToUpdate: ParticipantRow | undefined;
                      let effectiveParticipantKey: string | undefined;
                      let keyToDeleteIfReplaced: string | undefined; 

                      // --- Lookup priority: 1. Uploader UID, 2. Email resolved to UID, 3. Direct Email ---

                      // Try by currentUid (most reliable)
                      if (currentUid) {
                          if (rows.has(currentUid)) {
                              participantToUpdate = rows.get(currentUid);
                              effectiveParticipantKey = currentUid;
                          } else if (currentEmail && rows.has(currentEmail)) {
                              // Found by email, but we have a UID. Mark for re-keying.
                              participantToUpdate = rows.get(currentEmail);
                              keyToDeleteIfReplaced = currentEmail;
                              effectiveParticipantKey = currentUid; // New effective key
                          }
                      }

                      // If not found by UID, or UID was missing, try by email (resolved to UID first, then direct email key)
                      if (!participantToUpdate && currentEmail) {
                          const resolvedUidFromEmail = emailToUidMap.get(currentEmail);
                          if (resolvedUidFromEmail && rows.has(resolvedUidFromEmail)) {
                              participantToUpdate = rows.get(resolvedUidFromEmail);
                              effectiveParticipantKey = resolvedUidFromEmail;
                          } else if (rows.has(currentEmail)) {
                              participantToUpdate = rows.get(currentEmail);
                              effectiveParticipantKey = currentEmail;
                          }
                      }

                      if (participantToUpdate && effectiveParticipantKey) {
                          if (participantToUpdate.status !== 'submitted') {
                               // If we found the participant by an old key (e.g., email or GunPub)
                               // but now have a definitive Firebase UID from the submission (uploaderUid)
                               // and the current key in rows is *not* the uploaderUid, re-key the entry.
                              if (currentUid && keyToDeleteIfReplaced) { 
                                  rows.delete(keyToDeleteIfReplaced); // Remove old entry
                                  rows.set(currentUid, { ...participantToUpdate, id: currentUid, type: 'user', status: 'submitted' });
                              } else {
                                  // Otherwise, just update the status of the existing entry
                                  rows.set(effectiveParticipantKey, { ...participantToUpdate, status: 'submitted' });
                              }
                          }
                      } 
                      // Fallback: If no existing row found, but a submission exists, create a new 'submitted' entry.
                      // This handles cases where a submitter was never in accessList or request.participants initially.
                      else if (effectiveParticipantKey || currentUid || currentEmail) {
                          const finalId = currentUid || currentEmail || 'unknown';
                          if (!rows.has(finalId)) {
                              const profile = userProfileLookup.get(finalId);
                              rows.set(finalId, {
                                  id: finalId,
                                  name: profile?.displayName || profile?.alias || currentEmail || 'Unknown User', 
                                  contact: profile?.email || currentEmail || finalId,
                                  status: 'submitted',
                                  type: currentUid ? 'user' : 'email',
                                  extensionHours: 0,
                                  hasPass: false
                              });
                          }
                      }
                  });
              });
              setSelectedRequestSubmissions(fetchedSubmissions);
          }

          // Fetch Profiles (aliases) for any remaining 'Loading...' user participants
          const finalProfilePromises: Promise<void>[] = [];
          rows.forEach((row, id) => {
              if (row.type === 'user' && row.name === 'Loading...') {
                  finalProfilePromises.push((async () => {
                      try {
                          const profileDoc = await getDoc(doc(db, 'profiles', id));
                          if (profileDoc.exists()) {
                              const profileData = profileDoc.data() as UserProfile;
                              rows.set(id, { ...row, name: profileData.displayName || profileData.alias || id, contact: profileData.email || id });
                          } else {
                              rows.set(id, { ...row, name: row.id.substring(0, 8) + '...', contact: row.id }); // Fallback for UID without profile
                          }
                      } catch (e) {
                          console.error("Error fetching profile for", id, e);
                      }
                  })());
              }
          });
          await Promise.all(finalProfilePromises);
          
          setParticipants(Array.from(rows.values()));
      };

      processData();

  }, [selectedRequest, user]);

  const grantExtension = async (pub: string, hours: number) => {
      if (!selectedRequest || !selectedRequest.id) return;
      
      try {
          const requestDocRef = doc(db, 'requests', selectedRequest.id);
          await updateDoc(requestDocRef, {
              [`participants.${pub}.extensionHours`]: hours
          });
          
          setParticipants(prev => prev.map(p => 
              p.id === pub ? { ...p, extensionHours: hours } : p
          ));
      } catch (e) {
          console.error("Error granting extension:", e);
          error("Failed to grant extension.");
      }
  };

  const grantPass = async (pub: string) => {
      if (!selectedRequest || !selectedRequest.id) return;
      
      try {
          const newPassStatus = !participants.find(p => p.id === pub)?.hasPass;
          const requestDocRef = doc(db, 'requests', selectedRequest.id);
          
          await updateDoc(requestDocRef, {
              [`participants.${pub}.hasPass`]: newPassStatus
          });

          setParticipants(prev => prev.map(p => 
            p.id === pub ? { ...p, hasPass: newPassStatus } : p
          ));
      } catch (e) {
          console.error("Error granting pass:", e);
          error("Failed to grant pass.");
      }
  };

  const handleBulkExtend = async (hours: number) => { 
      if (!selectedRequest || !selectedRequest.id) return;
      if (!confirm(`Are you sure you want to grant a ${hours} hour extension to ALL ${participants.length} participants?`)) return;
      setActionLoading(true); 
      try {
          const requestDocRef = doc(db, 'requests', selectedRequest.id);
          const updatePromises: Promise<void>[] = [];

          participants.forEach(p => {
              if (p.type === 'user' && p.id) {
                  updatePromises.push(
                      updateDoc(requestDocRef, {
                          [`participants.${p.id}.extensionHours`]: hours
                      })
                  );
              }
          });

          await Promise.all(updatePromises);
          
          setParticipants(prev => prev.map(p => ({ ...p, extensionHours: hours })));
          success(`Granted +${hours}h extension to all participants.`);
      } catch (e) {
          console.error("Error bulk granting extension:", e);
          error("Failed to grant bulk extension.");
      } finally {
          setActionLoading(false);
      }
  };
  
  const exportCSV = () => {
      if (!selectedRequest || participants.length === 0) return;

      const headers = ['Name', 'Contact', 'Status', 'Type', 'Extension (Hours)', 'Has Pass'];
      const csvContent = [
          headers.join(','),
          ...participants.map(p => `"${p.name}","${p.contact}","${p.status}","${p.type}","${p.extensionHours || 0}","${p.hasPass ? 'Yes' : 'No'}"`) 
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `participants_${selectedRequest.title.replace(/\s+/g, '_')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleGenerateExtensionLink = async () => {
      if (!selectedRequest || !selectedRequest.id || !user?.uid) return;
      
      const hoursStr = prompt("Enter extension hours (e.g. 24, 48):", "24");
      if (!hoursStr) return;
      
      const hours = parseInt(hoursStr);
      if (isNaN(hours) || hours <= 0) {
          error("Invalid hours.");
          return;
      }

      setActionLoading(true); 
      try {
          const code = crypto.randomUUID().substring(0, 8).toUpperCase();
          
          await addDoc(collection(db, 'extension_codes'), {
              code, 
              hours,
              requestId: selectedRequest.id,
              createdAt: serverTimestamp(),
              createdBy: user.uid
          });

          const url = `${window.location.origin}/request/${selectedRequest.id}?extension=${code}`;
          const copied = await copyToClipboard(url);
          if (copied) {
              success(`Extension link (+${hours}h) copied to clipboard!`);
          } else {
              success(`Link generated! (Copy failed, please copy manually): ${url}`);
          }
      } catch (e) {
          console.error("Error generating extension link:", e);
          error("Failed to generate extension link.");
      } finally {
          setActionLoading(false);
      }
  };

  const handleDeleteRequest = async () => {
      if (!selectedRequest || !selectedRequest.id) {
          console.error("Delete request failed: No selected request or ID.");
          return;
      }
      
      setActionLoading(true);
      try {
          console.log("handleDeleteRequest: Updating Firestore for ID:", selectedRequest.id);
          const requestDocRef = doc(db, 'requests', selectedRequest.id);
          await updateDoc(requestDocRef, {
              deleted: true,
              updatedAt: serverTimestamp()
          });
          
          // If there's a linked playlist, delete it too
          if (selectedRequest.playlistId) {
              console.log("handleDeleteRequest: Deleting linked playlist:", selectedRequest.playlistId);
              await updateDoc(doc(db, 'playlists', selectedRequest.playlistId), {
                  deleted: true,
                  updatedAt: serverTimestamp()
              });
          }
          
          console.log("handleDeleteRequest: Success.");
          setSelectedRequest(null);
          setShowDeleteRequestConfirm(false);
          success("Prompt deleted.");
      } catch (e) {
          console.error("Delete request failed in catch block", e);
          error("Failed to delete prompt: " + (e as Error).message);
      } finally {
          setActionLoading(false);
      }
  };

  const handleDeleteSubmission = async () => {
      if (!selectedSubmission || !selectedSubmission.id) return;
      
      setActionLoading(true);
      try {
          await deleteDoc(doc(db, 'submissions', selectedSubmission.id));
          
          if (selectedSubmission.requestId) {
              await deleteDoc(doc(db, 'requests', selectedSubmission.requestId, 'submissions', selectedSubmission.id));
          }
          
          setSelectedSubmission(null);
          setShowDeleteSubmissionConfirm(false);
          success("Submission deleted.");
      } catch (e) {
          console.error("Delete failed", e);
          error("Failed to delete submission: " + (e as Error).message);
      } finally {
          setActionLoading(false);
      }
  };

  if (isActionLoading || zipProgress !== null) {
    return (
        <div className="flex justify-center items-center h-[calc(100vh-theme(spacing.16))] text-gray-500">
            {zipProgress !== null ? (
                <div className="flex flex-col items-center gap-4 w-full max-w-md px-6 bg-gray-900 border border-gray-800 p-8 rounded-xl shadow-2xl">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-2" />
                    <div className="text-white font-medium text-center">{zipStatusText}</div>
                    <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden border border-gray-700">
                        <div 
                            className="bg-blue-500 h-full transition-all duration-300 ease-out flex items-center justify-center text-[10px] font-bold text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
                            style={{ width: `${zipProgress}%` }}
                        >
                            {zipProgress > 5 ? `${zipProgress}%` : ''}
                        </div>
                    </div>
                </div>
            ) : (
                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            )}
        </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-theme(spacing.16))]">
        {
/* Sidebar */}
        <div className={`w-full lg:w-80 border-r border-gray-800 bg-gray-950/50 overflow-y-auto flex flex-col ${selectedRequest || selectedSubmission || selectedSession ? 'hidden lg:flex' : 'flex'}`}>
            {
/* Tabs */}
            <div className="flex border-b border-gray-800">
                <button
                    onClick={() => { setActiveTab('sessions'); setSelectedRequest(null); setSelectedSubmission(null); }}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition ${activeTab === 'sessions' ? 'text-white bg-gray-900 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    <Archive className="w-4 h-4" /> Sessions
                </button>
                <button
                    onClick={() => { setActiveTab('requests'); setSelectedSubmission(null); setSelectedSession(null); }}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition ${activeTab === 'requests' ? 'text-white bg-gray-900 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    <List className="w-4 h-4" /> Prompts
                </button>
                <button
                    onClick={() => { setActiveTab('submissions'); setSelectedRequest(null); setSelectedSession(null); }}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition ${activeTab === 'submissions' ? 'text-white bg-gray-900 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    <Music className="w-4 h-4" /> Submissions
                </button>
            </div>
            
            {/* Sync Button - REMOVED (Migration Tool) */}
            
            <div className="p-4 space-y-1 flex-1 overflow-y-auto">
                {activeTab === 'sessions' ? (
                    <div className="space-y-2">
                        <button
                            onClick={() => {
                                setSessionFormName('');
                                setSessionFormDesc('');
                                setSessionFormStartDate('');
                                setSessionFormCadence('Bi-weekly');
                                setIsCreateSessionOpen(true);
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition shadow-md mb-3"
                        >
                            + New Session
                        </button>
                        
                        {sessions.map(sess => (
                            <button
                                key={sess.id}
                                onClick={() => setSelectedSession(sess)}
                                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between group transition-colors ${selectedSession?.id === sess.id 
                                    ? 'bg-blue-900/30 text-blue-400 border border-blue-500/30'
                                    : 'text-gray-300 hover:bg-gray-900 hover:text-white'
                                }`}
                            >
                                <div className="truncate">
                                    <div className="font-semibold truncate">{sess.name}</div>
                                    <div className="text-xs text-gray-500">{myRequests.filter(r => r.sessionId === sess.id).length} Prompts</div>
                                </div>
                                <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 ${selectedSession?.id === sess.id ? 'opacity-100' : ''}`} />
                            </button>
                        ))}

                        <button
                            onClick={() => setSelectedSession({ id: 'UNASSIGNED', name: 'Standalone Prompts', description: 'Prompts not assigned to any session group.', ownerPub: user?.uid || '', ownerEmail: user?.email || '', createdAt: 0 })}
                            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between group transition-colors mt-4 border-t border-gray-800/80 pt-3 ${selectedSession?.id === 'UNASSIGNED' 
                                ? 'bg-gray-800 text-gray-200 border border-gray-700'
                                : 'text-gray-400 hover:bg-gray-900 hover:text-gray-300'
                            }`}
                        >
                            <div className="truncate">
                                <div className="font-medium truncate">Standalone Prompts</div>
                                <div className="text-xs text-gray-500">{myRequests.filter(r => !r.sessionId).length} Unassigned</div>
                            </div>
                            <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 ${selectedSession?.id === 'UNASSIGNED' ? 'opacity-100' : ''}`} />
                        </button>
                    </div>
                ) : activeTab === 'requests' ? (
                    <>
                        {myRequests.map(req => (
                            <button
                                key={req.id}
                                onClick={() => setSelectedRequest(req)}
                                className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between group transition-colors ${selectedRequest?.id === req.id 
                                    ? 'bg-blue-900/30 text-blue-400'
                                    : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                                }`}
                            >
                                <span className="truncate">{req.title}</span>
                                <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 ${selectedRequest?.id === req.id ? 'opacity-100' : ''}`} />
                            </button>
                        ))}
                        {myRequests.length === 0 && <div className="text-gray-600 text-sm px-2 italic">No prompts created.</div>}
                    </>
                ) : (
                    <>
                        {mySubmissions.map(sub => (
                            <button
                                key={sub.id}
                                onClick={() => setSelectedSubmission(sub)}
                                className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between group transition-colors ${selectedSubmission?.id === sub.id 
                                    ? 'bg-blue-900/30 text-blue-400'
                                    : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                                }`}
                            >
                                <span className="truncate">{sub.title}</span>
                                <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 ${selectedSubmission?.id === sub.id ? 'opacity-100' : ''}`} />
                            </button>
                        ))}
                        {mySubmissions.length === 0 && <div className="text-gray-600 text-sm px-2 italic">No submissions yet.</div>}
                    </>
                )}
            </div>
        </div>

        <div className={`flex-1 p-4 md:p-8 bg-gray-900/10 overflow-y-auto ${selectedRequest || selectedSubmission || selectedSession ? 'block' : 'hidden lg:block'}`}>
            {activeTab === 'sessions' && selectedSession ? (
                <div>
                    <button 
                        onClick={() => setSelectedSession(null)}
                        className="lg:hidden mb-4 flex items-center gap-2 text-gray-400 hover:text-white"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Sessions
                    </button>

                    <div className="flex items-center justify-between border-b border-gray-800 pb-6 mb-6 flex-wrap gap-4">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                                    <Archive className="w-7 h-7 text-blue-400" /> {selectedSession.name}
                                </h1>
                            </div>
                            {selectedSession.description && (
                                <p className="text-gray-400 text-sm mt-1">{selectedSession.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                                {selectedSession.startDate && <span>Start: {new Date(selectedSession.startDate).toLocaleDateString()}</span>}
                                {selectedSession.cadence && <span>Cadence: {selectedSession.cadence}</span>}
                                <span>{myRequests.filter(r => selectedSession.id === 'UNASSIGNED' ? !r.sessionId : r.sessionId === selectedSession.id).length} Prompts</span>
                            </div>
                        </div>
                        {selectedSession.id !== 'UNASSIGNED' && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setSessionFormName(selectedSession.name);
                                        setSessionFormDesc(selectedSession.description || '');
                                        setSessionFormStartDate(selectedSession.startDate || '');
                                        setSessionFormCadence(selectedSession.cadence || 'Bi-weekly');
                                        setIsEditSessionOpen(true);
                                    }}
                                    className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition border border-gray-700"
                                >
                                    <Edit className="w-4 h-4" /> Edit Session
                                </button>
                                <button
                                    onClick={async () => {
                                        if (confirm(`Delete session "${selectedSession.name}"? The linked prompts will become standalone.`)) {
                                            await deleteDoc(doc(db, 'sessions', selectedSession.id!));
                                            const linked = myRequests.filter(r => r.sessionId === selectedSession.id);
                                            for (const r of linked) {
                                                await updateDoc(doc(db, 'requests', r.id!), { sessionId: null });
                                            }
                                            setSelectedSession(null);
                                            success("Session deleted and prompts unlinked.");
                                        }
                                    }}
                                    className="bg-red-900/20 hover:bg-red-900/40 text-red-400 px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition border border-red-800/30"
                                >
                                    <Trash2 className="w-4 h-4" /> Delete
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Prompts in this Session */}
                    <div className="space-y-3 mb-8">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                            {selectedSession.id === 'UNASSIGNED' ? 'Standalone Prompts' : 'Session Prompts'}
                        </h3>
                        {(() => {
                            const sessionPrompts = myRequests.filter(r => selectedSession.id === 'UNASSIGNED' ? !r.sessionId : r.sessionId === selectedSession.id);
                            if (sessionPrompts.length === 0) {
                                return (
                                    <div className="p-8 text-center bg-gray-950 border border-gray-800/80 rounded-xl text-gray-500 italic">
                                        No prompts in this group yet.
                                    </div>
                                );
                            }
                            return sessionPrompts.map(req => (
                                <div key={req.id} className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap hover:border-gray-700 transition">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-white text-base">{req.title}</h4>
                                            <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-semibold ${req.accessMode === 'direct' ? 'bg-green-900/30 text-green-400 border border-green-800/50' : 'bg-purple-900/30 text-purple-400 border border-purple-800/50'}`}>
                                                {req.accessMode || 'direct'}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-4">
                                            <span>Deadline: {req.deadline ? new Date(req.deadline).toLocaleDateString() : 'None'}</span>
                                            {req.participants && <span>{Object.keys(req.participants).length} Participants</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {selectedSession.id === 'UNASSIGNED' ? (
                                            <select
                                                onChange={async (e) => {
                                                    const targetSessId = e.target.value;
                                                    if (!targetSessId) return;
                                                    try {
                                                        await updateDoc(doc(db, 'requests', req.id!), { sessionId: targetSessId });
                                                        await updateDoc(doc(db, 'sessions', targetSessId), { promptIds: arrayUnion(req.id!) });
                                                        success(`Moved "${req.title}" to session!`);
                                                    } catch (err: any) {
                                                        error("Failed to assign: " + err.message);
                                                    }
                                                }}
                                                defaultValue=""
                                                className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-300 focus:border-blue-500 outline-none"
                                            >
                                                <option value="" disabled>+ Assign to Session</option>
                                                {sessions.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await updateDoc(doc(db, 'requests', req.id!), { sessionId: null });
                                                        if (selectedSession.id) {
                                                            await updateDoc(doc(db, 'sessions', selectedSession.id), { promptIds: arrayRemove(req.id!) });
                                                        }
                                                        success("Removed from session");
                                                    } catch (err: any) {
                                                        error("Failed to remove: " + err.message);
                                                    }
                                                }}
                                                className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-red-400 px-3 py-1.5 rounded text-xs transition border border-gray-700"
                                                title="Remove from this session (make standalone)"
                                            >
                                                Remove from Session
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                setSelectedRequest(req);
                                                setActiveTab('requests');
                                            }}
                                            className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-3 py-1.5 rounded text-xs font-medium transition border border-blue-500/30 flex items-center gap-1"
                                        >
                                            Manage <ChevronRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>

                    {/* Add existing prompt to session */}
                    {selectedSession.id !== 'UNASSIGNED' && (
                        <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 mt-6">
                            <h4 className="text-sm font-semibold text-white mb-2">Add Existing Prompt to Session</h4>
                            <p className="text-xs text-gray-400 mb-3">Select a prompt from your standalone or other sessions to pull into this session group.</p>
                            <div className="flex gap-2 flex-wrap">
                                <select
                                    value={addPromptToSessionId}
                                    onChange={e => setAddPromptToSessionId(e.target.value)}
                                    className="flex-1 min-w-[200px] bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-blue-500 outline-none"
                                >
                                    <option value="">-- Select a Prompt --</option>
                                    {myRequests.filter(r => r.sessionId !== selectedSession.id).map(r => (
                                        <option key={r.id} value={r.id!}>
                                            {r.title} ({r.sessionId ? 'In another session' : 'Standalone'})
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={async () => {
                                        if (!addPromptToSessionId) return;
                                        try {
                                            const reqToMove = myRequests.find(r => r.id === addPromptToSessionId);
                                            if (reqToMove?.sessionId) {
                                                await updateDoc(doc(db, 'sessions', reqToMove.sessionId), { promptIds: arrayRemove(addPromptToSessionId) });
                                            }
                                            await updateDoc(doc(db, 'requests', addPromptToSessionId), { sessionId: selectedSession.id });
                                            if (selectedSession.id) {
                                                await updateDoc(doc(db, 'sessions', selectedSession.id), { promptIds: arrayUnion(addPromptToSessionId) });
                                            }
                                            setAddPromptToSessionId('');
                                            success("Prompt added to session!");
                                        } catch (err: any) {
                                            error("Failed to add prompt: " + err.message);
                                        }
                                    }}
                                    disabled={!addPromptToSessionId}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                                >
                                    + Add to Session
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : activeTab === 'requests' && selectedRequest ? (
                <div>
                    <button 
                        onClick={() => setSelectedRequest(null)}
                        className="lg:hidden mb-4 flex items-center gap-2 text-gray-400 hover:text-white"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to List
                    </button>

                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-white">{selectedRequest.title}</h1>
                                <Link 
                                    to={`/request/${selectedRequest.id}`}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                                    title="Open Request Page"
                                >
                                    <ExternalLink className="w-5 h-5" />
                                </Link>
                                <button 
                                    onClick={() => setIsEditRequestOpen(true)}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                                    title="Edit Request"
                                >
                                    <Edit className="w-5 h-5" />
                                </button>
                                <button 
                                    onClick={() => setShowDeleteRequestConfirm(true)}
                                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition"
                                    title="Delete Request"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                                <button 
                                    onClick={handleGenerateExtensionLink}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                                    title="Generate Extension Link"
                                >
                                    <LinkIcon className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-gray-400">Manage participants and exports</p>
                        </div>
                        <button 
                            onClick={exportCSV}
                            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-700 transition"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export CSV</span>
                        </button>
                    </div>

                    <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden overflow-x-auto">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center flex-wrap gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 text-sm">Bulk Actions:</span>
                                <button 
                                    onClick={() => handleBulkExtend(24)}
                                    className="px-3 py-1.5 bg-blue-900/30 text-blue-400 border border-blue-800 rounded text-xs hover:bg-blue-900/50 transition"
                                >
                                    +24h All
                                </button>
                                <button 
                                    onClick={() => handleBulkExtend(48)}
                                    className="px-3 py-1.5 bg-blue-900/30 text-blue-400 border border-blue-800 rounded text-xs hover:bg-blue-900/50 transition"
                                >
                                    +48h All
                                </button>
                                <button 
                                    onClick={async () => {
                                        if (selectedRequestSubmissions.length === 0) {
                                            error("No submissions to download.");
                                            return;
                                        }
                                        
                                        setZipProgress(0);
                                        setZipStatusText("Starting download...");
                                        try {
                                            const zip = new JSZip();
                                            const folderName = selectedRequest.title.replace(/[/\\?%*:|"<>]/g, '-');
                                            const folder = zip.folder(folderName);
                                            
                                            let successCount = 0;
                                            const total = selectedRequestSubmissions.length;
                                            
                                            // Process sequentially to avoid browser limits
                                            for (let i = 0; i < total; i++) {
                                                const sub = selectedRequestSubmissions[i];
                                                if (!sub.audioUrl) continue;
                                                
                                                setZipStatusText(`Downloading ${i + 1} of ${total}: ${sub.title}...`);
                                                
                                                try {
                                                    const response = await fetch(sub.audioUrl);
                                                    const blob = await response.blob();
                                                    const extension = sub.audioUrl.split('?')[0].split('.').pop() || 'mp3';
                                                    const artist = sub.byline || sub.uploaderEmail?.split('@')[0] || 'Anonymous';
                                                    const filename = `${artist} - ${sub.title}.${extension}`.replace(/[/\\?%*:|"<>]/g, '-');
                                                    folder?.file(filename, blob);
                                                    successCount++;
                                                } catch (err) {
                                                    console.error("Failed to fetch audio for zip:", sub.title, err);
                                                }
                                                
                                                // Fetching takes up first 90% of the progress bar
                                                setZipProgress(Math.round(((i + 1) / total) * 90));
                                            }
                                            
                                            if (successCount === 0) {
                                                error("Failed to download any audio files.");
                                                setZipProgress(null);
                                                return;
                                            }

                                            setZipStatusText("Compressing files into ZIP...");
                                            const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
                                                // Compression takes up the final 10%
                                                setZipProgress(90 + Math.round(metadata.percent * 0.1));
                                            });
                                            
                                            const url = window.URL.createObjectURL(content);
                                            const a = document.createElement('a');
                                            a.style.display = 'none';
                                            a.href = url;
                                            a.download = `${folderName}.zip`;
                                            document.body.appendChild(a);
                                            a.click();
                                            window.URL.revokeObjectURL(url);
                                            success(`Zip downloaded successfully with ${successCount} tracks.`);
                                        } catch (err) {
                                            console.error("Error creating zip:", err);
                                            error("Failed to create zip file.");
                                        } finally {
                                            setZipProgress(null);
                                            setZipStatusText('');
                                        }
                                    }}
                                    className="px-3 py-1.5 flex items-center gap-1 bg-green-900/30 text-green-400 border border-green-800 rounded text-xs hover:bg-green-900/50 transition"
                                    title="Download all submissions as a Zip file"
                                >
                                    <Archive className="w-3 h-3" /> Download ZIP
                                </button>
                            </div>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:border-blue-500 outline-none"
                            >
                                <option value="all">All Statuses</option>
                                <option value="submitted">Submitted</option>
                                <option value="pending">Pending / Invited</option>
                                <option value="accepted">Accepted</option>
                            </select>
                        </div>
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-900 text-gray-400 text-xs uppercase font-medium">
                                <tr>
                                    <th className="px-6 py-4">Participant</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Extensions</th>
                                    <th className="px-6 py-4">Pass</th>
                                    <th className="px-6 py-4">Type</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {participants.filter(p => {
                                    if (filterStatus === 'all') return true;
                                    if (filterStatus === 'submitted') return p.status === 'submitted';
                                    if (filterStatus === 'pending') return p.status === 'pending' || p.status === 'invited';
                                    return p.status === filterStatus;
                                }).map((p, i) => (
                                    <tr key={i} className="text-sm hover:bg-gray-900/50 transition-colors">
                                        <td className="px-6 py-4 text-white font-medium">
                                            {p.type === 'user' ? (
                                                <Link to={`/profile/${p.id}`} className="hover:text-blue-400 hover:underline">
                                                    {p.name}
                                                </Link>
                                            ) : (
                                                <span className="text-gray-300">{p.name}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs border ${p.status === 'joined' || p.status === 'accepted' || p.status === 'submitted'
                                                ? 'bg-green-900/20 text-green-400 border-green-900/50'
                                                : 'bg-yellow-900/20 text-yellow-400 border-yellow-900/50'
                                            }`}>
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1">
                                                <select 
                                                    value={p.extensionHours || 0}
                                                    onChange={(e) => grantExtension(p.id, Number(e.target.value))}
                                                    className="bg-gray-800 text-white text-xs border border-gray-700 rounded px-2 py-1 outline-none focus:border-blue-500"
                                                >
                                                    <option value={0}>None</option>
                                                    <option value={12}>+12h</option>
                                                    <option value={24}>+24h</option>
                                                    <option value={48}>+48h</option>
                                                </select>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {p.type === 'user' && (
                                                <button 
                                                    onClick={() => grantPass(p.id)}
                                                    className={`p-1 rounded transition ${p.hasPass 
                                                        ? 'bg-green-900/30 text-green-400 border border-green-900' 
                                                        : 'text-gray-600 hover:text-gray-400'}`}
                                                    title="Grant Pass (Mark as participated)"
                                                >
                                                    <SkipForward className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500">
                                            {p.type === 'email' ? <Mail className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                                        </td>
                                    </tr>
                                ))}
                                {participants.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                            <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                            No participants found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : activeTab === 'submissions' && selectedSubmission ? (
                <div>
                    <button 
                        onClick={() => setSelectedSubmission(null)}
                        className="lg:hidden mb-4 flex items-center gap-2 text-gray-400 hover:text-white"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to List
                    </button>

                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-white">{selectedSubmission.byline || 'Anonymous'}</h1>
                                <button 
                                    onClick={() => setIsEditSubmissionOpen(true)}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                                    title="Edit Submission"
                                >
                                    <Edit className="w-5 h-5" />
                                </button>
                                <button 
                                    onClick={() => setShowDeleteSubmissionConfirm(true)}
                                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition"
                                    title="Delete Submission"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                                {isAdmin && selectedSubmission.audioUrl && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                const response = await fetch(selectedSubmission.audioUrl);
                                                const blob = await response.blob();
                                                const url = window.URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.style.display = 'none';
                                                a.href = url;
                                                // Try to construct a nice filename
                                                const extension = selectedSubmission.audioUrl.split('?')[0].split('.').pop() || 'mp3';
                                                a.download = `${selectedSubmission.title} - ${selectedSubmission.byline || 'Anonymous'}.${extension}`;
                                                document.body.appendChild(a);
                                                a.click();
                                                window.URL.revokeObjectURL(url);
                                            } catch (err) {
                                                console.error('Failed to download audio:', err);
                                                // Fallback to opening in a new tab if fetch fails due to CORS
                                                window.open(selectedSubmission.audioUrl, '_blank');
                                            }
                                        }}
                                        className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded transition"
                                        title="Download Track"
                                    >
                                        <Download className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                            <p className="text-gray-400 text-sm font-medium">
                                {selectedSubmission.title}
                            </p>
                            <p className="text-gray-500 text-xs">
                                Submitted on {new Date(getTimestampAsNumber(selectedSubmission.createdAt)).toLocaleDateString()}
                            </p>
                        </div>
                    </div>

                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
                        <div className="flex flex-col md:flex-row items-start gap-6">
                            <div className="w-full md:w-32 aspect-square md:h-32 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                                {selectedSubmission.artworkUrl ? (
                                    <img src={selectedSubmission.artworkUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600"><Music className="w-12 h-12" /></div>
                                )}
                            </div>
                            <div className="space-y-4 flex-1 w-full">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold">Track Title</label>
                                        <p className="text-white">{selectedSubmission.title}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold">Comments</label>
                                        <p className="text-white">
                                            {submissionCommentCount !== null ? submissionCommentCount : 'Loading...'}
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase font-bold">Request</label>
                                    <p>
                                        <Link to={`/request/${selectedSubmission.requestId}`} className="text-blue-400 hover:underline flex items-center gap-1">
                                            View Request <ExternalLink className="w-3 h-3" />
                                        </Link>
                                    </p>
                                </div>
                                {selectedSubmission.lyrics && (
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold">Lyrics / Notes</label>
                                        <p className="text-gray-300 text-sm whitespace-pre-wrap mt-1">{selectedSubmission.lyrics}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                    {activeTab === 'sessions' ? <Archive className="w-16 h-16 mb-4 opacity-20" /> : activeTab === 'requests' ? <Users className="w-16 h-16 mb-4 opacity-20" /> : <Music className="w-16 h-16 mb-4 opacity-20" />}
                    <p>Select a {activeTab === 'sessions' ? 'session' : activeTab === 'requests' ? 'prompt' : 'submission'} from the sidebar to manage it.</p>
                </div>
            )}
        </div>
        
        {/* Create / Edit Session Modal */}
        {(isCreateSessionOpen || isEditSessionOpen) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
                    <h3 className="text-xl font-bold text-white mb-4">
                        {isEditSessionOpen ? 'Edit Session' : 'Create New Session'}
                    </h3>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        if (!sessionFormName.trim()) return;
                        if (isEditSessionOpen && selectedSession?.id) {
                            try {
                                await updateDoc(doc(db, 'sessions', selectedSession.id), {
                                    name: sessionFormName.trim(),
                                    description: sessionFormDesc.trim(),
                                    startDate: sessionFormStartDate || null,
                                    cadence: sessionFormCadence || null,
                                    updatedAt: serverTimestamp()
                                });
                                success("Session updated!");
                                setIsEditSessionOpen(false);
                            } catch (err: any) {
                                error("Failed to update session: " + err.message);
                            }
                        } else {
                            try {
                                await addDoc(collection(db, 'sessions'), {
                                    name: sessionFormName.trim(),
                                    description: sessionFormDesc.trim(),
                                    startDate: sessionFormStartDate || null,
                                    cadence: sessionFormCadence || null,
                                    ownerPub: user?.uid,
                                    ownerEmail: user?.email?.toLowerCase(),
                                    createdAt: serverTimestamp(),
                                    promptIds: []
                                });
                                success("Session created!");
                                setIsCreateSessionOpen(false);
                            } catch (err: any) {
                                error("Failed to create session: " + err.message);
                            }
                        }
                    }} className="space-y-4">
                        <div>
                            <label className="block text-gray-400 text-sm mb-1">Session Name *</label>
                            <input
                                type="text"
                                value={sessionFormName}
                                onChange={e => setSessionFormName(e.target.value)}
                                placeholder="e.g. Summer 2026 Songwriting"
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-gray-400 text-sm mb-1">Description (Optional)</label>
                            <textarea
                                value={sessionFormDesc}
                                onChange={e => setSessionFormDesc(e.target.value)}
                                placeholder="e.g. 10 weeks of summer beat challenges..."
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none h-20 text-sm"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={sessionFormStartDate}
                                    onChange={e => setSessionFormStartDate(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">Cadence</label>
                                <select
                                    value={sessionFormCadence}
                                    onChange={e => setSessionFormCadence(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                                >
                                    <option value="Weekly">Weekly</option>
                                    <option value="Bi-weekly">Bi-weekly</option>
                                    <option value="Monthly">Monthly</option>
                                    <option value="Custom">Custom</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                            <button
                                type="button"
                                onClick={() => { setIsCreateSessionOpen(false); setIsEditSessionOpen(false); }}
                                className="px-4 py-2 text-gray-400 hover:text-white text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-semibold text-sm"
                            >
                                {isEditSessionOpen ? 'Save Changes' : 'Create Session'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {isEditRequestOpen && selectedRequest && (
            <EditPrompt 
                request={selectedRequest}
                onClose={() => setIsEditRequestOpen(false)}
                onUpdate={() => {
                    setSelectedRequest({ ...selectedRequest }); 
                }}
            />
        )}

        {isEditSubmissionOpen && selectedSubmission && (
            <SubmitTrack
                requestId={selectedSubmission.requestId}
                existingSubmission={selectedSubmission}
                onClose={() => setIsEditSubmissionOpen(false)}
                onSuccess={() => {
                    // Refetch submissions after successful edit if not using real-time listener for this specific submission
                    // Currently, the parent CreatorTools component has an onSnapshot listener for submissions,
                    // so changes should be reflected automatically.
                    setIsEditSubmissionOpen(false);
                }}
            />
        )}

        <ConfirmModal 
            isOpen={showDeleteRequestConfirm}
            title="Delete Request?"
            message="Are you sure you want to delete this request? It will be hidden from all participants and cannot be undone."
            confirmLabel="Delete Forever"
            isDestructive={true}
            onConfirm={handleDeleteRequest}
            onCancel={() => setShowDeleteRequestConfirm(false)}
        />

        <ConfirmModal 
            isOpen={showDeleteSubmissionConfirm}
            title="Delete Submission?"
            message="Are you sure you want to delete this submission? This cannot be undone."
            confirmLabel="Delete Forever"
            isDestructive={true}
            onConfirm={handleDeleteSubmission}
            onCancel={() => setShowDeleteSubmissionConfirm(false)}
        />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2, Trash2, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; 
import { useToast } from '../contexts/ToastContext';
import { uploadToR2 } from '../lib/r2'; 
import { db } from '../lib/firebase';
import { doc, updateDoc, collection, query, where, getDocs, getDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'; // Removed Timestamp
import type { FileRequest, UserProfile, Notification, Playlist } from '../types';
import { ConfirmModal } from './ui/ConfirmModal';
import { Tooltip } from './ui/Tooltip';
import { getTimestampAsNumber } from '../lib/utils'; // Import the utility
interface EditRequestProps {
  request: FileRequest;
  onClose: () => void;
  onUpdate: () => void; // Added onUpdate prop
}

export function EditRequest({ request, onClose, onUpdate }: EditRequestProps) {
  const { user, participantEmail } = useAuth(); 
  const { success, error } = useToast();
  const navigate = useNavigate();
  
  const [title, setTitle] = useState(request.title);
  const [desc, setDesc] = useState(request.description);
  
  // Initialize deadline: Convert UTC ISO (if stored) to Local "YYYY-MM-DDTHH:mm" for input
  const [deadline, setDeadline] = useState(() => {
      if (!request.deadline) return '';
      // Check if it looks like an ISO string (ends in Z)
      if (request.deadline.endsWith('Z')) {
          const d = new Date(request.deadline);
          // Adjust to local time components but keep as object to format
          const offset = d.getTimezoneOffset() * 60000;
          const localTime = new Date(d.getTime() - offset);
          return localTime.toISOString().slice(0, 16);
      }
      return request.deadline; // Legacy (already local string)
  });
  
  const [playlistLiveDate, setPlaylistLiveDate] = useState(() => {
      if (!request.playlistLiveDate) return '';
      if (request.playlistLiveDate.endsWith('Z')) {
          const d = new Date(request.playlistLiveDate);
          const offset = d.getTimezoneOffset() * 60000;
          const localTime = new Date(d.getTime() - offset);
          return localTime.toISOString().slice(0, 16);
      }
      return request.playlistLiveDate;
  });

  const [accessMode, setAccessMode] = useState<'direct' | 'invite' | 'volunteer' >(
      (request.accessMode === 'public' ? 'direct' : request.accessMode) as 'direct' | 'invite' | 'volunteer' || 'direct'
  );
  const [file, setFile] = useState<File | null>(null);
  const [currentArtworkUrl] = useState(request.artworkUrl || ''); // Removed unused setter
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Volunteer Settings
  const [poolSeats, setPoolSeats] = useState(request.poolSeats || 3);
  const [allowSubmissions, setAllowSubmissions] = useState(request.allowParticipantSubmissions !== undefined ? request.allowParticipantSubmissions : true);
  const [previewTrackCount, setPreviewTrackCount] = useState<number>(request.previewTrackCount !== undefined ? request.previewTrackCount : 5);

  // Import Logic
  const [existingRequests, setExistingRequests] = useState<FileRequest[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string>('');
  const [importFilter, setImportFilter] = useState<'all' | 'accepted' | 'submitted'>('all');

  // Participant Management Logic
  const [selectedParticipants, setSelectedParticipants] = useState<Record<string, any>>(request.participants || {});
  const [emailInput, setEmailInput] = useState('');
  const [pendingEmails, setPendingEmails] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

  // Separate Playlist Access
  const [separatePlaylistAccess, setSeparatePlaylistAccess] = useState(false);
  const [playlistEmailInput, setPlaylistEmailInput] = useState('');
  const [playlistEmails, setPlaylistEmails] = useState<string[]>([]);
  const [playlistDocId, setPlaylistDocId] = useState<string | null>(null);

  // Scroll Lock

  // Scroll Lock
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  // Fetch Existing Requests for Import
  useEffect(() => {
    if (!user || !user.uid) return; 
    const fetchRequests = async () => {
      try {
        const q = query(collection(db, 'requests'), where('ownerPub', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const list: FileRequest[] = [];
        querySnapshot.forEach((docSnap) => {
          if (docSnap.exists() && docSnap.id !== request.id) { 
            list.push({ id: docSnap.id, ...docSnap.data() } as FileRequest);
          }
        });
        // Corrected sorting logic for createdAt
        list.sort((a, b) => 
            getTimestampAsNumber(a.createdAt) - getTimestampAsNumber(b.createdAt)
        );
        setExistingRequests(list);
      } catch (e) {
        console.error("Error fetching existing requests for import:", e);
      }
    };
    fetchRequests();
  }, [user, request.id]);

  const handleImportSelect = async (importId: string) => {
    setSelectedImportId(importId);
    if (!importId) return;

    try {
      const importRequestDocRef = doc(db, 'requests', importId);
      const importRequestSnap = await getDoc(importRequestDocRef);

      if (!importRequestSnap.exists()) {
        console.warn("Import request not found:", importId);
        return;
      }

      const importRequestData = importRequestSnap.data() as FileRequest;
      const newParticipants: Record<string, any> = {};
      const submitters = new Set<string>();

      if (importFilter === 'submitted') {
        const submissionsQuery = query(collection(importRequestDocRef, 'submissions'));
        const submissionsSnapshot = await getDocs(submissionsQuery);
        submissionsSnapshot.forEach(subDoc => {
          const subData = subDoc.data();
          if (subData.uploaderUid) {
            submitters.add(subData.uploaderUid);
          }
        });
      }
      
      const participantsData = importRequestData.participants || {}; 
      const accessListEmails = importRequestData.accessList || []; 

      for (const uid of Object.keys(participantsData)) {
        const participant = participantsData[uid];
        if (!participant || uid === user?.uid) continue;
        if (selectedParticipants[uid]) continue; 

        if (importFilter === 'accepted' && participant.status !== 'accepted') continue;
        if (importFilter === 'submitted') {
            const hasSubmitted = submitters.has(uid);
            if (!hasSubmitted) continue; 
        }
        
        newParticipants[uid] = { 
            status: 'pending', 
            alias: participant.alias || 'Unknown' 
        };
      }

      const newPendingEmails = new Set(pendingEmails);
      accessListEmails.forEach(email => {
        if (!newPendingEmails.has(email)) {
          newPendingEmails.add(email);
        }
      });
      setPendingEmails(Array.from(newPendingEmails));

      setSelectedParticipants(prev => ({ ...prev, ...newParticipants }));

    } catch (e) {
      console.error("Error importing participants:", e);
      error("Failed to import participants.");
    }
  };

  // Re-run import if filter changes and an ID is selected
  useEffect(() => {
      if (selectedImportId) {
          handleImportSelect(selectedImportId);
      }
  }, [importFilter]);

  // Sync participants if data arrives after mount
  useEffect(() => {
      const newHasData = request.participants && Object.keys(request.participants).length > 0; // Simplified check
      
      if (!selectedParticipants || Object.keys(selectedParticipants).length === 0 || newHasData) { // Adjusted condition
          setSelectedParticipants(request.participants || {});
      }
  }, [request.participants]);

  // Load pending emails and participant aliases from Firestore
  useEffect(() => {
      // Set pending emails from request.accessList if available
      if (request.accessList && Array.isArray(request.accessList)) {
          setPendingEmails(request.accessList);
      } else {
        setPendingEmails([]);
      }
      
      // Fetch aliases for selected participants from Firestore 'profiles' collection
      const fetchAliases = async () => {
        const participantUids = Object.keys(selectedParticipants);
        if (participantUids.length === 0) return;

        for (const uid of participantUids) { // Changed pub to uid
            if (!selectedParticipants[uid].alias) { // Changed pub to uid
                try {
                    const profileDoc = await getDoc(doc(db, 'profiles', uid)); // Changed pub to uid
                    if (profileDoc.exists()) {
                        const profileData = profileDoc.data() as UserProfile;
                        if (profileData.alias) {
                            setSelectedParticipants(prev => {
                                if (prev[uid]) return { ...prev[uid], alias: profileData.alias }; // Changed pub to uid
                                return prev;
                            });
                        }
                    }
                } catch (e) {
                    console.error("Error fetching alias for", uid, e); // Changed pub to uid
                }
            }
        }
      };
      fetchAliases();

  }, [request.accessList, request.participants, selectedParticipants]);

  // Fetch playlist data if linked
  useEffect(() => {
    if (request.playlistId) {
        const fetchPlaylist = async () => {
            try {
                const playlistDocRef = doc(db, 'playlists', request.playlistId as string);
                const playlistSnap = await getDoc(playlistDocRef);
                if (playlistSnap.exists()) {
                    const playlistData = playlistSnap.data() as Playlist;
                    setPlaylistEmails(playlistData.accessList || []);
                    setSeparatePlaylistAccess(true); // If a playlist exists, assume separate access is intended
                    setPlaylistDocId(playlistSnap.id);
                } else {
                    console.warn("Linked playlist not found:", request.playlistId);
                    setPlaylistEmails([]);
                    setSeparatePlaylistAccess(false);
                    setPlaylistDocId(null);
                }
            } catch (e) {
                console.error("Error fetching linked playlist:", e);
                setPlaylistEmails([]);
                setSeparatePlaylistAccess(false);
                setPlaylistDocId(null);
            }
        };
        fetchPlaylist();
    } else {
        setPlaylistEmails([]);
        setSeparatePlaylistAccess(false);
        setPlaylistDocId(null);
    }
  }, [request.playlistId]);

  const searchUsers = async (term: string) => { 
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const q = query(collection(db, 'profiles'), 
                      where('alias', '>=', term), 
                      where('alias', '<=', term + '\uf8ff'));
      const querySnapshot = await getDocs(q);
      const results: UserProfile[] = [];
      querySnapshot.forEach((docSnap) => {
        const profile = docSnap.data() as UserProfile;
        if (profile.alias && profile.alias.toLowerCase().includes(term.toLowerCase()) && !selectedParticipants[docSnap.id]) {
          results.push({ ...profile, uid: docSnap.id }); 
        }
      });
      setSearchResults(results);
    } catch (e) {
      console.error("Error searching users:", e);
      setSearchResults([]);
    }
  };

  const addParticipant = (userProfile: UserProfile) => { // Renamed user to userProfile to avoid conflict
    setSelectedParticipants(prev => ({
      ...prev,
      [userProfile.uid]: { alias: userProfile.alias, status: accessMode === 'direct' ? 'accepted' : 'pending' } // Used userProfile.uid
    }));
    setSearchTerm('');
    setSearchResults([]);
  };

  const removeParticipant = (uid: string) => { // Changed pub to uid
     const newParts = { ...selectedParticipants };
     delete newParts[uid]; // Changed pub to uid
     setSelectedParticipants(newParts);
  };

  const removeEmail = (email: string) => {
    setPendingEmails(pendingEmails.filter(e => e !== email));
  };

  const removePlaylistEmail = (email: string) => {
    setPlaylistEmails(playlistEmails.filter(e => e !== email));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("EditRequest: handleSave initiated.");
    console.time("EditRequest_handleSave_total");

    if (!request.id) {
        console.log("EditRequest: Validation failed - No request ID.");
        error("Cannot save: Request ID is missing.");
        return;
    }

    if (!user?.uid && !participantEmail) {
        error("Authentication error: Please log in again to save changes.");
        console.error("EditRequest: Save failed: User not authenticated.");
        return;
    }

    setLoading(true);
          console.log("EditRequest: Save process started, setLoading(true).");
    
        let finalPendingEmails = [...pendingEmails];
        // Process any lingering email input for request
        if (emailInput.trim()) {
            const lingering = emailInput
                .split(/[\s,]+/)
                .map(s => s.trim())
                .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !finalPendingEmails.includes(s));
            if (lingering.length > 0) {
                finalPendingEmails = Array.from(new Set([...finalPendingEmails, ...lingering]));
                setPendingEmails(finalPendingEmails);
                setEmailInput('');
            }
        }
    
        let finalPlaylistEmails = [...playlistEmails];
        // Process any lingering email input for playlist
        if (separatePlaylistAccess && playlistEmailInput.trim()) {
            const lingeringPlaylist = playlistEmailInput
                .split(/[\s,]+/)
                .map(s => s.trim())
                .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !finalPlaylistEmails.includes(s));
            if (lingeringPlaylist.length > 0) {
                finalPlaylistEmails = Array.from(new Set([...finalPlaylistEmails, ...lingeringPlaylist]));
                setPlaylistEmails(finalPlaylistEmails);
                setPlaylistEmailInput('');
            }
        }
    
        try {
          let artworkUrl = currentArtworkUrl;      if (file) {
        console.log("EditRequest: Artwork file detected. Starting upload.");
        console.time("EditRequest_uploadArtwork");
        const result = await uploadToR2(file); // Use uploadToR2
        artworkUrl = result.url;
        console.timeEnd("EditRequest_uploadArtwork");
        console.log(`EditRequest: Artwork uploaded. URL: ${artworkUrl}`);
      } else {
        console.log("EditRequest: No new artwork to upload, using existing.");
      }

      let inviteCode = request.inviteCode;
      // Generate invite code if one doesn't exist
      if (!inviteCode) {
          inviteCode = crypto.randomUUID().substring(0, 8).toUpperCase();
          // Store invite code in Firestore
          await setDoc(doc(db, 'invites', inviteCode), {
              fromUid: user?.uid || 'participant',
              createdAt: serverTimestamp(),
              status: 'active',
              forRequest: request.id
          });
      }

      // Convert local input time to UTC ISO for storage
      let finalDeadline = deadline;
      if (deadline) {
          finalDeadline = new Date(deadline).toISOString();
      }
      
      let finalPlaylistLiveDate = playlistLiveDate;
      if (playlistLiveDate) {
          finalPlaylistLiveDate = new Date(playlistLiveDate).toISOString();
      }

      const updates: any = {
        title,
        description: desc,
        deadline: finalDeadline,
        playlistLiveDate: finalPlaylistLiveDate,
        accessMode,
        artworkUrl,
        inviteCode,
        accessList: finalPendingEmails, // Use normalized emails
        poolSeats: accessMode === 'volunteer' ? poolSeats : null,
        allowParticipantSubmissions: accessMode === 'volunteer' ? allowSubmissions : true,
        previewTrackCount: previewTrackCount,
        participants: selectedParticipants, // Consolidate participants update
        updatedAt: serverTimestamp()
      };

      // Only set ownerPub if it's missing (e.g., from old migration)
      if (!request.ownerPub && user?.uid) {
          updates.ownerPub = user.uid;
      }
      
      console.log("EditRequest: Starting Firestore metadata updates.");
      const requestDocRef = doc(db, 'requests', request.id);
      
      const updatePromises: Promise<any>[] = [];
      updatePromises.push(updateDoc(requestDocRef, updates));

      // Update linked Playlist document if it exists
      if (playlistDocId) {
          console.log("EditRequest: Updating linked playlist document.");
          const playlistDocRef = doc(db, 'playlists', playlistDocId);
          const playlistUpdates: any = {
              title: updates.title,
              description: updates.description,
              artworkUrl: updates.artworkUrl, // Sync artwork to playlist!
              liveDate: separatePlaylistAccess && finalPlaylistLiveDate ? new Date(finalPlaylistLiveDate).toISOString() : (finalDeadline ? new Date(finalDeadline).toISOString() : null),
              accessList: separatePlaylistAccess ? finalPlaylistEmails : finalPendingEmails,
              accessMode: (accessMode === 'direct') ? 'public' : 'private',
              updatedAt: serverTimestamp()
          };
          updatePromises.push(updateDoc(playlistDocRef, playlistUpdates));
      }

      await Promise.all(updatePromises);
      console.log("EditRequest: All primary document updates complete.");
      
      // Notify New Participants
      const existingKeys = Object.keys(oldParticipants);
      const addedParticipants = Object.keys(selectedParticipants).filter(uid => !existingKeys.includes(uid)); 
      
      const notificationPromises: Promise<any>[] = [];
      addedParticipants.forEach(async (partUid: string) => { 
          if (user?.uid && partUid === user.uid) return; 
          // Skip if it looks like an email (not a UID) - notifications only work for UID-based profiles
          if (partUid.includes('@')) return;
          
          const notifId = crypto.randomUUID();
          const message = accessMode === 'direct' 
              ? `You were added to "${title}"`
              : `You've been invited to contribute to "${title}"`;

          const notification: Notification = {
              id: notifId,
              type: 'invite',
              message,
              link: `/request/${request.id}`,
              fromUid: user?.uid || 'participant', 
              createdAt: Date.now(), 
              read: false,
              requestId: request.id!
          };
          
          notificationPromises.push(
              updateDoc(doc(db, 'profiles', partUid), {
                  notifications: arrayUnion(notification)
              })
          );
      });
      
      await Promise.all(notificationPromises);
      console.log("EditRequest: All participant notifications resolved.");

      success("Request updated!");
      onUpdate();
      onClose();

    } catch (err: any) {
      console.error("EditRequest: Save failed in catch block.", err);
      error(err.message || "Failed to update request.");
    } finally {
      setLoading(false);
      console.log("EditRequest: finally block executed. setLoading(false).");
      console.timeEnd("EditRequest_handleSave_total");
    }
  };

  const handleDeleteClick = () => {
      setShowConfirmDelete(true);
  };

  const executeDelete = async () => {
      if (!request.id) return;
      setIsDeleting(true);
      setShowConfirmDelete(false);
      
      try {
          // Soft delete by setting a 'deleted' flag
          const requestDocRef = doc(db, 'requests', request.id);
          await updateDoc(requestDocRef, {
              deleted: true,
              deletedAt: serverTimestamp()
          });
          
          success("Request deleted.");
          onUpdate();
          onClose();
          navigate('/');
      } catch (err: any) {
          console.error("Failed to delete request:", err);
          error("Failed to delete request: " + err.message);
          setIsDeleting(false);
      }
  };

  return createPortal(
    <div className="fixed top-0 left-0 w-full h-[100dvh] z-[9999] flex items-center justify-center p-4 bg-gray-950 backdrop-blur-none overscroll-none touch-none">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto overscroll-contain touch-auto">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white">Edit Request</h2>
        </div>

        <form onSubmit={handleSave} className="p-4 md:p-6 space-y-4">
            <div>
                <label className="block text-gray-400 text-sm mb-1">Title</label>
                <input 
                    type="text" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    required
                />
            </div>

            <div>
                <label className="block text-gray-400 text-sm mb-1">Description</label>
                <textarea 
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none h-32"
                    required
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-gray-400 text-sm mb-1 flex items-center gap-2">
                        Deadline
                        <Tooltip content="The cut-off time for new submissions. Comments and interactions will remain open after this time." icon />
                    </label>
                    <input 
                        type="datetime-local" 
                        value={deadline}
                        onChange={e => setDeadline(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm mb-1 flex items-center gap-2">
                        Playlist Live Date (Optional)
                        <Tooltip content="If set, submissions remain hidden until this date." icon />
                    </label>
                    <input 
                        type="datetime-local" 
                        value={playlistLiveDate}
                        onChange={e => setPlaylistLiveDate(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm mb-1 flex items-center gap-2">
                        Access Mode
                        <Tooltip content="Public: Invited users are automatically added (no acceptance needed). Private: Invited users must accept the invite. Volunteer Pool: Open to anyone to claim a limited seat." icon />
                    </label>
                    <select 
                        value={accessMode}
                        onChange={(e: any) => {
                            const newMode = e.target.value;
                            setAccessMode(newMode);
                            if (newMode === 'volunteer') {
                                setPendingEmails([]);
                                setEmailInput('');
                                setPlaylistEmails([]);
                                setPlaylistEmailInput('');
                            }
                        }}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    >
                        <option value="direct">Public (Participants auto-accepted)</option>
                        <option value="invite">Private (Invite Only)</option>
                        <option value="volunteer">Volunteer Pool</option>
                    </select>
                </div>
                <div>
                    <label className="block text-gray-400 text-sm mb-1 flex items-center gap-2">
                        Preview Tracks Limit
                        <Tooltip content="Number of tracks visible to participants after they submit but before the deadline. Set to 0 to hide all." icon />
                    </label>
                    <input 
                        type="number" 
                        min="0"
                        value={previewTrackCount}
                        onChange={e => setPreviewTrackCount(parseInt(e.target.value) || 0)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                    />
                </div>
            </div>

            {/* Volunteer Mode Settings */}
            {accessMode === 'volunteer' && (
                <div className="bg-gray-800 border border-gray-700 rounded p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        Volunteer Settings
                        <Tooltip content="Limit the number of people who can claim a spot. This encourages commitment and prevents overwhelming feedback." icon />
                    </h4>
                    
                    <div className="flex items-center gap-4">
                        <label className="text-gray-400 text-sm">Open Seats:</label>
                        <input 
                            type="number" 
                            min={2} 
                            value={poolSeats} 
                            onChange={e => setPoolSeats(Math.max(2, parseInt(e.target.value) || 2))}
                            className="w-20 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-center focus:border-blue-500 outline-none"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            id="allowSubmissions"
                            checked={allowSubmissions}
                            onChange={e => setAllowSubmissions(e.target.checked)}
                            className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="allowSubmissions" className="text-gray-400 text-sm cursor-pointer select-none flex items-center gap-2">
                            Allow volunteers to submit tracks
                            <Tooltip content="Uncheck this if you only want feedback on YOUR tracks. If checked, volunteers can upload their own work." icon />
                        </label>
                    </div>
                </div>
            )}

            {/* Participants Management */}
            {accessMode !== 'volunteer' && (
            <div className="border-t border-gray-800 pt-4">
               <label className="block text-gray-400 text-sm mb-2 font-semibold flex items-center gap-2">
                 <UserPlus className="w-4 h-4" />
                 Manage Participants
                 <Tooltip content="Build your invite list here. Users must be invited to see this request (unless Volunteer Mode is on)." icon />
               </label>

               {/* Option for separate playlist access */}
               <div className="flex items-center mb-4">
                   <input 
                       type="checkbox" 
                       id="separatePlaylistAccess"
                       checked={separatePlaylistAccess}
                       onChange={e => setSeparatePlaylistAccess(e.target.checked)}
                       className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
                   />
                   <label htmlFor="separatePlaylistAccess" className="text-gray-400 text-sm ml-2 cursor-pointer select-none">
                       Use separate access list for playlist
                   </label>
                   <Tooltip content="If checked, the playlist will have its own separate invite list. Otherwise, it uses the request's participant list." icon />
               </div>
               
               {/* Import from previous */}
               <div className="flex gap-2 items-end mb-4">
                <div className="flex-1">
                    <label className="block text-gray-500 text-xs mb-1 flex items-center gap-2">
                        Import from Previous
                        <Tooltip content="Quickly copy the participant list from a past request." icon />
                    </label>
                    <select
                        value={selectedImportId}
                        onChange={(e) => handleImportSelect(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                    >
                        <option value="">-- Select --</option>
                        {existingRequests.map(req => (
                            <option key={req.id} value={req.id}>{req.title}</option>
                        ))}
                    </select>
                </div>
                <div className="w-1/3">
                    <label className="block text-gray-500 text-xs mb-1 flex items-center gap-2">
                        Filter
                        <Tooltip content="Choose which users to copy: All invited, only those who accepted, or only those who submitted tracks." icon />
                    </label>
                    <select
                        value={importFilter}
                        onChange={(e: any) => setImportFilter(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                    >
                        <option value="all">All</option>
                        <option value="accepted">Accepted</option>
                        <option value="submitted">Submitted</option>
                    </select>
                </div>
               </div>
               
               {/* Search Directory */}
               <div className="relative mb-3">
                 <input
                   type="text"
                   value={searchTerm}
                   onChange={(e) => searchUsers(e.target.value)}
                   className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none text-sm"
                   placeholder="Add user from directory..."
                 />
                 {searchResults.length > 0 && (
                   <div className="absolute z-10 w-full bg-gray-800 border border-gray-600 rounded mt-1 max-h-40 overflow-y-auto shadow-xl">
                     {searchResults.map(user => (
                       <div 
                         key={user.uid} // Changed user.pub to user.uid
                         onClick={() => addParticipant(user)}
                         className="p-2 hover:bg-gray-700 cursor-pointer text-white text-sm flex justify-between items-center"
                       >
                         <span>{user.alias}</span>
                         <span className="text-xs text-gray-400">Add</span>
                       </div>
                     ))}
                   </div>
                 )}
               </div>

               {/* 3. Email Invites */}
               <div className="mb-3">
                 <label className="block text-gray-500 text-xs mb-1 flex items-center gap-2">
                     Invite by Email
                     <Tooltip content="Add external users. They will need the invite link to join." icon />
                 </label>
                 <div className="flex flex-col gap-2 mb-2">
                   <textarea 
                     value={emailInput}
                     onChange={e => {
                        const val = e.target.value;
                        setEmailInput(val);
                        
                        // Auto-process on paste or delimiter
                        if (val.includes(',') || val.includes('\n')) {
                            const raw = val.split(/[\s,]+/); // Fixed regex
                            const valid: string[] = [];
                            let remaining = '';

                            raw.forEach((s, i) => {
                                const trimmed = s.trim();
                                const endsWithDelimiter = val.trimEnd().match(/[" ",\s,]$/); // Fixed regex
                                const hasInternalSpace = trimmed.includes(' ');

                                if (i === raw.length - 1 && !endsWithDelimiter) { 
                                    remaining = s; 
                                } else if (trimmed.length > 5 && trimmed.includes('@') && !hasInternalSpace && !pendingEmails.includes(trimmed)) {
                                    valid.push(trimmed);
                                }
                            });
                            
                            if (valid.length > 0) {
                                setPendingEmails(prev => Array.from(new Set([...prev, ...valid])));
                                setEmailInput(remaining); 
                            }
                        }
                     }}
                     onBlur={() => {
                        if (!emailInput.trim()) return;
                        const valid = emailInput
                            .split(/[\s,]+/) // Fixed regex
                            .map(s => s.trim())
                            .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !pendingEmails.includes(s));
                        
                        if (valid.length > 0) {
                            setPendingEmails(prev => Array.from(new Set([...prev, ...valid])));
                            setEmailInput(''); 
                        }
                     }}
                     className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none h-20 text-sm"
                     placeholder="friend@example.com (Press Enter or Comma to add)"
                   />
                   <p className="text-xs text-gray-500">Paste a list of emails here. Separate with commas or newlines.</p>
                 </div>
               </div>

               {/* Selected List */}
               {(Object.keys(selectedParticipants).length > 0 || pendingEmails.length > 0) && (
                  <div className="flex flex-wrap gap-2 mb-4">
                     {Object.entries(selectedParticipants).map(([uid, p]: [string, any]) => ( // Changed pub to uid
                        <span key={uid} className="bg-indigo-900/50 text-indigo-200 text-xs px-2 py-1 rounded flex items-center gap-2 border border-indigo-500/30">
                          <span title={uid}>{p.alias || 'User'}</span>
                          <button type="button" onClick={() => removeParticipant(uid)} className="hover:text-white font-bold px-1">×</button>
                        </span>
                     ))}
                     {pendingEmails.map(email => (
                       <span key={email} className="bg-blue-900/50 text-blue-200 text-xs px-2 py-1 rounded flex items-center gap-2 border border-blue-500/30">
                         {email}
                         <button type="button" onClick={() => removeEmail(email)} className="hover:text-white font-bold px-1">×</button>
                       </span>
                     ))}
                  </div>
               )}

               {/* Separate Playlist Participants */}
               {separatePlaylistAccess && (
                <div className="border-t border-gray-800 pt-4 mt-4">
                  <label className="block text-gray-400 text-sm mb-2 font-semibold flex items-center gap-2">
                      Manage Playlist Participants
                      <Tooltip content="Build the invite list specifically for the playlist. These users will only see the playlist content." icon />
                  </label>
                  <div className="mb-3">
                    <label className="block text-gray-500 text-xs mb-1 flex items-center gap-2">
                        Invite by Email (Comma or newline separated)
                        <Tooltip content="Add external users to the playlist. They will need the invite link to join." icon />
                    </label>
                    <div className="flex flex-col gap-2 mb-2">
                      <textarea 
                        value={playlistEmailInput}
                        onChange={e => {
                            const val = e.target.value;
                            setPlaylistEmailInput(val);
                            
                            if (val.includes(',') || val.includes('\n')) {
                                const raw = val.split(/[\n,\s]+/);
                                const valid: string[] = [];
                                let remaining = '';

                                raw.forEach((s, i) => {
                                    const trimmed = s.trim();
                                    const endsWithDelimiter = val.trimEnd().match(/[`,]$/);
                                    
                                    const hasInternalSpace = trimmed.includes(' ');

                                    if (i === raw.length - 1 && !endsWithDelimiter) { 
                                        remaining = s; 
                                    } else if (trimmed.length > 5 && trimmed.includes('@') && !hasInternalSpace && !playlistEmails.includes(trimmed)) {
                                        valid.push(trimmed);
                                    }
                                });
                                
                                if (valid.length > 0) {
                                    setPlaylistEmails(prev => Array.from(new Set([...prev, ...valid])));
                                    setPlaylistEmailInput(remaining); 
                                }
                            }
                        }}
                        onBlur={() => {
                            if (!playlistEmailInput.trim()) return;
                            const valid = playlistEmailInput
                                .split(/[\n,\s]+/)
                                .map(s => s.trim())
                                .filter(s => s.length > 5 && s.includes('@') && !s.includes(' ') && !playlistEmails.includes(s));
                            
                            if (valid.length > 0) {
                                setPlaylistEmails(prev => Array.from(new Set([...prev, ...valid])));
                                setPlaylistEmailInput(''); 
                            }
                        }}
                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none h-20 text-sm"
                        placeholder="playlistfriend@example.com (Press Enter or Comma to add)"
                      />
                      <p className="text-xs text-gray-500">Paste a list of emails here. Separate with commas or newlines.</p>
                    </div>
                  </div>
                  
                  {(playlistEmails.length > 0) && (
                    <div className="bg-gray-900 p-3 rounded border border-gray-700">
                       <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Selected Playlist Participants</label>
                       <div className="flex flex-wrap gap-2">
                         {playlistEmails.map(email => (
                           <span key={email} className="bg-yellow-900/50 text-yellow-200 text-xs px-2 py-1 rounded flex items-center gap-2 border border-yellow-700/50">
                             {email}
                             <button type="button" onClick={() => removePlaylistEmail(email)} className="hover:text-white font-bold px-1">×</button>
                           </span>
                         ))}
                       </div>
                    </div>
                  )}
                </div>
               )}
            </div>
            )}

            <div>
                <label className="block text-gray-400 text-sm mb-1">Update Artwork (Optional)</label>
                {(file || currentArtworkUrl) && (
                    <div className="mb-2 w-24 h-24 bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
                        <img 
                            src={file ? URL.createObjectURL(file) : currentArtworkUrl} 
                            alt="Artwork Preview" 
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}
                <input 
                    type="file" 
                    onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full text-gray-400 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                />
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-800 mt-4">
                <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="text-red-500 hover:text-red-400 text-sm flex items-center gap-1 transition"
                    disabled={loading || isDeleting}
                >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete Request
                </button>

                <div className="flex gap-3">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white transition"
                        disabled={loading || isDeleting}
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        disabled={loading || isDeleting}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </form>
        
        <ConfirmModal 
            isOpen={showConfirmDelete}
            title="Delete Request?"
            message="Are you sure you want to delete this request? This will hide it from all participants and cannot be undone."
            confirmLabel="Delete Forever"
            isDestructive={true}
            onConfirm={executeDelete}
            onCancel={() => setShowConfirmDelete(false)}
        />
      </div>
    </div>,
    document.body
  );
}

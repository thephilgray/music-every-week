import { useState, useRef, useEffect } from 'react';
import Gun from 'gun/gun'; // Local Gun import for migration tools
import { db, auth } from '../../lib/firebase';
import { collection, addDoc, updateDoc, serverTimestamp, getDocs, query, where, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { Loader2, ArrowLeft } from 'lucide-react';
import { fixUrl } from '../../lib/url';
import { useNavigate } from 'react-router-dom';

const gun = Gun({
    peers: [import.meta.env.MODE === 'production' ? 'https://mew2-relay-service-c0b302f-6xaixpnemq-uw.a.run.app/gun' : 'http://localhost:8765/gun'],
    multicast: false, // Disable UDP multicast by default in browser
    ws: undefined, // Let Gun choose WebSocket polyfill
});

export function MigrateGunToFirebase() {
  const navigate = useNavigate();
  const [requestId, setRequestId] = useState('');
  const [cleanupRequestId, setCleanupRequestId] = useState('');
  const [commentMigrationRequestId, setCommentMigrationRequestId] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const handleMigrate = async () => {
    if (!requestId.trim()) return;
    setLoading(true);
    setLogs([]);
    addLog(`Starting migration for Gun Request ID: ${requestId}`);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("Not authenticated");

      // 1. Fetch Request Data
      addLog(`Attempting to fetch request data from 'file_requests/${requestId}'...`);
      const requestNode = gun.get('file_requests').get(requestId);
      const requestData: any = await new Promise((resolve) => {
        const listener = (data: any) => {
          if (data !== undefined && data !== null) {
            clearTimeout(timeoutId);
            requestNode.off();
            resolve(data);
          }
        };
        const timeoutId = setTimeout(() => {
            requestNode.off();
            resolve(undefined);
        }, 5000);
        void timeoutId; // Explicitly mark as 'read' for TS
        requestNode.once(listener);
      });
      
      addLog(`Raw GunDB data for 'file_requests/${requestId}': ${JSON.stringify(requestData, null, 2)}`);

      if (!requestData || !requestData.title) {
        addLog('Error: Request not found or empty in GunDB at `file_requests`.');
        setLoading(false);
        return;
      }

      addLog(`Found Request: ${requestData.title}`);

      // 2. Extract Emails for Access List (still using requestData.pending_emails)
      const accessList: string[] = [];
      if (requestData.pending_emails) {
          try {
             if (typeof requestData.pending_emails === 'string') {
                 const emails = JSON.parse(requestData.pending_emails);
                 if (Array.isArray(emails)) accessList.push(...emails);
             }
          } catch (e) { console.warn("Error parsing emails", e); }
      }
      
      // 3. Create Firestore Documents (Playlist and Request)
      
      // Playlist
      const playlistRef = await addDoc(collection(db, 'playlists'), {
        title: requestData.title,
        description: requestData.description || '',
        accessList: accessList,
        createdAt: new Date(requestData.createdAt || new Date()).toISOString(),
        migratedFromGunId: requestId,
        hostEmail: requestData.hostEmail || user.email,
        artworkUrl: fixUrl(requestData.artworkUrl || ''),
        playlistLiveDate: new Date(requestData.playlistLiveDate || new Date()).toISOString(),
      });
      addLog(`Created Playlist: ${playlistRef.id}`);

      // Request
      const requestRef = await addDoc(collection(db, 'requests'), {
        title: requestData.title,
        description: requestData.description || '',
        deadline: new Date(requestData.deadline || new Date()).toISOString(),
        playlistLiveDate: new Date(requestData.playlistLiveDate || new Date()).toISOString(),
        accessList: accessList,
        playlistId: playlistRef.id,
        createdAt: serverTimestamp(),
        migratedFromGunId: requestId,
        hostEmail: requestData.hostEmail || user.email, // Use auth email
        artworkUrl: fixUrl(requestData.artworkUrl || ''),
      });
      addLog(`Created Request: ${requestRef.id}`);

      // 4. Fetch Submissions
      addLog(`Scanning for submissions under 'request_submissions/${requestId}'...`);
      
      const submissionKeys: string[] = await new Promise((resolve) => {
          const keys: string[] = [];
          const timeoutId = setTimeout(() => {
              addLog(`Timeout reached for 'request_submissions/${requestId}' keys.`);
              resolve(keys);
          }, 5000); 
          void timeoutId; // Explicitly mark as 'read' for TS
          
          gun.get('request_submissions').get(requestId).map((_data: any, key: any) => {
              if (key && !keys.includes(key)) {
                  keys.push(key);
              }
          });
      });

      addLog(`Found ${submissionKeys.length} submission keys.`);

      const submissions: any[] = [];
      for (const subKey of submissionKeys) {
          addLog(`Fetching submission: 'request_submissions/${requestId}/${subKey}'...`);
          const subData: any = await new Promise((resolve) => {
              const subNode = gun.get('request_submissions').get(requestId).get(subKey);
              const listener = (data: any) => {
                  if (data !== undefined && data !== null) {
                      clearTimeout(timeoutId);
                      subNode.off();
                      resolve(data);
                  }
              };
              const timeoutId = setTimeout(() => {
                  subNode.off();
                  resolve(undefined);
              }, 3000); // 3 seconds timeout for submission
              void timeoutId; // Explicitly mark as 'read' for TS
              subNode.once(listener);
          });
          addLog(`Raw GunDB data for 'request_submissions/${requestId}/${subKey}': ${JSON.stringify(subData, null, 2)}`);
          if (subData && subData.audioUrl) {
              submissions.push({ id: subKey, ...subData });
          }
      }

      addLog(`Found ${submissions.length} valid submissions.`);

      // 5. Collect all relevant pubKeys (uploaders and commenters)
      const allPubKeys = new Set<string>();
      submissions.forEach(sub => {
          if (sub.uploaderPub) allPubKeys.add(sub.uploaderPub);
      });

      const commentsToMigrate: { subId: string; data: any; key: string }[] = [];
      addLog(`Scanning for comments for ${submissions.length} submissions...`);

      for (const sub of submissions) {
          addLog(`  - Fetching comments for submission '${sub.id}' from 'submission_comments/${sub.id}'...`);
          const allCommentsNode = gun.get('submission_comments').get(sub.id);
          const commentsRawData: any = await new Promise((resolve) => {
              const listener = (data: any) => {
                  if (data !== undefined && data !== null) {
                      clearTimeout(timeoutId);
                      allCommentsNode.off();
                      resolve(data);
                  }
              };
              const timeoutId = setTimeout(() => {
                  addLog(`  - Timeout reached for fetching ALL comments data for submission '${sub.id}'.`);
                  allCommentsNode.off();
                  resolve(undefined); // Resolve with undefined if timeout
              }, 5000); // Increased timeout for getting all data
              void timeoutId;
              allCommentsNode.once(listener);
          });

          const commentKeysForSub: string[] = [];
          if (commentsRawData) {
            for (const key in commentsRawData) {
              // Exclude GunDB internal metadata keys ('_')
              // And only consider properties that are actual objects (comments)
              if (key !== '_' && typeof commentsRawData[key] === 'object' && commentsRawData[key] !== null && commentsRawData[key].id === key) {
                commentKeysForSub.push(key);
              }
            }
          }
          
          addLog(`  - Found ${commentKeysForSub.length} comment keys for submission '${sub.id}'.`);
          for (const cKey of commentKeysForSub) {
              // Now that we have the key, the commentData is directly available from commentsRawData
              const commentData = commentsRawData[cKey];

              addLog(`    - Raw GunDB data for 'submission_comments/${sub.id}/${cKey}': ${JSON.stringify(commentData, null, 2)}`);
              if (commentData && commentData.authorPub) {
                  commentsToMigrate.push({ subId: sub.id, data: commentData, key: cKey });
                  allPubKeys.add(commentData.authorPub);
              }
          }
      }
      addLog(`Found ${commentsToMigrate.length} comments to migrate.`);
      addLog(`Total unique pubKeys (uploaders + commenters): ${allPubKeys.size}`);

      // 6. Fetch User Profiles from GunDB for all collected pubKeys
      const pubToProfileMap: Record<string, { email?: string; displayName?: string; avatarUrl?: string; bio?: string }> = {};
      addLog(`Fetching profiles for ${allPubKeys.size} unique users...`);

      for (const pubKey of Array.from(allPubKeys)) {
          addLog(`- Fetching profile for pubKey: ${pubKey.substring(0, 8)}... from 'all_users/${pubKey}'`);
          const profileData: any = await new Promise((resolve) => {
              const profileNode = gun.get('all_users').get(pubKey);
              const listener = (data: any) => {
                  if (data !== undefined && data !== null) {
                      clearTimeout(timeoutId);
                      profileNode.off();
                      resolve(data);
                  }
              };
              const timeoutId = setTimeout(() => {
                  profileNode.off();
                  resolve(undefined);
              }, 3000);
              void timeoutId; // Explicitly mark as 'read' for TS
              profileNode.once(listener);
          });

          if (profileData) {
              const profile: { email?: string; displayName?: string; avatarUrl?: string; bio?: string } = {
                  email: profileData.email || null,
                  displayName: profileData.displayName || profileData.alias || null,
                  avatarUrl: profileData.avatarUrl || null,
                  bio: profileData.bio || null,
              };
              pubToProfileMap[pubKey] = profile;
              addLog(`- Found profile for ${pubKey.substring(0, 8)}... Email: ${profile.email || 'N/A'}`);
          } else {
              addLog(`- No profile found for ${pubKey.substring(0, 8)}...`);
          }
      }

      // 7. Migrate collected User Profiles to Firestore
      addLog('Migrating user profiles to Firestore...');
      for (const pubKey in pubToProfileMap) {
          const profile = pubToProfileMap[pubKey];
          if (profile.email) {
              // Check if a profile with this email already exists in Firestore
              const q = query(collection(db, 'profiles'), where('email', '==', profile.email));
              const querySnapshot = await getDocs(q);
              if (querySnapshot.empty) {
                  await addDoc(collection(db, 'profiles'), {
                      ...profile,
                      pub: pubKey, // Store GunDB pubKey for reference
                      createdAt: serverTimestamp(),
                  });
                  addLog(`- Created Firestore profile for ${profile.email}`);
              } else {
                  addLog(`- Profile for ${profile.email} already exists in Firestore. Skipping.`);
              }
          }
      }


      // Map GunDB submission keys to Firestore submission IDs
      const gunSubKeyToFirestoreIdMap = new Map<string, string>();

      addLog('Migrating submissions...');
      for (const sub of submissions) {
          // Ensure waveform and feedbackFocus are parsed if stored as strings
          let parsedWaveform = sub.waveform;
          if (typeof sub.waveform === 'string') {
              try { parsedWaveform = JSON.parse(sub.waveform); } catch (e) { parsedWaveform = []; }
          }
          let parsedFeedbackFocus = sub.feedbackFocus;
          if (typeof sub.feedbackFocus === 'string') {
              try { parsedFeedbackFocus = JSON.parse(sub.feedbackFocus); } catch (e) { parsedFeedbackFocus = []; }
          } else if (!Array.isArray(sub.feedbackFocus)) {
              parsedFeedbackFocus = [];
          }

          const uploaderProfile = pubToProfileMap[sub.uploaderPub];

          const newSubmissionDocData = {
              requestId: requestRef.id,
              playlistId: playlistRef.id,
              uploaderEmail: uploaderProfile?.email || '',
              audioUrl: fixUrl(sub.audioUrl),
              artworkUrl: fixUrl(sub.artworkUrl || ''),
              title: sub.title || 'Untitled',
              byline: sub.byline || (uploaderProfile?.displayName || (uploaderProfile?.email ? uploaderProfile.email.split('@')[0] : 'Anonymous')),
              lyrics: sub.lyrics || '',
              stage: sub.stage || '',
              usesAI: !!sub.usesAI,
              fragile: !!sub.fragile,
              feedbackFocus: parsedFeedbackFocus,
              createdAt: new Date(sub.createdAt || new Date()).toISOString(),
              migratedFromGunId: sub.id, // This is the GunDB subKey
              originalUploaderPub: sub.uploaderPub || null,
              waveform: parsedWaveform,
              linkProfile: !!sub.linkProfile
          };

          const submissionRef = await addDoc(collection(db, 'submissions'), newSubmissionDocData);
          gunSubKeyToFirestoreIdMap.set(sub.id, submissionRef.id); // Store the mapping!
      }

      // 8. Migrate Comments
      addLog('Migrating comments to Firestore...');
      for (const comment of commentsToMigrate) {
          const commenterProfile = pubToProfileMap[comment.data.authorPub];
          const firestoreSubmissionId = gunSubKeyToFirestoreIdMap.get(comment.subId); // Get Firestore ID

          if (!firestoreSubmissionId) {
              addLog(`Warning: No matching Firestore submission found for GunDB submission ID ${comment.subId}. Skipping comment ${comment.key}.`);
              continue; // Skip this comment if its submission wasn't migrated
          }

          addLog(`  - GunDB comment createdAt for ${comment.key}: ${comment.data.createdAt}`); // NEW LOG

          await addDoc(collection(db, 'comments'), {
              requestId: requestRef.id,
              submissionId: firestoreSubmissionId, // Use the mapped Firestore ID!
              playlistId: playlistRef.id, // ADDED
              authorEmail: commenterProfile?.email || 'migrated_commenter@example.com',
              text: comment.data.text || '', // ADDED: Migrate comment text
              createdAt: new Date(comment.data.createdAt || new Date()) || serverTimestamp(), // Use original, or serverTimestamp as fallback
              migratedFromGunId: comment.key,
              userProfile: {
                  displayName: commenterProfile?.displayName || (commenterProfile?.email ? commenterProfile.email.split('@')[0] : 'Anonymous'),
                  avatarUrl: commenterProfile?.avatarUrl || null,
              }
          });
          addLog(`- Migrated comment ${comment.key} for submission ${comment.subId} to Firestore Submission ${firestoreSubmissionId}`);
      }


      addLog('Migration Complete!');
      addLog(`Request Link: ${window.location.origin}/s/${requestRef.id}`);
      addLog(`Playlist Link: ${window.location.origin}/p/${playlistRef.id}`);

    } catch (err: any) {
      console.error(err);
      addLog(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateComments = async () => {
    if (!commentMigrationRequestId.trim()) return;
    setLoading(true);
    setLogs([]);
    addLog(`Starting Partial Comment Migration for Gun Request ID: ${commentMigrationRequestId}`);

    try {
        // 1. Find the corresponding Firestore Request
        addLog(`Searching for Firestore Request for Gun ID ${commentMigrationRequestId}...`);
        const qReq = query(collection(db, 'requests'), where('migratedFromGunId', '==', commentMigrationRequestId));
        const reqSnapshot = await getDocs(qReq);

        if (reqSnapshot.empty) {
            throw new Error(`No Firestore Request found for Gun ID ${commentMigrationRequestId}. Please run full migration first.`);
        }

        const firestoreRequest = reqSnapshot.docs[0];
        const firestoreRequestId = firestoreRequest.id;
        const firestorePlaylistId = firestoreRequest.data().playlistId;
        addLog(`Found Firestore Request: ${firestoreRequestId} (Playlist: ${firestorePlaylistId})`);

        // 2. Scan GunDB Submissions
        addLog(`Scanning GunDB submissions for '${commentMigrationRequestId}'...`);
        const submissionKeys: string[] = await new Promise((resolve) => {
            const keys: string[] = [];
            const timeoutId = setTimeout(() => {
                resolve(keys);
            }, 5000);
            void timeoutId;
            gun.get('request_submissions').get(commentMigrationRequestId).map((_data: any, key: any) => {
                if (key && !keys.includes(key)) keys.push(key);
            });
        });
        addLog(`Found ${submissionKeys.length} submission keys in GunDB.`);

        // 3. Process each submission
        for (const gunSubKey of submissionKeys) {
            // Find Firestore Submission
            const qSub = query(collection(db, 'submissions'), where('migratedFromGunId', '==', gunSubKey));
            const subSnapshot = await getDocs(qSub);

            if (subSnapshot.empty) {
                addLog(`Skipping Gun Submission ${gunSubKey} (No Firestore match).`);
                continue;
            }

            const firestoreSubmission = subSnapshot.docs[0];
            const firestoreSubmissionId = firestoreSubmission.id;
            addLog(`Processing Submission: ${gunSubKey} -> ${firestoreSubmissionId}`);

            // Fetch Gun Comments
            const allCommentsNode = gun.get('submission_comments').get(gunSubKey);
            const commentsRawData: any = await new Promise((resolve) => {
                const listener = (data: any) => {
                    if (data !== undefined && data !== null) {
                        clearTimeout(timeoutId);
                        allCommentsNode.off();
                        resolve(data);
                    }
                };
                const timeoutId = setTimeout(() => {
                    allCommentsNode.off();
                    resolve(undefined);
                }, 3000);
                void timeoutId;
                allCommentsNode.once(listener);
            });

            if (!commentsRawData) continue;

            const gunCommentKeys = Object.keys(commentsRawData).filter(k => 
                k !== '_' && typeof commentsRawData[k] === 'object' && commentsRawData[k] !== null && commentsRawData[k].id === k
            );
            
            addLog(`  Found ${gunCommentKeys.length} comments in GunDB.`);

            for (const gunCommentKey of gunCommentKeys) {
                // Check if already in Firestore
                const qComment = query(collection(db, 'comments'), where('migratedFromGunId', '==', gunCommentKey));
                const commentSnapshot = await getDocs(qComment);

                if (!commentSnapshot.empty) {
                    addLog(`  - Comment ${gunCommentKey} already exists. Skipping.`);
                    continue;
                }

                // Need to migrate!
                const commentData = commentsRawData[gunCommentKey];
                addLog(`  - Migrating NEW Comment ${gunCommentKey}...`);

                // Fetch Author Profile
                const authorPub = commentData.authorPub;
                let commenterProfile: any = { email: null, displayName: 'Unknown', avatarUrl: null };

                if (authorPub) {
                     // Check Firestore Profile first (faster/cleaner if already migrated)
                     // const qProfile = query(collection(db, 'profiles'), where('pub', '==', authorPub)); // Assuming 'pub' was saved
                     // Actually, earlier migration saved 'pub' in profile.
                     // But let's check Gun just in case profile wasn't migrated or linked correctly.
                     // Or just fetch from Gun quickly.
                     
                     const profileData: any = await new Promise((resolve) => {
                         gun.get('all_users').get(authorPub).once((d: any) => resolve(d));
                     });
                     
                     if (profileData) {
                         commenterProfile = {
                             email: profileData.email,
                             displayName: profileData.displayName || profileData.alias || (profileData.email ? profileData.email.split('@')[0] : 'Anonymous'),
                             avatarUrl: profileData.avatarUrl
                         };
                     }
                }

                await addDoc(collection(db, 'comments'), {
                    requestId: firestoreRequestId,
                    submissionId: firestoreSubmissionId,
                    playlistId: firestorePlaylistId,
                    authorEmail: commenterProfile.email || 'migrated_commenter@example.com',
                    text: commentData.text || '',
                    createdAt: new Date(commentData.createdAt || new Date()) || serverTimestamp(),
                    migratedFromGunId: gunCommentKey,
                    userProfile: {
                        displayName: commenterProfile.displayName,
                        avatarUrl: commenterProfile.avatarUrl || null,
                    }
                });
                addLog(`  -> Success.`);
            }
        }
        addLog("Partial Comment Migration Complete.");

    } catch (err: any) {
        console.error(err);
        addLog(`Error: ${err.message}`);
    } finally {
        setLoading(false);
    }
  };


  const handleCleanup = async () => {
    if (!cleanupRequestId.trim()) return;
    if (!window.confirm(`Are you SURE you want to delete Request ${cleanupRequestId} and ALL associated data (Playlist, Submissions, Comments)? This cannot be undone.`)) return;

    setLoading(true);
    setLogs([]);
    addLog(`Starting cleanup for Firestore Request ID: ${cleanupRequestId}`);

    try {
        const user = auth.currentUser;
        if (!user || !user.email) throw new Error("Not authenticated");

        // 1. Fetch Request to get Playlist ID
        const requestRef = doc(db, 'requests', cleanupRequestId);
        const requestSnap = await getDoc(requestRef);

        if (!requestSnap.exists()) {
            throw new Error(`Request ${cleanupRequestId} not found.`);
        }

        const requestData = requestSnap.data();
        const playlistId = requestData.playlistId;

        // 2. Fetch all Submissions
        addLog(`Fetching submissions for Request ${cleanupRequestId}...`);
        const qSub = query(collection(db, 'submissions'), where('requestId', '==', cleanupRequestId));
        const subSnapshot = await getDocs(qSub);
        const submissionIds: string[] = [];
        subSnapshot.forEach(doc => submissionIds.push(doc.id));
        addLog(`Found ${submissionIds.length} submissions.`);

        // 3. Delete Comments (linked to submission OR requestId)
        // First, by Submission ID
        let deletedComments = 0;
        for (const subId of submissionIds) {
            const qCom = query(collection(db, 'comments'), where('submissionId', '==', subId));
            const comSnapshot = await getDocs(qCom);
            for (const d of comSnapshot.docs) {
                await deleteDoc(d.ref);
                deletedComments++;
            }
        }
        // Then, by Request ID directly (orphan check)
        const qComReq = query(collection(db, 'comments'), where('requestId', '==', cleanupRequestId));
        const comReqSnapshot = await getDocs(qComReq);
        for (const d of comReqSnapshot.docs) {
             // Only delete if exists (it might have been deleted above if it had both fields)
             // Firestore deleteDoc is safe to call on non-existent doc? No, but we can try/catch or just let it be.
             // Actually, if we just iterate and delete, it's fine.
             // But wait, if we already deleted it, getting a reference to it again is fine, but deleting again?
             // Since we fetched `comReqSnapshot` *before* deleting anything? No, we are fetching now.
             // But we deleted `comSnapshot` docs already.
             // So let's just do it.
             try {
                await deleteDoc(d.ref);
                deletedComments++; // Count might be inflated if duplicates, but okay for logs.
             } catch (e) { /* ignore already deleted */ }
        }
        addLog(`Deleted approx ${deletedComments} comments.`);

        // 4. Delete Submissions
        addLog(`Deleting ${submissionIds.length} submissions...`);
        for (const subDoc of subSnapshot.docs) {
            await deleteDoc(subDoc.ref);
        }

        // 5. Delete Playlist
        if (playlistId) {
            addLog(`Deleting Playlist ${playlistId}...`);
            await deleteDoc(doc(db, 'playlists', playlistId));
        }

        // 6. Delete Request
        addLog(`Deleting Request ${cleanupRequestId}...`);
        await deleteDoc(requestRef);

        addLog("Cleanup Complete!");

    } catch (err: any) {
        console.error(err);
        addLog(`Error: ${err.message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleMigrateProfiles = async () => {
      setLoading(true);
      setLogs([]);
      addLog("Starting Bulk Profile Migration from GunDB 'all_users'...");

      try {
          const gunUsers: any[] = [];
          
          await new Promise<void>((resolve) => {
              let count = 0;
              setTimeout(() => {
                  addLog("Scanning finished (timeout).");
                  resolve();
              }, 10000); // 10s scan

              gun.get('all_users').map().once((data: any, key: string) => {
                  if (data && data.email) {
                      gunUsers.push({ ...data, pub: key });
                      count++;
                      if (count % 10 === 0) addLog(`Scanned ${count} users...`);
                  }
              });
          });

          addLog(`Found ${gunUsers.length} users in GunDB with emails.`);

          for (const gUser of gunUsers) {
              const email = gUser.email;
              addLog(`Processing user: ${email} (${gUser.alias || 'No Alias'})`);

              // Parse Links
              let links = gUser.links;
              if (typeof links === 'string') {
                  try { links = JSON.parse(links); } catch (e) { links = []; }
              }

              // Prepare Data
              const profileData = {
                  alias: gUser.alias || '',
                  displayName: gUser.displayName || gUser.alias || '',
                  bio: gUser.bio || '',
                  location: gUser.location || '',
                  avatarUrl: fixUrl(gUser.avatarUrl || ''),
                  links: Array.isArray(links) ? links : [],
                  migratedFromGunPub: gUser.pub,
                  updatedAt: serverTimestamp()
              };

              // Check Firestore
              const q = query(collection(db, 'profiles'), where('email', '==', email));
              const querySnapshot = await getDocs(q);

              if (!querySnapshot.empty) {
                  // Update existing
                  const docRef = querySnapshot.docs[0].ref;
                  await updateDoc(docRef, profileData); // Merge update
                  addLog(`  -> Updated existing profile for ${email}`);
              } else {
                  // Create new (Optional: might skip creating if we only want to update existing auth users)
                  // But user asked to "migrate the rest", so creation is safer to ensure data isn't lost.
                  await addDoc(collection(db, 'profiles'), {
                      email: email,
                      ...profileData,
                      createdAt: serverTimestamp(),
                      isAdmin: !!gUser.isAdmin
                  });
                  addLog(`  -> Created NEW profile for ${email}`);
              }
          }
          addLog("Profile Migration Complete.");

      } catch (err: any) {
          console.error(err);
          addLog(`Error: ${err.message}`);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
  }, [logs]);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto bg-gray-900 p-8 rounded-lg border border-gray-800">
        <button 
            type="button"
            onClick={() => navigate('/host/dashboard')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
        >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <h1 className="text-2xl font-bold mb-6">Migrate Gun Data</h1>
        
        <div className="mb-8 border-b border-gray-800 pb-8">
            <h2 className="text-lg font-bold mb-4 text-blue-400">1. Migrate Single Request</h2>
            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Gun Request ID (Node ID)</label>
                <input 
                    type="text" 
                    value={requestId}
                    onChange={(e) => setRequestId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                    placeholder="e.g. request_uuid_..."
                />
            </div>
            <button
                onClick={handleMigrate}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full flex justify-center items-center gap-2"
            >
                {loading ? <Loader2 className="animate-spin" /> : 'Migrate Request'}
            </button>
        </div>

        <div className="mb-8 border-b border-gray-800 pb-8">
            <h2 className="text-lg font-bold mb-4 text-green-400">2. Migrate All User Profiles</h2>
            <p className="text-sm text-gray-400 mb-4">
                Scans all GunDB users and updates/creates Firestore profiles based on email matches. 
                Fixes missing aliases/bios for migrated users.
            </p>
            <button
                onClick={handleMigrateProfiles}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded w-full flex justify-center items-center gap-2"
            >
                {loading ? <Loader2 className="animate-spin" /> : 'Migrate All Profiles'}
            </button>
        </div>

        <div>
            <h2 className="text-lg font-bold mb-4 text-red-400">3. Clean Up Duplicate Request</h2>
            <p className="text-sm text-gray-400 mb-4">
                Enter a <strong>Firestore Request ID</strong> (UUID) to delete it and ALL associated data (Playlist, Submissions, Comments). 
                Use this to remove duplicate migrations.
            </p>
            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Firestore Request ID</label>
                <input 
                    type="text" 
                    value={cleanupRequestId}
                    onChange={(e) => setCleanupRequestId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                    placeholder="e.g. 7f8a9d..."
                />
            </div>
            <button
                onClick={handleCleanup}
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded w-full flex justify-center items-center gap-2"
            >
                {loading ? <Loader2 className="animate-spin" /> : 'Delete Request & Data'}
            </button>
        </div>

        <div>
            <h2 className="text-lg font-bold mb-4 text-purple-400">4. Migrate Latest Comments</h2>
            <p className="text-sm text-gray-400 mb-4">
                Migrate ONLY new comments for an already migrated request. 
                Enter the <strong>GunDB Request ID</strong>.
            </p>
            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Gun Request ID (Node ID)</label>
                <input 
                    type="text" 
                    value={commentMigrationRequestId}
                    onChange={(e) => setCommentMigrationRequestId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                    placeholder="e.g. request_uuid_..."
                />
            </div>
            <button
                onClick={handleMigrateComments}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded w-full flex justify-center items-center gap-2"
            >
                {loading ? <Loader2 className="animate-spin" /> : 'Migrate Comments'}
            </button>
        </div>

        <div ref={logContainerRef} className="mt-8 bg-black p-4 rounded font-mono text-xs text-green-400 h-64 overflow-y-auto border border-gray-800">
            {logs.map((log, i) => (
                <div key={i}>{log}</div>
            ))}
            {logs.length === 0 && <span className="text-gray-600">Logs will appear here...</span>}
        </div>
      </div>
    </div>
  );
}
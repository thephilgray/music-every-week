import { useState, useRef, useEffect } from 'react';
import { useGun } from '../../contexts/GunContext';
import { db, auth } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { Loader2, ArrowLeft } from 'lucide-react';
import { fixUrl } from '../../lib/url';
import { useNavigate } from 'react-router-dom';

export function MigrateGunToFirebase() {
  const { gun } = useGun();
  const navigate = useNavigate();
  const [requestId, setRequestId] = useState('');
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
          
          gun.get('request_submissions').get(requestId).map((_data, key) => {
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

        <h1 className="text-2xl font-bold mb-6">Migrate Gun Request</h1>
        
        <div className="mb-6">
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
            {loading && <Loader2 className="animate-spin" />}
            {loading ? 'Migrating...' : 'Start Migration'}
        </button>

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
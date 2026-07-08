import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { uploadToR2 } from '../lib/r2';
import type { Notification, UserProfile } from '../types'; // Keep UserProfile import
import { db } from '../lib/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

interface BugReportModalProps {
  onClose: () => void;
}

export function BugReportModal({ onClose }: BugReportModalProps) {
  const { user } = useAuth(); // Removed userProfile from destructuring
  const { success, error } = useToast();
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [createGithubIssue, setCreateGithubIssue] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null); // State for fetched UserProfile

  // Fetch UserProfile when user changes
  useEffect(() => {
    if (user && user.uid) {
      const fetchProfile = async () => {
        try {
          const profileDoc = await getDoc(doc(db, 'profiles', user.uid));
          if (profileDoc.exists()) {
            setUserProfile(profileDoc.data() as UserProfile);
          } else {
            setUserProfile(null);
          }
        } catch (e) {
          console.error("Error fetching user profile:", e);
          setUserProfile(null);
        }
      };
      fetchProfile();
    } else {
      setUserProfile(null);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    setIsSending(true);

    try {
      // 1. Upload Screenshot if present
      let screenshotUrl = '';
      if (screenshot) {
          if (user && user.uid) { // Check user authentication for upload
              const res = await uploadToR2(screenshot); // Use uploadToR2
              screenshotUrl = res.url;
          } else {
              error("Authentication required to upload screenshot.");
              setIsSending(false);
              return;
          }
      }

      // 2. Find Admins in Firestore
      const adminUids: string[] = [];
      try {
          const q = query(collection(db, 'profiles'), where('isAdmin', '==', true));
          const querySnapshot = await getDocs(q);
          querySnapshot.forEach((docSnap) => {
              adminUids.push(docSnap.id); // doc.id is the UID
          });
      } catch (e) {
          console.error("Error fetching admins:", e);
          error("Failed to find administrators.");
          setIsSending(false);
          return;
      }

      if (adminUids.length === 0) {
          error("No admins found to receive report.");
          setIsSending(false);
          return;
      }

      // 3. Prepare Report with Diagnostics
      const reportId = crypto.randomUUID();
      const diagnostics = [
          `User Agent: ${navigator.userAgent}`,
          `URL: ${window.location.href}`,
          `Screen: ${window.innerWidth}x${window.innerHeight}`,
          `Time: ${new Date().toISOString()}`,
          `User: ${user?.uid || 'Guest'} (${userProfile?.alias || 'Unknown'})`
      ].join('\n');

      let reportContent = `BUG REPORT:\n\n${description}\n\n-- DIAGNOSTICS --\n${diagnostics}`;
      
      if (screenshotUrl) {
          reportContent += `\n\n-- SCREENSHOT --\n${screenshotUrl}`;
      }

      const notification: Notification = {
          id: reportId,
          type: 'bug', // Can be bugReport type if added
          message: `BUG REPORT: ${description.substring(0, 50)}...`,
          link: screenshotUrl || `/inbox`,
          fromUid: user?.uid || 'guest', // Changed fromPub to fromUid
          createdAt: serverTimestamp(), // Use serverTimestamp
          read: false
      };
      
      notification.message = reportContent; // This will overwrite the message set above
      // Let's make it more explicit that message is reportContent directly
      const finalNotification: Notification = {
          ...notification,
          message: reportContent
      };


      // 4. Send to all admins in their notifications collection
      const notificationPromises: Promise<any>[] = [];
      adminUids.forEach(adminUid => {
          notificationPromises.push(
              addDoc(collection(db, 'notifications'), { // Add to a global notifications collection
                  ...finalNotification,
                  recipientUid: adminUid // Target recipient
              })
          );
      });
      await Promise.all(notificationPromises);

      if (createGithubIssue) {
          try {
              const res = await fetch('/api/bug-report', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      title: `[Bug]: ${description.substring(0, 60)}${description.length > 60 ? '...' : ''}`,
                      description,
                      diagnostics,
                      screenshotUrl,
                      reporter: `${userProfile?.alias || user?.displayName || user?.email || 'Anonymous'} (${user?.uid || 'guest'})`
                  })
              });
              const data = await res.json().catch(() => ({}));
              if (res.ok && data.success) {
                  success(`Bug report sent & GitHub Issue #${data.issueNumber} created automatically!`);
              } else if (res.status === 501 && data.fallbackUrl) {
                  // Token not configured on server, fall back to opening browser tab
                  window.open(data.fallbackUrl, '_blank');
                  success("Bug report logged! Opened GitHub tab to submit issue.");
              } else {
                  console.warn("Could not create server GH issue:", data.error);
                  const repoUrl = import.meta.env.VITE_GITHUB_REPO_URL;
                  if (repoUrl) {
                      const title = encodeURIComponent(`[Bug]: ${description.substring(0, 60)}${description.length > 60 ? '...' : ''}`);
                      const body = encodeURIComponent(`### Bug Description\n${description}\n\n### Diagnostics\n\`\`\`\n${diagnostics}\n\`\`\`\n\n${screenshotUrl ? `### Screenshot\n![Screenshot](${screenshotUrl})\n` : ''}`);
                      window.open(`${repoUrl.replace(/\/$/, '')}/issues/new?title=${title}&body=${body}`, '_blank');
                      success("Bug report logged! Opened GitHub tab to submit issue.");
                  } else {
                      error("VITE_GITHUB_REPO_URL is not configured in environment variables.");
                      success("Bug report sent to admins!");
                  }
              }
          } catch (apiErr) {
              console.warn("API bug report failed:", apiErr);
              success("Bug report sent to admins!");
          }
      } else {
          success("Bug report sent to admins. Thank you!");
      }
      onClose();

    } catch (err: any) {
      console.error("Failed to send report:", err);
      error("Failed to send report: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-red-900/50 rounded-xl w-full max-w-md shadow-2xl relative">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-gray-800 flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <h2 className="text-xl font-bold text-white">Report a Bug</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm text-gray-400">
                Please describe what happened, what you expected, and any steps to reproduce the issue.
            </p>
            
            <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-white focus:border-red-500 outline-none h-32 text-base sm:text-sm font-mono"
                placeholder="I clicked the button and..."
                required
                autoFocus
            />
            
            {/* Screenshot Upload (Only if logged in) */}
            {user && user.uid && ( // Changed user.is to user && user.uid
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-gray-400 hover:text-white text-sm bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded transition">
                        <ImageIcon className="w-4 h-4" />
                        {screenshot ? 'Change Screenshot' : 'Attach Screenshot'}
                        <input 
                            type="file" 
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={e => setScreenshot(e.target.files?.[0] || null)}
                            className="hidden"
                        />
                    </label>
                    {screenshot && (
                        <span className="text-xs text-gray-500 truncate max-w-[150px]">
                            {screenshot.name}
                        </span>
                    )}
                </div>
            )}

            <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white select-none">
                    <input 
                        type="checkbox" 
                        checked={createGithubIssue} 
                        onChange={e => setCreateGithubIssue(e.target.checked)}
                        className="rounded border-gray-700 bg-gray-900 text-red-600 focus:ring-red-500 w-4 h-4"
                    />
                    <span>Also create an issue on GitHub</span>
                </label>
                <p className="text-xs text-gray-500 ml-6 mt-0.5">
                    Automatically logs this bug to the project repository (no GitHub account required).
                </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
                <button 
                    type="button" 
                    onClick={onClose}
                    className="px-4 py-2 text-gray-400 hover:text-white transition"
                    disabled={isSending}
                >
                    Cancel
                </button>
                <button 
                    type="submit" 
                    disabled={isSending}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send Report
                </button>
            </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
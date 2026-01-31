import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { useToast } from '../contexts/ToastContext';
import { uploadFile } from '../lib/upload';
import type { Notification } from '../types';

interface BugReportModalProps {
  onClose: () => void;
}

export function BugReportModal({ onClose }: BugReportModalProps) {
  const { gun, pubKey, user, userProfile } = useGun();
  const { success, error } = useToast();
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    setIsSending(true);

    try {
      // 1. Upload Screenshot if present
      let screenshotUrl = '';
      if (screenshot) {
          // @ts-ignore
          if (user.is) {
              const res = await uploadFile(screenshot, (user as any).is);
              screenshotUrl = res.url;
          }
      }

      // 2. Find Admins
      const adminPubs: string[] = [];
      await new Promise<void>(resolve => {
          let count = 0;
          // Scan directory for admins (inefficient but works for small app)
          gun.get('all_users').map().once((u: any, pub: string) => {
              if (u && u.isAdmin) {
                  adminPubs.push(pub);
              }
              // Resolve after short timeout or if we found some
              count++;
          });
          setTimeout(resolve, 1000); 
      });

      if (adminPubs.length === 0) {
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
          `User: ${pubKey || 'Guest'} (${userProfile?.alias || 'Unknown'})`
      ].join('\n');

      let reportContent = `BUG REPORT:\n\n${description}\n\n-- DIAGNOSTICS --\n${diagnostics}`;
      
      if (screenshotUrl) {
          reportContent += `\n\n-- SCREENSHOT --\n${screenshotUrl}`;
      }

      const notification: Notification = {
          id: reportId,
          type: 'comment', 
          message: `BUG REPORT: ${description.substring(0, 50)}...`,
          link: screenshotUrl || `/inbox`, 
          fromPub: pubKey || 'guest',
          createdAt: Date.now(),
          read: false
      };
      
      notification.message = reportContent;

      // 4. Send to all admins
      adminPubs.forEach(adminPub => {
          gun.get('inboxes').get(adminPub).get(reportId).put(notification);
      });

      success("Bug report sent to admins. Thank you!");
      onClose();

    } catch (err) {
      console.error(err);
      error("Failed to send report.");
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
                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-white focus:border-red-500 outline-none h-32 text-sm font-mono"
                placeholder="I clicked the button and..."
                required
                autoFocus
            />
            
            {/* Screenshot Upload (Only if logged in) */}
            {/* @ts-ignore */}
            {user.is && (
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-gray-400 hover:text-white text-sm bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded transition">
                        <ImageIcon className="w-4 h-4" />
                        {screenshot ? 'Change Screenshot' : 'Attach Screenshot'}
                        <input 
                            type="file" 
                            accept="image/*"
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

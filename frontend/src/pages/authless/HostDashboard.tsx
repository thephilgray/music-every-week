import { useEffect, useState } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { Loader2, Plus, ExternalLink, Music2, Share2, Archive, Edit, Trash2, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { ExtensionModal } from './components/ExtensionModal';

interface RequestSummary {
  id: string;
  title: string;
  deadline: string;
  playlistId: string;
  createdAt: any;
}

export function HostDashboard() {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [deleteCandidate, setDeleteCandidate] = useState<RequestSummary | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false); // New state
  const [extensionRequest, setExtensionRequest] = useState<RequestSummary | null>(null); // New state

  useEffect(() => {
    async function loadRequests() {
      const user = auth.currentUser;
      if (!user || !user.email) return;

      try {
        const q = query(
          collection(db, 'requests'), 
          where('hostEmail', '==', user.email),
          orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(q);
        const loadedRequests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as RequestSummary));
        
        setRequests(loadedRequests);
      } catch (err) {
        console.error("Error loading host requests:", err);
      } finally {
        setLoading(false);
      }
    }
    loadRequests();
  }, []);

  const copyLink = (path: string) => {
      const url = `${window.location.origin}${path}`;
      navigator.clipboard.writeText(url);
      alert("Link copied!");
  };

  const handleDeleteClick = (req: RequestSummary) => {
      setDeleteCandidate(req);
      setShowConfirmDelete(true);
  };

  const confirmDelete = async () => {
      if (!deleteCandidate) return;

      setShowConfirmDelete(false);
      setLoading(true);

      try {
          // Delete Request document
          await deleteDoc(doc(db, 'requests', deleteCandidate.id));
          // Delete associated Playlist document
          await deleteDoc(doc(db, 'playlists', deleteCandidate.playlistId));

          // TODO: Optionally delete submissions and comments associated with this request/playlist
          // This would require more complex querying and batch deletes. For now, we orphan them.

          // Remove from local state
          setRequests(prev => prev.filter(r => r.id !== deleteCandidate.id));
      } catch (err) {
          console.error("Error deleting request:", err);
          alert("Failed to delete request. Please try again.");
      } finally {
          setDeleteCandidate(null);
      }
  };

  const handleExportCsv = async (requestId: string) => {
      setLoading(true);
      try {
          // Fetch request to get accessList
          const reqDoc = await getDoc(doc(db, 'requests', requestId));
          if (!reqDoc.exists()) {
              alert("Request not found for CSV export.");
              setLoading(false);
              return;
          }
          const requestData = reqDoc.data();
          const accessList: string[] = requestData.accessList || [];

          // Fetch all submissions for this request
          const qSubs = query(collection(db, 'submissions'), where('requestId', '==', requestId));
          const subsSnap = await getDocs(qSubs);
          const submittedEmails = new Set(subsSnap.docs.map(doc => doc.data().uploaderEmail));

          let csvContent = "Email,Submitted\n";
          const uniqueEmails = new Set<string>(); // To handle potential duplicates in accessList or submittedEmails

          // Add emails from accessList
          accessList.forEach(email => {
              const normalizedEmail = email.toLowerCase().trim();
              if (normalizedEmail && !uniqueEmails.has(normalizedEmail)) {
                  csvContent += `${normalizedEmail},${submittedEmails.has(normalizedEmail) ? "Yes" : "No"}\n`;
                  uniqueEmails.add(normalizedEmail);
              }
          });

          // Add submitted emails that might not be in the accessList (e.g., if accessList was changed)
          submittedEmails.forEach(email => {
              const normalizedEmail = email.toLowerCase().trim();
              if (normalizedEmail && !uniqueEmails.has(normalizedEmail)) {
                  csvContent += `${normalizedEmail},Yes\n`;
                  uniqueEmails.add(normalizedEmail);
              }
          });

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          if (link.download !== undefined) { // Feature detection
              const url = URL.createObjectURL(blob);
              link.setAttribute('href', url);
              link.setAttribute('download', `participants_${requestId}.csv`);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          } else {
              alert("Your browser does not support downloading files directly. Please copy the content manually.");
          }

      } catch (err) {
          console.error("Error exporting CSV:", err);
          alert("Failed to export CSV. Please try again.");
      } finally {
          setLoading(false);
      }
  };

  const handleGenerateExtensionClick = (req: RequestSummary) => {
      setExtensionRequest(req);
      setShowExtensionModal(true);
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <ConfirmModal 
        isOpen={showConfirmDelete}
        title={`Delete Request: "${deleteCandidate?.title}"?`}
        message="Are you sure you want to delete this request and its associated playlist? This action cannot be undone."
        confirmLabel="Delete Forever"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => setShowConfirmDelete(false)}
      />

      <ExtensionModal 
        isOpen={showExtensionModal}
        onClose={() => { setShowExtensionModal(false); setExtensionRequest(null); }}
        request={extensionRequest}
      />

      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div>
                <h1 className="text-3xl font-bold">Host Dashboard</h1>
                <p className="text-gray-400 text-sm mt-1">Manage your active requests and playlists.</p>
            </div>
            <div className="flex gap-3">
                <button 
                    onClick={() => navigate('/host/migrate')}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition border border-gray-700"
                >
                    <Archive className="w-4 h-4" /> Migrate from GunDB
                </button>
                <button 
                    onClick={() => navigate('/host/create')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
                >
                    <Plus className="w-4 h-4" /> New Request
                </button>
            </div>
        </div>

        {loading ? (
            <div className="flex justify-center py-20">
                <Loader2 className="animate-spin w-10 h-10 text-gray-500" />
            </div>
        ) : requests.length === 0 ? (
            <div className="text-center py-20 bg-gray-900/30 rounded-xl border border-gray-800 border-dashed">
                <p className="text-gray-500 mb-4">You haven't created any requests yet.</p>
                <button 
                    onClick={() => navigate('/host/create')}
                    className="text-blue-400 hover:text-blue-300 underline"
                >
                    Create your first request
                </button>
            </div>
        ) : (
            <div className="grid gap-4">
                {requests.map(req => (
                    <div key={req.id} className="bg-gray-900 border border-gray-800 rounded-lg p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-gray-700 transition group">
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
                                <a href={`/s/${req.id}`} target="_blank" rel="noopener noreferrer">{req.title}</a>
                            </h3>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span>Deadline: {new Date(req.deadline).toLocaleDateString()}</span>
                                <span>•</span>
                                <span className="font-mono text-xs opacity-50">ID: {req.id.substring(0,8)}...</span>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 w-full md:w-auto mt-4 md:mt-0">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2 w-full sm:w-auto">
                                <button 
                                    onClick={() => navigate(`/host/edit/${req.id}`)}
                                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded text-sm flex items-center justify-center gap-2 transition"
                                    title="Edit Request"
                                >
                                    <Edit className="w-4 h-4" /> Edit
                                </button>
                                <button 
                                    onClick={() => copyLink(`/s/${req.id}`)}
                                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded text-sm flex items-center justify-center gap-2 transition"
                                    title="Copy Request Link (Send to Users)"
                                >
                                    <Share2 className="w-4 h-4" /> Request Link
                                </button>
                                <button 
                                    onClick={() => copyLink(`/p/${req.playlistId}`)}
                                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded text-sm flex items-center justify-center gap-2 transition"
                                    title="Copy Playlist Link"
                                >
                                    <Music2 className="w-4 h-4" /> Playlist Link
                                </button>
                                <button
                                    onClick={() => handleExportCsv(req.id)}
                                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded text-sm flex items-center justify-center gap-2 transition"
                                    title="Export Participant CSV"
                                >
                                    <Download className="w-4 h-4" /> Export CSV
                                </button>
                                <button
                                    onClick={() => handleGenerateExtensionClick(req)}
                                    className="bg-yellow-800 hover:bg-yellow-700 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-2 transition"
                                    title="Generate Extension Link"
                                >
                                    <Plus className="w-4 h-4" /> Extension
                                </button>
                                <button 
                                    onClick={() => handleDeleteClick(req)}
                                    className="bg-red-800 hover:bg-red-700 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-2 transition"
                                    title="Delete Request"
                                >
                                    <Trash2 className="w-4 h-4" /> Delete
                                </button>
                            </div>
                            <a 
                                href={`/s/${req.id}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="p-2 text-gray-500 hover:text-white shrink-0"
                                title="Open Request Page"
                            >
                                <ExternalLink className="w-5 h-5" />
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
}


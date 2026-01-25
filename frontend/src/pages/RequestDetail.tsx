import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Upload, Play, FileAudio, Pause, MessageSquare, Edit } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { usePlayer } from '../contexts/PlayerContext';
import { SubmitTrack } from '../components/SubmitTrack';
import { CommentSection } from '../components/CommentSection';
import { Skeleton } from '../components/ui/Skeleton';
import { EditRequest } from '../components/EditRequest';
import type { FileRequest, Submission } from '../types';

export function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { gun, pubKey } = useGun();
  const { play, currentTrack, isPlaying, pause } = usePlayer();
  const [request, setRequest] = useState<FileRequest | null>(null);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    // Fetch Request Details
    gun.get('file_requests').get(id).on((data: any) => {
        if (data) {
            setRequest({
                id: id,
                ...data
            });
        }
    });

    // Fetch Submissions
    // clearing submissions first to avoid dupes on re-mount if effect runs again
    setSubmissions([]); 
    
    gun.get('file_requests').get(id).get('submissions').map().on((data: any, key: string) => {
        if (data) {
            setSubmissions(prev => {
                const safeData = { ...data, id: key }; // ensure ID is present
                const exists = prev.find(s => s.id === key);
                if (exists) {
                    return prev.map(s => s.id === key ? safeData : s);
                }
                return [...prev, safeData];
            });
        }
    });
    
  }, [id, gun]);

  if (!request) {
      return (
        <div className="max-w-5xl mx-auto pb-20">
            <div className="mb-6 pt-4">
                <Skeleton className="h-5 w-32" />
            </div>
            
            <div className="flex flex-col md:flex-row gap-8 mb-10">
                <Skeleton className="w-48 h-48 rounded-lg flex-shrink-0" />
                <div className="flex-1">
                    <div className="flex items-start justify-between mb-4">
                        <Skeleton className="h-10 w-2/3" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    
                    <Skeleton className="h-6 w-full mb-2" />
                    <Skeleton className="h-6 w-3/4 mb-4" />
                    
                    <div className="flex items-center gap-6 mb-6">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-5 w-40" />
                    </div>

                    <Skeleton className="h-10 w-40 rounded-lg" />
                </div>
            </div>
            
            <div className="border-t border-gray-800 pt-8">
                <Skeleton className="h-8 w-48 mb-4" />
                <div className="space-y-4">
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                </div>
            </div>
        </div>
      );
  }

  const isOwner = pubKey && request.ownerPub === pubKey;

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Requests
      </Link>

      {/* Header / Banner */}
      <div className="flex gap-8 mb-10">
          <div className="w-48 h-48 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 border border-gray-700">
              {request.artworkUrl ? (
                  <img src={request.artworkUrl} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600">No Art</div>
              )}
          </div>
          
          <div className="flex-1">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <h1 className="text-4xl font-bold text-white mb-2">{request.title}</h1>
                    {isOwner && (
                        <button 
                            onClick={() => setIsEditOpen(true)}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition"
                            title="Edit Request"
                        >
                            <Edit className="w-5 h-5" />
                        </button>
                    )}
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    request.visibility === 'public' 
                    ? 'bg-green-900/30 border-green-700 text-green-400' 
                    : 'bg-yellow-900/30 border-yellow-700 text-yellow-400'
                }`}>
                    {request.visibility}
                </span>
              </div>
              
              <p className="text-gray-300 text-lg mb-4">{request.description}</p>
              
              <div className="flex items-center gap-6 text-sm text-gray-400 mb-6">
                 {request.deadline && (
                     <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>Due: {new Date(request.deadline).toLocaleDateString()}</span>
                     </div>
                 )}
                 <div>ID: {id?.substring(0, 8)}...</div>
              </div>

              <button 
                onClick={() => setIsSubmitOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                  <Upload className="w-4 h-4" />
                  Submit Track
              </button>
          </div>
      </div>

      {/* Submissions List */}
      <div className="border-t border-gray-800 pt-8">
          <h3 className="text-xl font-bold text-gray-200 mb-4">Submissions ({submissions.length})</h3>
          
          {submissions.length === 0 ? (
            <div className="bg-gray-900/50 rounded-lg p-10 text-center border border-gray-800 border-dashed">
                <p className="text-gray-500">No submissions yet. Be the first!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
                {submissions.map((sub) => (
                    <div key={sub.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 transition group">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center flex-shrink-0">
                                {sub.artworkUrl ? (
                                    <img src={sub.artworkUrl} className="w-full h-full object-cover rounded" alt="Art" />
                                ) : (
                                    <FileAudio className="text-gray-600" />
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <h4 className="text-white font-medium truncate">{sub.title}</h4>
                                <p className="text-gray-500 text-sm truncate">by {sub.uploaderPub?.substring(0,8)}...</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setExpandedSubmissionId(expandedSubmissionId === sub.id ? null : (sub.id || null))}
                                    className={`p-2 rounded-full transition ${expandedSubmissionId === sub.id ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <MessageSquare className="w-4 h-4" />
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        if (currentTrack?.id === sub.id && isPlaying) {
                                            pause();
                                        } else {
                                            play(sub, submissions);
                                        }
                                    }}
                                    className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition ml-2"
                                >
                                    {currentTrack?.id === sub.id && isPlaying ? (
                                        <Pause className="w-4 h-4" />
                                    ) : (
                                        <Play className="w-4 h-4 ml-0.5" />
                                    )}
                                </button>
                            </div>
                        </div>
                        
                        {expandedSubmissionId === sub.id && id && sub.id && (
                            <CommentSection requestId={id} submissionId={sub.id} />
                        )}
                    </div>
                ))}
            </div>
          )}
      </div>

      {isSubmitOpen && id && (
          <SubmitTrack 
            requestId={id} 
            onClose={() => setIsSubmitOpen(false)}
            onSuccess={() => {
                // optional: trigger a toast or refresh logic if needed
            }}
          />
      )}
      
      {isEditOpen && request && (
          <EditRequest 
             request={request}
             onClose={() => setIsEditOpen(false)}
             onUpdate={() => {
                 // GunDB updates are live, so we might not need to manually refresh state 
                 // if the listener is robust, but we can trigger a re-fetch if needed.
             }}
          />
      )}
    </div>
  );
}

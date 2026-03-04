import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, UserCheck } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { UserProfile } from '../../types';

interface CollaboratorListProps {
  uploaderPub: string; // This can be UID or old Pub Key
  uploaderEmail?: string; // Added email fallback
  byline?: string;
  collaborators?: Record<string, boolean> | string;
  className?: string;
  linkProfile?: boolean; // Pass directly from submission
  proxyFor?: { alias: string, pub?: string, uid?: string }; // Pass directly
}

export function CollaboratorList({ 
    uploaderPub, 
    uploaderEmail,
    byline, 
    collaborators, 
    className = "text-gray-500 text-sm truncate",
    linkProfile = true, // Default to true if not provided (though submission usually has it)
    proxyFor
}: CollaboratorListProps) {
  
  const { isAdmin } = useAuth();
  const [names, setNames] = useState<Record<string, string>>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadedCollaborators, setLoadedCollaborators] = useState<string[]>([]);
  const [resolvedUid, setResolvedUid] = useState<string | undefined>(uploaderPub);

  // Parse Collaborators
  useEffect(() => {
      let rawCollabs = collaborators;
      const keys: string[] = [];

      if (rawCollabs) {
          if (typeof rawCollabs === 'string') {
              try {
                  rawCollabs = JSON.parse(rawCollabs);
              } catch (e) {
                  rawCollabs = {}; 
              }
          }

          if (rawCollabs && typeof rawCollabs === 'object') {
              Object.keys(rawCollabs).forEach(k => {
                  if (k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#')) {
                      keys.push(k);
                  }
              });
          }
      }
      setLoadedCollaborators(keys);
  }, [collaborators]);

  // Fetch Names from Firestore
  useEffect(() => {
    let isMounted = true;

    const fetchName = async (uid: string) => {
        if (!uid || names[uid]) return;
        try {
            const profileDoc = await getDoc(doc(db, 'profiles', uid));
            if (profileDoc.exists() && isMounted) {
                const data = profileDoc.data() as UserProfile;
                setNames(prev => ({ ...prev, [uid]: data.displayName || data.alias || 'Unknown' }));
            }
        } catch (e) {
            console.error("Error fetching profile name:", uid, e);
        }
    };

    // If we have a UID (uploaderPub), fetch it.
    if (uploaderPub) {
        setResolvedUid(uploaderPub);
        fetchName(uploaderPub);
    } else if (uploaderEmail) {
        // If no UID but Email, try to find profile
        const resolveEmail = async () => {
            try {
                const q = query(collection(db, 'profiles'), where('email', '==', uploaderEmail));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty && isMounted) {
                    const docSnap = querySnapshot.docs[0];
                    const data = docSnap.data() as UserProfile;
                    const uid = docSnap.id;
                    setResolvedUid(uid);
                    setNames(prev => ({ ...prev, [uid]: data.displayName || data.alias || 'Unknown' }));
                } else if (isMounted) {
                    // No profile found, fallback to email username
                    setNames(prev => ({ ...prev, 'email_fallback': uploaderEmail.split('@')[0] }));
                }
            } catch (e) {
                // Ignore
            }
        };
        resolveEmail();
    }

    loadedCollaborators.forEach(uid => fetchName(uid));

    return () => { isMounted = false; };
  }, [uploaderPub, uploaderEmail, loadedCollaborators, names]);

  
  // Render Uploader Name (Link or Text based on linkProfile)
  const renderUploader = () => {
      // Determine display name
      const uidToUse = resolvedUid || uploaderPub;
      const name = names[uidToUse] || names['email_fallback'] || (uidToUse ? uidToUse.substring(0, 8) : (uploaderEmail ? uploaderEmail.split('@')[0] : 'Unknown'));
      
      const displayName = proxyFor?.alias || byline || name;

      const content = (
          <span className="flex items-center gap-1">
              {displayName}
              {proxyFor && isAdmin && (
                  <UserCheck className="w-3 h-3 text-purple-400" title="Admin Proxy Submission" />
              )}
          </span>
      );

      if (linkProfile && uidToUse) {
          return (
              <Link to={`/profile/${uidToUse}`} className="hover:text-white hover:underline relative z-10" onClick={e => e.stopPropagation()}>
                  {content}
              </Link>
          );
      } else {
          return <span className="text-gray-400 relative z-10">{content}</span>;
      }
  };

  const hasCollaborators = loadedCollaborators.length > 0;

  // Case 1: No collaborators.
  if (!hasCollaborators) {
      return (
          <div className={className}>
              {renderUploader()} 
          </div>
      );
  }

  // Case 2: Collaborators exist.
  if (byline && !isExpanded) {
      if (linkProfile) {
        return (
            <div className={className}>
                <button 
                    onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
                    className="hover:text-white hover:underline relative z-10 font-medium flex items-center gap-1 inline-flex"
                    title="Click to see connected profiles"
                >
                    <span className="flex items-center gap-1">
                        {byline}
                        {proxyFor && isAdmin && (
                            <UserCheck className="w-3 h-3 text-purple-400" title="Admin Proxy Submission" />
                        )}
                    </span>
                    <ChevronDown className="w-3 h-3 text-blue-400 opacity-70" />
                </button>
            </div>
        );
      } else {
          return (
              <div className={className}>
                  <span className="text-gray-400 flex items-center gap-1">
                      {byline}
                      {proxyFor && isAdmin && (
                          <UserCheck className="w-3 h-3 text-purple-400" title="Admin Proxy Submission" />
                      )}
                  </span>
              </div>
          );
      }
  }

  // Case 3: Expanded OR No Byline -> Show Full List
  const uidToUse = resolvedUid || uploaderPub;
  const uploaderName = names[uidToUse] || names['email_fallback'] || (uidToUse ? uidToUse.substring(0, 8) : (uploaderEmail ? uploaderEmail.split('@')[0] : 'Unknown'));

  return (
      <div className={className}>
          <span className="flex items-center gap-1 flex-wrap">
              {linkProfile && uidToUse ? (
                  <Link to={`/profile/${uidToUse}`} className="hover:text-white hover:underline ml-1 relative z-10" onClick={e => e.stopPropagation()}>
                      <span className="flex items-center gap-1">
                        {uploaderName}
                        {proxyFor && isAdmin && (
                            <UserCheck className="w-3 h-3 text-purple-400" title="Admin Proxy Submission" />
                        )}
                      </span>
                  </Link>
              ) : (
                  <span className="text-gray-400 ml-1 flex items-center gap-1">
                    {uploaderName}
                    {proxyFor && isAdmin && (
                        <UserCheck className="w-3 h-3 text-purple-400" title="Admin Proxy Submission" />
                    )}
                  </span>
              )}
              
              {loadedCollaborators.map((pub) => (
                  <span key={pub}>{'| '}
                      {linkProfile ? (
                          <Link to={`/profile/${pub}`} className="hover:text-white hover:underline relative z-10" onClick={e => e.stopPropagation()}>
                              {names[pub] || pub.substring(0, 8)}
                          </Link>
                      ) : (
                          <span className="text-gray-400">{names[pub] || pub.substring(0, 8)}</span>
                      )}
                  </span>
              ))}
              
              {/* Collapse Button if Byline exists */}
              {byline && linkProfile && (
                  <button 
                      onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
                      className="ml-2 text-blue-400 hover:text-white relative z-10"
                      title="Collapse to Artist Name"
                  >
                      <ChevronUp className="w-3 h-3" />
                  </button>
              )}
          </span>
      </div>
  );
}
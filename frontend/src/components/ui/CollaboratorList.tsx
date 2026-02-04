import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGun } from '../../contexts/GunContext';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollaboratorListProps {
  uploaderPub: string;
  submissionId?: string;
  byline?: string;
  collaborators?: Record<string, boolean> | string; // Updated type definition to include string
  className?: string;
}

export function CollaboratorList({ uploaderPub, submissionId, byline, collaborators, className = "text-gray-500 text-sm truncate" }: CollaboratorListProps) {
  const { gun } = useGun();
  const [names, setNames] = useState<Record<string, string>>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadedCollaborators, setLoadedCollaborators] = useState<Record<string, boolean>>({});

  useEffect(() => {
      let found = false;
      let rawCollabs = collaborators;

      // 1. Try Direct Prop Parsing
      if (rawCollabs) {
          if (typeof rawCollabs === 'string') {
              try {
                  rawCollabs = JSON.parse(rawCollabs);
              } catch (e) {
                  // If parse fails, it might be a weird string or empty, treat as empty object or ignore
                  rawCollabs = {}; 
              }
          }

          if (rawCollabs && typeof rawCollabs === 'object') {
              const keys = Object.keys(rawCollabs).filter(k => k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#'));
              if (keys.length > 0) {
                  // @ts-ignore - we know it's an object now
                  setLoadedCollaborators(rawCollabs);
                  found = true;
              }
          }
      }

      // 2. If not found in prop, try Reference or Source of Truth
      if (!found) {
          // If we have submissionId, fetch from source (User Graph)
          if (submissionId && uploaderPub && gun) {
              gun.user(uploaderPub).get('submissions').get(submissionId).get('collaborators').once((data: any) => {
                  let cleanData = data;
                  
                  // Handle JSON string format (New Architecture)
                  if (typeof data === 'string') {
                      try {
                          cleanData = JSON.parse(data);
                      } catch (e) {
                          cleanData = null;
                      }
                  }

                  if (cleanData && typeof cleanData === 'object') {
                      const clean: Record<string, boolean> = {};
                      Object.keys(cleanData).forEach(k => {
                          if (k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#')) {
                              clean[k] = cleanData[k];
                          }
                      });
                      setLoadedCollaborators(clean);
                  }
              });
          } 
          // Fallback: Check for Soul in prop (Public Graph ref) - Legacy support
          else if (collaborators && typeof collaborators === 'object' && !Array.isArray(collaborators)) {
              // @ts-ignore
              const soul = collaborators['#'];
              if (typeof soul === 'string' && soul) { 
                  gun.get(soul).once((data: any) => {
                      if (data) {
                          const clean: Record<string, boolean> = {};
                          Object.keys(data).forEach(k => {
                              if (k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#')) {
                                  clean[k] = data[k];
                              }
                          });
                          setLoadedCollaborators(clean);
                      }
                  });
              }
          }
      }
  }, [collaborators, gun, submissionId, uploaderPub]);

  useEffect(() => {
    // 1. Fetch Uploader Name
    if (!names[uploaderPub]) {
        gun.get('all_users').get(uploaderPub).once((u: any) => {
            if (u && (u.alias || u.displayName)) {
                setNames(prev => ({ ...prev, [uploaderPub]: u.displayName || u.alias }));
            }
        });
    }

    // 2. Fetch Collaborators (from loaded map)
    const keys = Object.keys(loadedCollaborators).filter(k => k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#'));
    
    keys.forEach(pub => {
        if (!names[pub]) {
            gun.get('all_users').get(pub).once((u: any) => {
                if (u && (u.alias || u.displayName)) {
                    setNames(prev => ({ ...prev, [pub]: u.displayName || u.alias }));
                }
            });
        }
    });
  }, [uploaderPub, loadedCollaborators, gun]); // Dep: loadedCollaborators

  const collabPubs = Object.keys(loadedCollaborators).filter(k => k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#'));
  
  const hasCollaborators = collabPubs.length > 0;
  
  // Case 1: No collaborators. Just show uploader or byline link to uploader.
  if (!hasCollaborators) {
      return (
          <div className={className}>
              by <Link to={`/profile/${uploaderPub}`} className="hover:text-white hover:underline relative z-10" onClick={e => e.stopPropagation()}>
                  {byline || names[uploaderPub] || uploaderPub.substring(0, 8)}
              </Link>
          </div>
      );
  }

  // Case 2: Collaborators exist.
  // If Byline exists and NOT expanded -> Show Byline (clickable).
  if (byline && !isExpanded) {
      return (
          <div className={className}>
              by <button 
                  onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
                  className="hover:text-white hover:underline relative z-10 font-medium flex items-center gap-1 inline-flex"
                  title="Click to see connected profiles"
              >
                  {byline}
                  <ChevronDown className="w-3 h-3 text-blue-400 opacity-70" />
              </button>
          </div>
      );
  }

  // Case 3: Expanded OR No Byline -> Show Full List
  return (
      <div className={className}>
          <span className="flex items-center gap-1 flex-wrap">
              by 
              <Link to={`/profile/${uploaderPub}`} className="hover:text-white hover:underline ml-1 relative z-10" onClick={e => e.stopPropagation()}>
                                {names[uploaderPub] || uploaderPub.substring(0, 8)}
                            </Link>{collabPubs.map((pub) => (
                                    <span key={pub}>{'| '}
                      <Link to={`/profile/${pub}`} className="hover:text-white hover:underline relative z-10" onClick={e => e.stopPropagation()}>
                          {names[pub] || pub.substring(0, 8)}
                      </Link>
                  </span>
              ))}
              
              {/* Collapse Button if Byline exists */}
              {byline && (
                  <button 
                      onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
                      className="ml-2 text-blue-400 hover:text-white relative z-10"
                      title="Collapse to Byline"
                  >
                      <ChevronUp className="w-3 h-3" />
                  </button>
              )}
          </span>
      </div>
  );
}
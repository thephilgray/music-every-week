import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGun } from '../../contexts/GunContext';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import { APP_SCOPE } from '../../config/appConfig';

interface CollaboratorListProps {
  uploaderPub: string;
  submissionId?: string;
  byline?: string;
  collaborators?: Record<string, boolean>;
  className?: string;
}

export function CollaboratorList({ uploaderPub, submissionId, byline, collaborators, className = "text-gray-500 text-sm truncate" }: CollaboratorListProps) {
  const { gun, rootGun } = useGun();
  const [names, setNames] = useState<Record<string, string>>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadedCollaborators, setLoadedCollaborators] = useState<Record<string, boolean>>({});

  useEffect(() => {
      let found = false;
      // 1. Try Direct Prop
      if (collaborators) {
          const keys = Object.keys(collaborators).filter(k => k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#'));
          if (keys.length > 0) {
              setLoadedCollaborators(collaborators);
              found = true;
          }
      }

      // 2. If not found in prop, try Reference or Source of Truth
      if (!found) {
          // If we have submissionId, fetch from source (User Graph)
          if (submissionId && uploaderPub && rootGun) {
              rootGun.user(uploaderPub).get(APP_SCOPE).get('submissions').get(submissionId).get('collaborators').once((data: any) => {
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
          // Fallback: Check for Soul in prop (Public Graph ref)
          else if (collaborators) {
              // @ts-ignore
              const soul = collaborators['#'];
              if (soul) {
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
  }, [collaborators, gun, rootGun, submissionId, uploaderPub]);

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
                  <Users className="w-3 h-3 text-blue-400 opacity-70" />
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
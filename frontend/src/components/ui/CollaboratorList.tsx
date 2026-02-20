import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGun } from '../../contexts/GunContext';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollaboratorListProps {
  uploaderPub: string;
  submissionId?: string;
  byline?: string;
  collaborators?: Record<string, boolean> | string;
  className?: string;
}

export function CollaboratorList({ uploaderPub, submissionId, byline, collaborators, className = "text-gray-500 text-sm truncate" }: CollaboratorListProps) {
  const { gun } = useGun();
  const [names, setNames] = useState<Record<string, string>>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadedCollaborators, setLoadedCollaborators] = useState<Record<string, boolean>>({});
  const [isLinked, setIsLinked] = useState(true); // Default to linked
  const [proxyFor, setProxyFor] = useState<{ alias: string, pub?: string } | null>(null);

  useEffect(() => {
      let found = false;
      let rawCollabs = collaborators;

      // 1. Try Direct Prop Parsing
      if (rawCollabs) {
          if (typeof rawCollabs === 'string') {
              try {
                  rawCollabs = JSON.parse(rawCollabs);
              } catch (e) {
                  rawCollabs = {}; 
              }
          }

          if (rawCollabs && typeof rawCollabs === 'object') {
              const keys = Object.keys(rawCollabs).filter(k => k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#'));
              if (keys.length > 0) {
                  // @ts-ignore
                  setLoadedCollaborators(rawCollabs);
                  found = true;
              }
          }
      }

      // 2. If not found in prop, OR if we need to check linkProfile/proxy status, try Source
      if (submissionId && uploaderPub && gun) {
          // Fetch entire submission node to get linkProfile, proxyFor AND collaborators if needed
          gun.user(uploaderPub).get('submissions').get(submissionId).once((data: any) => {
              if (data) {
                  // Check linkProfile
                  if (data.linkProfile !== undefined) {
                      setIsLinked(data.linkProfile);
                  }
                  
                  // Check Proxy
                  if (data.proxyFor) {
                      setProxyFor(data.proxyFor);
                  }

                  // If we didn't have collaborators from props, use fetched ones
                  if (!found) {
                      let collabData = data.collaborators;
                      if (typeof collabData === 'string') {
                          try { collabData = JSON.parse(collabData); } catch (e) {}
                      }

                      if (collabData && typeof collabData === 'object') {
                          const clean: Record<string, boolean> = {};
                          Object.keys(collabData).forEach(k => {
                              if (k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#')) {
                                  clean[k] = collabData[k];
                              }
                          });
                          setLoadedCollaborators(clean);
                      }
                  }
              }
          });
      }
      else if (!found && collaborators && typeof collaborators === 'object' && !Array.isArray(collaborators)) {
          // Legacy Fallback for direct graph ref (rare now)
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
  }, [collaborators, gun, submissionId, uploaderPub]);

  useEffect(() => {
    // 1. Fetch Uploader Name
    if (uploaderPub && !names[uploaderPub]) {
        gun.get('all_users').get(uploaderPub).once((u: any) => {
            if (u && (u.alias || u.displayName)) {
                setNames(prev => ({ ...prev, [uploaderPub]: u.displayName || u.alias }));
            }
        });
    }

    // 2. Fetch Collaborators (from loaded map)
    const keys = Object.keys(loadedCollaborators).filter(k => k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#'));
    
    keys.forEach(pub => {
        if (pub && !names[pub]) {
            gun.get('all_users').get(pub).once((u: any) => {
                if (u && (u.alias || u.displayName)) {
                    setNames(prev => ({ ...prev, [pub]: u.displayName || u.alias }));
                }
            });
        }
    });
  }, [uploaderPub, loadedCollaborators, gun]);

  const collabPubs = Object.keys(loadedCollaborators).filter(k => k !== '_' && k !== '#' && !k.startsWith('_') && !k.startsWith('#'));
  const hasCollaborators = collabPubs.length > 0;
  
  // Render Uploader Name (Link or Text based on isLinked)
  const renderUploader = () => {
      if (proxyFor) {
          return (
              <span 
                className="text-white relative z-10 cursor-help border-b border-dotted border-gray-500" 
                title={`Uploaded by Admin on behalf of ${proxyFor.alias}`}
              >
                  {proxyFor.alias} <span className="text-[10px] text-gray-500 uppercase tracking-wider">(Proxy)</span>
              </span>
          );
      }

      const displayPub = uploaderPub || 'unknown';
      const name = names[displayPub] || displayPub.substring(0, 8);
      
      if (!uploaderPub) return <span className="text-gray-400">Unknown</span>;

      if (isLinked) {
          return (
              <Link to={`/profile/${uploaderPub}`} className="hover:text-white hover:underline relative z-10" onClick={e => e.stopPropagation()}>
                  {byline || name}
              </Link>
          );
      } else {
          return <span className="text-gray-400 relative z-10">{byline || name}</span>;
      }
  };

  // Case 1: No collaborators.
  if (!hasCollaborators) {
      return (
          <div className={className}>
              by {renderUploader()}
          </div>
      );
  }

  // Case 2: Collaborators exist.
  // If Byline exists and NOT expanded -> Show Byline (clickable/text).
  if (byline && !isExpanded) {
      if (isLinked) {
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
      } else {
          // If not linked but has collaborators, we probably still want to allow expanding to see them?
          // Or if anonymous, do we hide collaborators too?
          // User said "byline should not be linked to their profile (or that of any collaborators)".
          // This implies if they uncheck it, NO links.
          // So the byline should be text.
          // But can we expand? If we expand, we see collaborators.
          // If "anonymous" means "don't link ME", maybe collaborators are okay?
          // But user said "(or that of any collaborators)".
          // So effectively, it's just text. No expansion?
          // "byline should not be linked ... (or that of any collaborators)"
          // This suggests if not linked, it's just a text string.
          return (
              <div className={className}>
                  by <span className="text-gray-400">{byline}</span>
              </div>
          );
      }
  }

  // Case 3: Expanded OR No Byline -> Show Full List
  // If !isLinked, we just show names as text.
  const displayPub = uploaderPub || 'unknown';
  const uploaderName = names[displayPub] || displayPub.substring(0, 8);

  return (
      <div className={className}>
          <span className="flex items-center gap-1 flex-wrap">
              by 
              {isLinked && uploaderPub ? (
                  <Link to={`/profile/${uploaderPub}`} className="hover:text-white hover:underline ml-1 relative z-10" onClick={e => e.stopPropagation()}>
                      {uploaderName}
                  </Link>
              ) : (
                  <span className="text-gray-400 ml-1">{uploaderName}</span>
              )}
              
              {collabPubs.map((pub) => (
                  <span key={pub}>{'| '}
                      {isLinked ? (
                          <Link to={`/profile/${pub}`} className="hover:text-white hover:underline relative z-10" onClick={e => e.stopPropagation()}>
                              {names[pub] || pub.substring(0, 8)}
                          </Link>
                      ) : (
                          <span className="text-gray-400">{names[pub] || pub.substring(0, 8)}</span>
                      )}
                  </span>
              ))}
              
              {/* Collapse Button if Byline exists */}
              {byline && isLinked && (
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
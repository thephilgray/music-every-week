import { useState, useEffect, useReducer } from 'react';
import { Link } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { Skeleton } from '../components/ui/Skeleton';
import { fixUrl } from '../lib/url';
import type { UserProfile } from '../types';

type UserState = Record<string, UserProfile>;
type Action = 
  | { type: 'ADD_USER'; key: string; user: UserProfile }
  | { type: 'REMOVE_USER'; key: string };

function userReducer(state: UserState, action: Action): UserState {
  switch (action.type) {
    case 'ADD_USER':
      // Only update if changed to avoid renders? React handles object identity checks on parents, 
      // but here we return a new object. 
      return { ...state, [action.key]: action.user };
    case 'REMOVE_USER':
      if (!state[action.key]) return state;
      const newState = { ...state };
      delete newState[action.key];
      return newState;
    default:
      return state;
  }
}

export function Directory() {
  const { gun } = useGun();
  const [userState, dispatch] = useReducer(userReducer, {});
  const [migratedSet, setMigratedSet] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Listen for migrated accounts
    const migrationsMap = gun.get('migrations_reverse').map();
    migrationsMap.on((newPub: any, oldPub: string) => {
        if (newPub) {
            setMigratedSet(prev => {
                const next = new Set(prev);
                next.add(oldPub);
                return next;
            });
        }
    });

    // 2. Fetch all users
    const usersMap = gun.get('all_users').map();
    usersMap.on((data: any, key: string) => {
        if (data) {
            dispatch({ 
                type: 'ADD_USER', 
                key, 
                user: { ...data, pub: key, alias: data.alias || 'Unknown' } 
            });
            setLoading(false);
        } else {
            dispatch({ type: 'REMOVE_USER', key });
        }
    });

    // Fallback if empty or slow
    const timer = setTimeout(() => {
        // If we haven't received data by now, just stop loading spinner
        setLoading(false);
    }, 5000);

    return () => {
        clearTimeout(timer);
        migrationsMap.off();
        usersMap.off();
    };
  }, [gun]);

  const users = Object.values(userState);
  
  const filteredUsers = users.filter(u => 
      !migratedSet.has(u.pub) && 
      (u.alias.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.bio && u.bio.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  return (
      <div className="max-w-6xl mx-auto pb-20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold text-white">Community Directory</h1>
                <p className="text-gray-400 text-sm mt-1">Connect with other creators.</p>
              </div>
              
              <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                  <input 
                      type="text" 
                      placeholder="Search members..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 rounded-full py-2 pl-10 pr-4 text-white text-sm focus:border-blue-500 outline-none"
                  />
              </div>
          </div>

          {loading && users.length === 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {[...Array(8)].map((_, i) => (
                      <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 flex flex-col items-center">
                          <Skeleton className="w-20 h-20 rounded-full mb-4" />
                          <Skeleton className="h-6 w-32 mb-2" />
                          <Skeleton className="h-4 w-24" />
                      </div>
                  ))}
              </div>
          ) : filteredUsers.length === 0 ? (
              <div className="text-center py-20 text-gray-500 bg-gray-900/20 rounded-lg border border-gray-800 border-dashed">
                  <User className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No members found matching your search.</p>
              </div>
          ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {filteredUsers.map(user => (
                      <Link 
                        to={`/profile/${user.pub}`} 
                        key={user.pub} 
                        className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 flex flex-col items-center hover:bg-gray-800 hover:border-gray-700 transition group relative overflow-hidden"
                      >
                          <div className="w-20 h-20 rounded-full bg-gray-800 border-2 border-gray-700 mb-4 overflow-hidden group-hover:border-blue-500 transition shadow-lg">
                              {user.avatarUrl ? (
                                  <img src={fixUrl(user.avatarUrl)} alt={user.alias} className="w-full h-full object-cover" />
                              ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-600">
                                      <User className="w-8 h-8" />
                                  </div>
                              )}
                          </div>
                          <h3 className="text-lg font-bold text-white mb-1 text-center truncate w-full">{user.alias}</h3>
                          <p className="text-gray-500 text-xs text-center line-clamp-2 h-8 mb-4 w-full px-2">
                              {user.bio || "No bio yet."}
                          </p>
                          
                          <div className="w-full border-t border-gray-800 pt-4 flex justify-between items-center text-xs text-gray-500">
                              <span>Joined</span>
                              <span>{user.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : 'Unknown'}</span>
                          </div>
                      </Link>
                  ))}
              </div>
          )}
      </div>
  );
}
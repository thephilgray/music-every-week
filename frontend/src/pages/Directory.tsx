import { useState, useEffect, useReducer } from 'react';
import { Link } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import { fixUrl } from '../lib/url';
import type { UserProfile } from '../types';
import { db } from '../lib/firebase'; // Import Firebase db
import { collection, query, getDocs } from 'firebase/firestore'; // Import Firestore functions
import { useGlobalFeatures } from '../hooks/useGlobalFeatures';

type UserState = Record<string, UserProfile>;
type Action = 
  | { type: 'ADD_USER'; uid: string; user: UserProfile } // Changed key to uid
  | { type: 'REMOVE_USER'; uid: string }; // Changed key to uid

function userReducer(state: UserState, action: Action): UserState {
  switch (action.type) {
    case 'ADD_USER':
      return { ...state, [action.uid]: action.user }; // Changed key to uid
    case 'REMOVE_USER':
      if (!state[action.uid]) return state; // Changed key to uid
      const newState = { ...state };
      delete newState[action.uid]; // Changed key to uid
      return newState;
    default:
      return state;
  }
}

export function Directory() {
  const { features } = useGlobalFeatures();
  // const { gun } = useGun(); // Removed Gun destructuring
  const [userState, dispatch] = useReducer(userReducer, {});
  // const [migratedSet, setMigratedSet] = useState<Set<string>>(new Set()); // Removed Gun-specific migratedSet
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchUsers = async () => {
      try {
        const usersCollectionRef = collection(db, 'profiles');
        const q = query(
          usersCollectionRef
        );
        const querySnapshot = await getDocs(q);
        const fetchedUsers: Record<string, UserProfile> = {};
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data() as UserProfile;
          if (data.deleted) return; // Client-side filtering
          fetchedUsers[docSnap.id] = { ...data, uid: docSnap.id }; // Add uid from doc.id
        });

        if (isMounted) {
          // Re-populate state based on fresh fetch
          Object.values(fetchedUsers)
            .sort((a, b) => (a.alias || 'z').localeCompare(b.alias || 'z')) // Client-side sort
            .forEach(user => {
              dispatch({ type: 'ADD_USER', uid: user.uid, user });
            });
          setLoading(false);
        }
      } catch (e) {
        console.error("Error fetching directory users:", e);
        if (isMounted) setLoading(false);
      }
    };

    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, []); // Run once on mount

  const users = Object.values(userState);
  
  const filteredUsers = users.filter(u => 
      // !migratedSet.has(u.pub) && // Removed Gun-specific filter
      ((u.alias || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
       (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.bio && u.bio.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  if (!features.directory) {
    return (
      <div className="max-w-4xl mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Directory Feature Disabled</h1>
        <p className="text-gray-400">This feature is currently disabled by the community administrator.</p>
      </div>
    );
  }

  return (
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 text-center md:text-left">
              <div className="flex flex-col items-center md:items-start">
                <h1 className="text-3xl font-bold text-white flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3">
                  Community Directory
                  <span className="text-sm font-medium bg-gray-800 text-gray-400 px-3 py-1 rounded-full border border-gray-700">
                    {filteredUsers.length} members
                  </span>
                </h1>
                <p className="text-gray-400 text-sm mt-2">Connect with other creators.</p>
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
                        to={`/profile/${user.uid}`} // Changed user.pub to user.uid
                        key={user.uid} // Changed user.pub to user.uid
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
                          <h3 className="text-lg font-bold text-white mb-1 text-center truncate w-full">
                              {user.displayName || user.alias || (user.email ? user.email.split('@')[0] : 'Unknown')}
                          </h3>
                          <p className="text-gray-500 text-xs text-center line-clamp-2 h-8 mb-4 w-full px-2">
                              {user.bio || "No bio yet."}
                          </p>
                          
                          {user.joinedAt && !isNaN(new Date(user.joinedAt).getTime()) && (
                            <div className="w-full border-t border-gray-800 pt-4 flex justify-between items-center text-xs text-gray-500">
                                <span>Joined</span>
                                <span>{new Date(user.joinedAt).toLocaleDateString()}</span>
                            </div>
                          )}
                      </Link>
                  ))}
              </div>
          )}
      </div>
  );
}
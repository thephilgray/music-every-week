import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { useGun } from '../contexts/GunContext';
import { Skeleton } from '../components/ui/Skeleton';
import type { UserProfile } from '../types';

export function Directory() {
  const { gun } = useGun();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userMap = new Map<string, UserProfile>();
    let batchTimeout: ReturnType<typeof setTimeout> | null = null;

    const updateState = () => {
        setUsers(Array.from(userMap.values()));
        setLoading(false);
        batchTimeout = null;
    };
    
    // Fetch all users
    // Note: This iterates all keys in 'all_users'
    gun.get('all_users').map().on((data: any, key: string) => {
        if (data && data.alias) {
            // Ensure pub key is set from key if not in data
            userMap.set(key, { ...data, pub: key });
            
            if (!batchTimeout) {
                batchTimeout = setTimeout(updateState, 100);
            }
        }
    });

    // Fallback if empty or slow
    const timer = setTimeout(() => {
        if (userMap.size === 0) setLoading(false);
    }, 2000);

    return () => {
        if (batchTimeout) clearTimeout(batchTimeout);
        clearTimeout(timer);
    };
  }, [gun]);

  const filteredUsers = users.filter(u => 
      u.alias.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.bio && u.bio.toLowerCase().includes(searchTerm.toLowerCase()))
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
                                  <img src={user.avatarUrl} alt={user.alias} className="w-full h-full object-cover" />
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
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ContextBar } from './ContextBar';
import { Player } from './Player';
import { useGun } from '../../contexts/GunContext';
import { useToast } from '../../contexts/ToastContext';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { gun, user, pubKey, userProfile, isConnected, isInternetOnline } = useGun();
  const { success, error } = useToast();

  useEffect(() => {
      const pendingReqId = sessionStorage.getItem('pendingJoinRequest');
      if (pendingReqId && pubKey) {
          sessionStorage.removeItem('pendingJoinRequest');
          
          const partData = {
              alias: userProfile?.alias || 'Unknown',
              status: 'accepted',
              email: userProfile?.email || '',
              joinedAt: Date.now()
          };

          gun.get('request_participants').get(pendingReqId).get(pubKey).put(partData, (ack: any) => {
              if (ack.err) {
                  console.error("Auto-join failed:", ack.err);
                  error("Failed to join request automatically. Please try manually.");
              } else {
                  success("You have successfully joined the request!");
                  
                  // Local marker (Scoped)
                  user.get('participation').get(pendingReqId).put('accepted');
              }
          });
      }
  }, [pubKey, gun, user, userProfile]);

  return (
    <div className="flex h-[100dvh] bg-black overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Responsive */}
      <div className={`
        fixed inset-y-0 left-0 z-[100] w-64 bg-gray-900 transform transition-transform duration-300 ease-in-out border-r border-gray-800
        md:relative md:translate-x-0 md:border-r-0 md:z-30
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 w-full">
        <ContextBar onToggleSidebar={() => setSidebarOpen(true)} />
        
        {/* Connection Status Banner */}
        {isInternetOnline && !isConnected && (
            <div className="bg-yellow-600/20 border-b border-yellow-600/50 px-4 py-2 text-yellow-200 text-xs flex items-center justify-center gap-2 animate-pulse">
                <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                Connecting to Relay Server... (This may take a moment on cold start)
            </div>
        )}
        
        {/* Scrollable Stage */}
        <main className="flex-1 overflow-y-auto bg-black p-4 md:p-8 relative w-full">
          <Outlet />
        </main>
        
        {/* Sticky Player */}
        <Player />
      </div>
    </div>
  );
}

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ContextBar } from './ContextBar';
import { Player } from './Player';

export function AppLayout() {
  return (
    <div className="flex h-screen bg-black overflow-hidden">
      {/* Sidebar - Fixed Width */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <ContextBar />
        
        {/* Scrollable Stage */}
        <main className="flex-1 overflow-y-auto bg-black p-8 relative">
          <Outlet />
        </main>
        
        {/* Sticky Player */}
        <Player />
      </div>
    </div>
  );
}

import { useState } from 'react'; // Removed useEffect
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ContextBar } from './ContextBar';
import { Player } from './Player';
import { PointsAnimation } from '../PointsAnimation';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] bg-black overflow-hidden relative">
      <PointsAnimation />
      
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
        
        {/* Removed Connection Status Banner */}
        
        {/* Scrollable Stage */}
        <main className="flex-1 overflow-y-auto bg-black p-4 md:p-8 pb-32 relative w-full">
          <Outlet />
        </main>
        
        {/* Sticky Player */}
        <Player />
      </div>
    </div>
  );
}

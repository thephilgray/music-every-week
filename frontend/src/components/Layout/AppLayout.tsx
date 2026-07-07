import { useState } from 'react'; // Removed useEffect
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ContextBar } from './ContextBar';
import { Player } from './Player';
import { PointsAnimation } from '../PointsAnimation';
import { FloatingScrollToTop } from '../ui/FloatingScrollToTop';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('mew_sidebar_collapsed') === 'true';
  });
  const location = useLocation();

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('mew_sidebar_collapsed', String(next));
      return next;
    });
  };

  const isWatchPartyRoute = location.pathname.startsWith('/party/') && location.pathname !== '/party';

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
        fixed inset-y-0 left-0 z-[100] bg-gray-900 transform transition-all duration-300 ease-in-out border-r border-gray-800
        md:relative md:translate-x-0 md:border-r-0 md:z-30
        w-64 ${isCollapsed ? 'md:w-20' : 'md:w-64'}
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar 
          onClose={() => setSidebarOpen(false)} 
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 w-full relative transition-all duration-300">
        <ContextBar 
          onToggleSidebar={() => setSidebarOpen(true)} 
        />
        
        {/* Removed Connection Status Banner */}
        
        {/* Scrollable Stage */}
        <main className={`flex-1 overflow-x-hidden overflow-y-auto ${isWatchPartyRoute ? 'p-0' : 'p-4 md:p-8 pb-32'} bg-black relative w-full`}>
          <Outlet />
        </main>
        
        <FloatingScrollToTop />
        
        {/* Sticky Player - Hidden during Watch Party */}
        {!isWatchPartyRoute && <Player />}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useGun } from './contexts/GunContext';
import { AppLayout } from './components/Layout/AppLayout';
import { Home } from './pages/Home';
import { Inbox } from './pages/Inbox';
import { RequestDetail } from './pages/RequestDetail';
import { CreatorTools } from './pages/CreatorTools';
import { Directory } from './pages/Directory';
import { Profile } from './pages/Profile';
import { Archive } from './pages/Archive';
import { Playlists } from './pages/Playlists';
import { Settings } from './pages/Settings';
import { Community } from './pages/Community';
import { ToastProvider } from './contexts/ToastContext';
import { IdleMonitor } from './components/IdleMonitor';
import { LandingPage } from './pages/LandingPage';
import { ScrollToTop } from './components/ScrollToTop';

function App() {
  const { isLoggedIn, isAuthorized, user, isAuthLoading } = useGun();
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
      const timer = setTimeout(() => setShowReset(true), 3000);
      return () => clearTimeout(timer);
  }, []);

  if (isAuthLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-900 text-white gap-4">
        <Loader2 className="animate-spin h-12 w-12 text-blue-500" />
        {showReset && (
        <button 
            type="button"
            onClick={async () => {
                if (confirm("This will delete ALL local data (IndexedDB, LocalStorage) to fix corruption. Continue?")) {
                    localStorage.clear();
                    sessionStorage.clear();
                    const dbs = await window.indexedDB.databases();
                    for (const db of dbs) {
                        if (db.name) window.indexedDB.deleteDatabase(db.name);
                    }
                    window.location.reload();
                }
            }}
            className="text-xs text-red-500 hover:text-red-400 underline mt-4"
          >
              Troubleshoot: Hard Reset / Clear Data
          </button>
        )}
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <ToastProvider>
        <LandingPage />
      </ToastProvider>
    );
  }

  if (isAuthorized === undefined) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-900 text-white gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        {showReset && (
        <button 
            type="button"
            onClick={async () => {
                if (confirm("This will delete ALL local data (IndexedDB, LocalStorage) to fix corruption. Continue?")) {
                    localStorage.clear();
                    sessionStorage.clear();
                    const dbs = await window.indexedDB.databases();
                    for (const db of dbs) {
                        if (db.name) window.indexedDB.deleteDatabase(db.name);
                    }
                    window.location.reload();
                }
            }}
            className="text-xs text-red-500 hover:text-red-400 underline mt-4"
          >
              Troubleshoot: Hard Reset / Clear Data
          </button>
        )}
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-900 text-white">
        <h2 className="text-2xl font-bold mb-4">Access Restricted</h2>
        <p className="mb-6 text-gray-400">Your account is not authorized to access this private community.</p>
        <button 
          onClick={() => {
            user.leave();
            window.location.reload();
          }}
          className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded text-white transition"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <ScrollToTop />
        <IdleMonitor />
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/feed" element={<Community />} />
            <Route path="/request/:id" element={<RequestDetail />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/creator" element={<CreatorTools />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/playlists" element={<Playlists />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:pub" element={<Profile />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;

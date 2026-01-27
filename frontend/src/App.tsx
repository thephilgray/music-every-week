import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useGun } from './contexts/GunContext';
import { Auth } from './components/Auth';
import { AppLayout } from './components/Layout/AppLayout';
import { Home } from './pages/Home';
import { Inbox } from './pages/Inbox';
import { RequestDetail } from './pages/RequestDetail';
import { CreatorTools } from './pages/CreatorTools';
import { Directory } from './pages/Directory';
import { Profile } from './pages/Profile';
import { IdleMonitor } from './components/IdleMonitor';

function App() {
  const { isLoggedIn, isAuthorized, user } = useGun();

  if (!isLoggedIn) {
    return <Auth />;
  }

  if (isAuthorized === undefined) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-900 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
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
    <BrowserRouter>
      <IdleMonitor />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/request/:id" element={<RequestDetail />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/creator" element={<CreatorTools />} />
          <Route path="/directory" element={<Directory />} />
          <Route path="/profile" element={<Profile />} />
          {/* Temporary placeholders */}
          <Route path="/archive" element={<div className="text-white p-8">Archive Coming Soon</div>} />
          <Route path="/settings" element={<div className="text-white p-8">Settings Coming Soon</div>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
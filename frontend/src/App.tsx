import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { Gatekeeper } from './components/Gatekeeper';

function App() {
  return (
    <ToastProvider>
      <Gatekeeper>
        <BrowserRouter>
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
      </Gatekeeper>
    </ToastProvider>
  );
}

export default App;

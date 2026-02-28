import { Routes, Route, Navigate } from 'react-router-dom';
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
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';

// Auth Guard
import { AuthGuard } from './components/AuthGuard';

// Authless Pages / POC
import { HostLogin } from './pages/authless/HostLogin';
import { HostDashboard } from './pages/authless/HostDashboard';
import { HostCreate } from './pages/authless/HostCreate';
import { RequestView } from './pages/authless/RequestView';
import { PlaylistView } from './pages/authless/PlaylistView';
import { MigrateGunToFirebase } from './pages/authless/MigrateGunToFirebase';
import { AuthlessLayout } from './components/Layout/AuthlessLayout';

// Auth Provider
import { AuthProvider } from './contexts/AuthContext';
import { FinishSignIn } from './pages/FinishSignIn';


function App() {
  return (
    <ToastProvider>
        <ScrollToTop />
        <IdleMonitor />
        <AuthProvider>
          <Routes>
            {/* Public / Authless Routes */}
            <Route path="/login" element={<LandingPage />} />
            <Route path="/finish-sign-in" element={<FinishSignIn />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            
            {/* Host / Admin Routes */}
            <Route path="/host/login" element={<HostLogin />} />
            <Route path="/host/app-login" element={<HostLogin redirectTo="/" />} />
            
            <Route element={<AuthGuard require="admin" />}>
                <Route path="/host/dashboard" element={<HostDashboard />} />
                <Route path="/host/create" element={<HostCreate />} />
                <Route path="/host/edit/:id" element={<HostCreate />} />
                <Route path="/host/migrate" element={<MigrateGunToFirebase />} />
            </Route>
            
            {/* Legacy POC Routes (Self-contained Auth) */}
            <Route element={<AuthlessLayout />}>
              <Route path="/s/:id" element={<RequestView />} />
              <Route path="/p/:id" element={<PlaylistView />} />
            </Route>

            {/* Main App Routes (Protected by Participant Auth) */}
            <Route element={<AuthGuard require="participant" />}>
              <Route element={<AppLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/feed" element={<Community />} />
                  <Route path="/request/:id" element={<RequestDetail />} />
                  <Route path="/inbox" element={<Inbox />} />
                  <Route path="/creator" element={<CreatorTools />} />
                  <Route path="/directory" element={<Directory />} />
                  <Route path="/playlists" element={<Playlists />} />
                  <Route path="/playlists/:id" element={<Playlists />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/profile/:pub" element={<Profile />} />
                  <Route path="/archive" element={<Archive />} />
                  <Route path="/settings" element={<Settings />} />
                  {/* Catch all for app routes */}
                  <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
    </ToastProvider>
  );
}

export default App;
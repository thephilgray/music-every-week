import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AppLayout } from './components/Layout/AppLayout';
import { Home } from './pages/Home';
import { Inbox } from './pages/Inbox';
import { PromptDetail } from './pages/PromptDetail';
import { CreatorTools } from './pages/CreatorTools';
import { Directory } from './pages/Directory';
import { Profile } from './pages/Profile';
import { Playlists } from './pages/Playlists';
import { Settings } from './pages/Settings';
import { Community } from './pages/Community';
import { ToastProvider } from './contexts/ToastContext';
import { IdleMonitor } from './components/IdleMonitor';
import { LandingPage } from './pages/LandingPage';
import { ScrollToTop } from './components/ScrollToTop';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { WatchParty } from './pages/WatchParty';
import { PartyHub } from './pages/PartyHub';
import { LiveSessions } from './pages/LiveSessions';

// Auth Guard
import { AuthGuard } from './components/AuthGuard';

// Auth Provider
import { AuthProvider } from './contexts/AuthContext';
import { FinishSignIn } from './pages/FinishSignIn';

function LegacyPromptRedirect() {
  const { id } = useParams();
  return <Navigate to={`/prompt/${id}`} replace />;
}

function App() {
  return (
    <ToastProvider>
      <ScrollToTop />
      <IdleMonitor />
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LandingPage />} />
          <Route path="/finish-sign-in" element={<FinishSignIn />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />

          {/* Main App Routes (Protected by Participant Auth) */}
          <Route element={<AuthGuard require="participant" />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/feed" element={<Community />} />
              <Route path="/prompt/:id" element={<PromptDetail />} />
              <Route path="/request/:id" element={<LegacyPromptRedirect />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/tools" element={<CreatorTools />} />
              <Route path="/creator" element={<CreatorTools />} />
              <Route path="/directory" element={<Directory />} />
              <Route path="/playlists" element={<Playlists />} />
              <Route path="/playlists/:id" element={<Playlists />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:pub" element={<Profile />} />
              <Route path="/party" element={<PartyHub />} />
              <Route path="/party/:id" element={<WatchParty />} />
              <Route path="/live" element={<LiveSessions />} />
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
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useGun } from './contexts/GunContext';
import { Auth } from './components/Auth';
import { AppLayout } from './components/Layout/AppLayout';
import { Home } from './pages/Home';
import { Inbox } from './pages/Inbox';
import { RequestDetail } from './pages/RequestDetail';
import { CreatorTools } from './pages/CreatorTools';

function App() {
  const { isLoggedIn } = useGun();

  if (!isLoggedIn) {
    return <Auth />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/request/:id" element={<RequestDetail />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/creator" element={<CreatorTools />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
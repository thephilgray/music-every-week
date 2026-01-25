import { useState } from 'react';
import { useGun } from './contexts/GunContext';
import { Auth } from './components/Auth';
import { CreateRequest } from './components/CreateRequest';
import { RequestList } from './components/RequestList';

function App() {
  const { isLoggedIn, user, pubKey } = useGun();
  const [showCreate, setShowCreate] = useState(false);

  const handleLogout = () => {
    user.leave();
    window.location.reload(); // Simple way to clear state for now
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
         <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-bold text-blue-500 mb-2">MEW2</h1>
              <p className="text-gray-400">Decentralized Music Collaboration</p>
            </div>
            <Auth />
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="flex justify-between items-center mb-8 max-w-6xl mx-auto">
        <div>
           <h1 className="text-3xl font-bold text-blue-500">MEW2 Dashboard</h1>
           <p className="text-sm text-gray-400">Public Key: {pubKey?.substring(0, 10)}...</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowCreate(!showCreate)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm transition font-semibold"
          >
            {showCreate ? 'Cancel' : '+ New Request'}
          </button>
          <button 
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm transition"
          >
            Logout
          </button>
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto">
        {showCreate && (
           <CreateRequest />
        )}

        <RequestList />
      </main>
    </div>
  )
}

export default App

import { Outlet } from 'react-router-dom';
import { Player } from './Player';

export function AuthlessLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <div className="flex-1 pb-24 md:pb-24"> 
        {/* pb-24 ensures content isn't hidden behind the fixed player */}
        <Outlet />
      </div>
      <Player />
    </div>
  );
}

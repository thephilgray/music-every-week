import { Auth } from '../components/Auth';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center">
      {/* Header / Nav */}
      <header className="w-full max-w-5xl mx-auto p-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
           <img src="/mewlogo.png" alt="MEW" className="h-10 w-auto" />
           <span className="font-bold text-2xl tracking-tight">MEW</span>
        </div>
        {/* Auth component will show Login/Signup forms */}
      </header>

      {/* Hero Section */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-6 grid md:grid-cols-2 gap-12 items-center">
        
        {/* Left Column: Info */}
        <div className="space-y-8">
            <div>
                <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Music Every Week
                </h1>
                <p className="text-xl text-gray-300 leading-relaxed">
                    A music community and songwriting accountability group active since 2019. 
                    We’ve written over 8,685 songs, and counting.
                </p>
            </div>

            <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wider">The Rules</h3>
                <ul className="space-y-3 text-gray-400">
                    <li className="flex items-start gap-3">
                        <span className="text-blue-500 font-bold">•</span>
                        Write and record a new song every week.
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="text-blue-500 font-bold">•</span>
                        Submit to unlock everyone else's tracks.
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="text-blue-500 font-bold">•</span>
                        Optional themes, open to all genres & levels.
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="text-blue-500 font-bold">•</span>
                        Free, forever.
                    </li>
                </ul>
            </div>

            <div className="space-y-4 pt-4 border-t border-gray-800">
                <p className="text-gray-400">
                    <span className="text-white font-bold">You’re invited!</span> Join our next session.
                </p>
                <div className="flex flex-wrap gap-4">
                    <a href="http://eepurl.com/hp04-9" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">
                        Newsletter / Updates
                    </a>
                    <a href="https://www.patreon.com/c/MusicEveryWeek" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">
                        Patreon
                    </a>
                </div>
                <p className="text-xs text-gray-600">
                    Questions? Email <a href="mailto:MEWisMusicEveryWeek@gmail.com" className="hover:text-white">MEWisMusicEveryWeek@gmail.com</a>
                </p>
            </div>
        </div>

        {/* Right Column: Auth / Action */}
        <div className="flex flex-col items-center justify-center">
            <div className="w-full max-w-md">
                <Auth />
            </div>
        </div>

      </main>

      <footer className="w-full p-6 text-center text-gray-700 text-xs border-t border-gray-900 mt-12">
          &copy; {new Date().getFullYear()} Music Every Week. Powered by TrackPeer.
      </footer>
    </div>
  );
}

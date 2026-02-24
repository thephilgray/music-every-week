import { ParticipantAuth } from '../components/ParticipantAuth';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center">
      
      {/* Hero Section */}
      <main className="flex-1 w-full max-w-6xl mx-auto p-6 flex flex-col items-center justify-center space-y-12">
        
        {/* Top Row: Logo and About Section */}
        <div className="w-full text-center max-w-3xl">
          <img src="/mewlogo.png" alt="MEW logo" className="w-48 mx-auto mb-6" />
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">ABOUT MUSIC EVERY WEEK</h1>
          <p className="text-lg text-gray-300 leading-relaxed">MEW is a music community and songwriting accountability group that's been active since November 2019. We’ve written 8,685 songs as of May 2024, and more every week. We are currently in session until mid-April 2026. <a href="http://eepurl.com/hp04-9" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Sign up to hear about the next one!</a></p>
        </div>

        {/* Middle Row: Rules and Login */}
        <div className="w-full grid md:grid-cols-2 gap-12 items-start max-w-5xl">
            {/* Rules Column */}
            <div className="space-y-6">
                <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 space-y-4">
                    <h2 className="text-xl font-bold text-white mb-2">These are the rules:</h2>
                    <ul className="list-disc list-inside text-gray-400 space-y-2">
                        <li>Write and record a new song every week – or you’re out!</li>
                        <li>When you submit a song, you can hear everyone else’s songs</li>
                        <li>There are optional theme prompts each week, but it’s very open ended</li>
                        <li>All genres and levels are welcome and encouraged!</li>
                        <li>We have peer workshops and skill shares too sometimes, and a discord group to chat music and miscellany</li>
                        <li>Everything is free, forever</li>
                    </ul>
                </div>

                {/* You're Invited Section (Moved) */}
                <div className="bg-gray-900/30 p-6 rounded-xl border border-gray-800 text-center">
                    <p className="text-xl font-bold text-white mb-4">You’re invited!</p>
                    <div className="flex flex-col gap-3">
                        <a className="bg-blue-600/80 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition" href="http://eepurl.com/hp04-9" target="_blank" rel="noopener noreferrer">Join the email list</a>
                        <a className="bg-purple-600/80 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition" href="https://www.patreon.com/c/MusicEveryWeek" target="_blank" rel="noopener noreferrer">Support the project</a>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">Questions? Email <a href="mailto:MEWisMusicEveryWeek@gmail.com" className="text-blue-400 hover:underline">MEWisMusicEveryWeek@gmail.com</a>.</p>
                </div>
            </div>

            {/* Login Column */}
            <div className="flex flex-col items-center w-full">
                <div className="w-full max-w-md">
                    <ParticipantAuth />
                </div>
            </div>
        </div>

      </main>

      <footer className="w-full p-6 text-center text-gray-700 text-xs border-t border-gray-900 mt-12">
          &copy; {new Date().getFullYear()} Music Every Week.
      </footer>
    </div>
  );
}
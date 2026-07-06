import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ParticipantAuth } from '../components/ParticipantAuth';
import { BRAND_INFO } from '../config/appConfig';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { LandingConfig } from '../types';

const DEFAULT_RULES = [
  "Write and record a new song every week – or you’re out!",
  "When you submit a song, you can hear everyone else’s songs",
  "There are optional theme prompts each week, but it’s very open ended",
  "All genres and levels are welcome and encouraged!",
  "We have peer workshops and skill shares too sometimes, and a discord group to chat music and miscellany",
  "Everything is free, forever"
];

const DEFAULT_CTA_LINKS = [
  { label: "Join the email list", url: "http://eepurl.com/hp04-9", style: "blue" as const },
  { label: "Support the project", url: "https://www.patreon.com/c/MusicEveryWeek", style: "purple" as const }
];

function renderFormattedText(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^\)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (match) {
      return (
        <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-medium">
          {match[1]}
        </a>
      );
    }
    return part;
  });
}

export function LandingPage() {
  const { participantEmail } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<LandingConfig>({});

  useEffect(() => {
    if (participantEmail) {
      navigate('/', { replace: true });
    }
  }, [participantEmail, navigate]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'landing'), (snap) => {
      if (snap.exists()) {
        setConfig(snap.data() as LandingConfig);
      } else {
        setConfig({});
      }
    }, (err) => {
      console.error("Error fetching landing config:", err);
    });
    return () => unsub();
  }, []);

  const heroTitle = config.heroTitle || `ABOUT ${BRAND_INFO.name.toUpperCase()}`;
  const aboutText = config.aboutText || `${BRAND_INFO.tagline} [Sign up to hear about the next one!](http://eepurl.com/hp04-9)`;
  const rules = (config.rules && config.rules.length > 0) ? config.rules : DEFAULT_RULES;
  const ctaLinks = (config.ctaLinks && config.ctaLinks.length > 0) ? config.ctaLinks : DEFAULT_CTA_LINKS;

  const getBtnClass = (style?: string) => {
    switch (style) {
      case 'purple': return "bg-purple-600/80 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition";
      case 'gray': return "bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold py-2 px-4 rounded-lg transition border border-gray-700";
      case 'blue':
      default: return "bg-blue-600/80 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition";
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center">
      
      {/* Hero Section */}
      <main className="flex-1 w-full max-w-6xl mx-auto p-6 flex flex-col items-center justify-center space-y-12">
        
        {/* Top Row: Logo and About Section */}
        <div className="w-full text-center max-w-3xl">
          <img src={BRAND_INFO.logoUrl} alt={`${BRAND_INFO.shortName} logo`} className="w-48 mx-auto mb-6" />
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">{heroTitle}</h1>
          <p className="text-lg text-gray-300 leading-relaxed">{renderFormattedText(aboutText)}</p>
        </div>

        {/* Middle Row: Rules and Login */}
        <div className="w-full grid md:grid-cols-2 gap-12 items-start max-w-5xl">
            {/* Rules Column */}
            <div className="space-y-6">
                <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 space-y-4">
                    <h2 className="text-xl font-bold text-white mb-2">These are the rules:</h2>
                    <ul className="list-disc list-inside text-gray-400 space-y-2">
                        {rules.map((rule, index) => (
                          <li key={index}>{renderFormattedText(rule)}</li>
                        ))}
                    </ul>
                </div>

                {/* You're Invited Section */}
                <div className="bg-gray-900/30 p-6 rounded-xl border border-gray-800 text-center">
                    <p className="text-xl font-bold text-white mb-4">You’re invited!</p>
                    <div className="flex flex-col gap-3">
                        {ctaLinks.map((cta, index) => (
                          <a 
                            key={index}
                            className={getBtnClass(cta.style)}
                            href={cta.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            {cta.label}
                          </a>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-4">Questions? Email <a href={`mailto:${BRAND_INFO.supportEmail}`} className="text-blue-400 hover:underline">{BRAND_INFO.supportEmail}</a>.</p>
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

      <footer className="w-full p-6 text-center border-t border-gray-900 mt-12 flex flex-col items-center gap-4">
          <p className="text-xs text-gray-700">
            &copy; {new Date().getFullYear()} {BRAND_INFO.name}.
          </p>
          <div className="flex gap-4 text-xs">
            <Link to="/privacy-policy" className="text-gray-500 hover:text-gray-300 transition">Privacy Policy</Link>
            <Link to="/terms-of-service" className="text-gray-500 hover:text-gray-300 transition">Terms of Service</Link>
          </div>
      </footer>
    </div>
  );
}
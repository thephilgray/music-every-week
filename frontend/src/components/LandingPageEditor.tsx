import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '../contexts/ToastContext';
import { BRAND_INFO } from '../config/appConfig';
import type { LandingConfig, LandingCtaLink } from '../types';
import { Plus, Trash2, Save, RotateCcw, HelpCircle, Globe } from 'lucide-react';

const DEFAULT_RULES = [
  "Write and record a new song every week – or you’re out!",
  "When you submit a song, you can hear everyone else’s songs",
  "There are optional theme prompts each week, but it’s very open ended",
  "All genres and levels are welcome and encouraged!",
  "We have peer workshops and skill shares too sometimes, and a discord group to chat music and miscellany",
  "Everything is free, forever"
];

const DEFAULT_CTA_LINKS: LandingCtaLink[] = [
  { label: "Join the email list", url: "http://eepurl.com/hp04-9", style: "blue" },
  { label: "Support the project", url: "https://www.patreon.com/c/MusicEveryWeek", style: "purple" }
];

export function LandingPageEditor() {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [heroTitle, setHeroTitle] = useState(`ABOUT ${BRAND_INFO.name.toUpperCase()}`);
  const [aboutText, setAboutText] = useState(`${BRAND_INFO.tagline} [Sign up to hear about the next one!](http://eepurl.com/hp04-9)`);
  const [rules, setRules] = useState<string[]>(DEFAULT_RULES);
  const [ctaLinks, setCtaLinks] = useState<LandingCtaLink[]>(DEFAULT_CTA_LINKS);

  const [initialHeroTitle, setInitialHeroTitle] = useState(`ABOUT ${BRAND_INFO.name.toUpperCase()}`);
  const [initialAboutText, setInitialAboutText] = useState(`${BRAND_INFO.tagline} [Sign up to hear about the next one!](http://eepurl.com/hp04-9)`);
  const [initialRules, setInitialRules] = useState<string[]>(DEFAULT_RULES);
  const [initialCtaLinks, setInitialCtaLinks] = useState<LandingCtaLink[]>(DEFAULT_CTA_LINKS);

  useEffect(() => {
    async function loadConfig() {
      try {
        const docRef = doc(db, 'config', 'landing');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as LandingConfig;
          const t = data.heroTitle || `ABOUT ${BRAND_INFO.name.toUpperCase()}`;
          const a = data.aboutText || `${BRAND_INFO.tagline} [Sign up to hear about the next one!](http://eepurl.com/hp04-9)`;
          const r = (data.rules && Array.isArray(data.rules)) ? data.rules : DEFAULT_RULES;
          const c = (data.ctaLinks && Array.isArray(data.ctaLinks)) ? data.ctaLinks : DEFAULT_CTA_LINKS;
          setHeroTitle(t); setInitialHeroTitle(t);
          setAboutText(a); setInitialAboutText(a);
          setRules(r); setInitialRules(r);
          setCtaLinks(c); setInitialCtaLinks(c);
        } else {
          const t = `ABOUT ${BRAND_INFO.name.toUpperCase()}`;
          const a = `${BRAND_INFO.tagline} [Sign up to hear about the next one!](http://eepurl.com/hp04-9)`;
          setInitialHeroTitle(t); setInitialAboutText(a);
          setInitialRules(DEFAULT_RULES); setInitialCtaLinks(DEFAULT_CTA_LINKS);
        }
      } catch (err) {
        console.error("Error loading landing page config:", err);
        error("Failed to load custom landing page config.");
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, [error]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'config', 'landing');
      await setDoc(docRef, {
        heroTitle: heroTitle.trim(),
        aboutText: aboutText.trim(),
        rules: rules.map(r => r.trim()).filter(Boolean),
        ctaLinks: ctaLinks.filter(c => c.label.trim() && c.url.trim())
      });
      setInitialHeroTitle(heroTitle);
      setInitialAboutText(aboutText);
      setInitialRules(rules);
      setInitialCtaLinks(ctaLinks);
      success("Landing page content saved successfully!");
    } catch (err) {
      console.error("Error saving landing page config:", err);
      error("Failed to save changes. Please verify admin permissions.");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = heroTitle !== initialHeroTitle ||
    aboutText !== initialAboutText ||
    JSON.stringify(rules) !== JSON.stringify(initialRules) ||
    JSON.stringify(ctaLinks) !== JSON.stringify(initialCtaLinks);

  const handleReset = () => {
    if (window.confirm("Reset all landing page content to default values?")) {
      setHeroTitle(`ABOUT ${BRAND_INFO.name.toUpperCase()}`);
      setAboutText(`${BRAND_INFO.tagline} [Sign up to hear about the next one!](http://eepurl.com/hp04-9)`);
      setRules([...DEFAULT_RULES]);
      setCtaLinks([...DEFAULT_CTA_LINKS]);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-400 animate-pulse">Loading landing page editor...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-purple-500/20 pb-4">
        <h2 className="text-xl font-semibold text-purple-300 flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Global: Landing Page Configuration
        </h2>
        <p className="text-xs text-purple-200/70 mt-1">Customize the public homepage content seen by logged-out visitors.</p>
      </div>

      {/* Hero Title Section */}
      <div className="bg-gray-900/40 p-6 rounded-xl border border-gray-800 space-y-3">
        <label className="block text-sm font-semibold text-gray-300">Hero Heading</label>
        <input
          type="text"
          value={heroTitle}
          onChange={(e) => setHeroTitle(e.target.value)}
          placeholder={`ABOUT ${BRAND_INFO.name.toUpperCase()}`}
          className="w-full bg-black/60 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
        />
        <p className="text-xs text-gray-500">Displayed below the logo on the main landing page.</p>
      </div>

      {/* About Paragraph Section */}
      <div className="bg-gray-900/40 p-6 rounded-xl border border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold text-gray-300">About Paragraph & Tagline</label>
          <span className="text-xs text-blue-400 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" /> Supports Markdown link syntax: [Text](https://url.com)
          </span>
        </div>
        <textarea
          rows={3}
          value={aboutText}
          onChange={(e) => setAboutText(e.target.value)}
          placeholder="Enter community tagline and introduction..."
          className="w-full bg-black/60 border border-gray-700 rounded-lg p-4 text-white focus:outline-none focus:border-blue-500 leading-relaxed text-sm"
        />
        <p className="text-xs text-gray-500">
          Example: <code className="text-gray-400 bg-gray-800 px-1 py-0.5 rounded">Welcome to our community. [Sign up here!](https://eepurl.com/...)</code>
        </p>
      </div>

      {/* Rules Section */}
      <div className="bg-gray-900/40 p-6 rounded-xl border border-gray-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <label className="block text-sm font-semibold text-gray-300">Rules & Guidelines List</label>
          <button
            onClick={() => setRules([...rules, ""])}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition font-medium flex-shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Rule
          </button>
        </div>
        <div className="space-y-3">
          {rules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono w-6">{idx + 1}.</span>
              <input
                type="text"
                value={rule}
                onChange={(e) => {
                  const next = [...rules];
                  next[idx] = e.target.value;
                  setRules(next);
                }}
                placeholder="Enter a rule bullet point..."
                className="flex-1 bg-black/60 border border-gray-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => setRules(rules.filter((_, i) => i !== idx))}
                className="p-2 text-gray-500 hover:text-red-400 transition"
                title="Remove Rule"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="text-sm text-gray-500 italic text-center py-4">No rules defined. Click 'Add Rule' above to add items.</p>
          )}
        </div>
      </div>

      {/* CTA Links Section */}
      <div className="bg-gray-900/40 p-6 rounded-xl border border-gray-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <label className="block text-sm font-semibold text-gray-300">Call-to-Action Buttons</label>
            <p className="text-xs text-gray-500 mt-0.5">Configure the invitation buttons shown on the landing page.</p>
          </div>
          <button
            onClick={() => setCtaLinks([...ctaLinks, { label: "", url: "", style: "blue" }])}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition font-medium flex-shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Button
          </button>
        </div>
        <div className="space-y-3">
          {ctaLinks.map((cta, idx) => (
            <div key={idx} className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-black/40 p-3 rounded-lg border border-gray-800/80">
              <input
                type="text"
                value={cta.label}
                onChange={(e) => {
                  const next = [...ctaLinks];
                  next[idx].label = e.target.value;
                  setCtaLinks(next);
                }}
                placeholder="Button Label (e.g. Join the email list)"
                className="w-full md:w-1/3 bg-black/60 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <input
                type="url"
                value={cta.url}
                onChange={(e) => {
                  const next = [...ctaLinks];
                  next[idx].url = e.target.value;
                  setCtaLinks(next);
                }}
                placeholder="https://..."
                className="w-full md:flex-1 bg-black/60 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <select
                value={cta.style}
                onChange={(e) => {
                  const next = [...ctaLinks];
                  next[idx].style = e.target.value as 'blue' | 'purple' | 'gray';
                  setCtaLinks(next);
                }}
                className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 capitalize"
              >
                <option value="blue">Blue</option>
                <option value="purple">Purple</option>
                <option value="gray">Gray</option>
              </select>
              <button
                onClick={() => setCtaLinks(ctaLinks.filter((_, i) => i !== idx))}
                className="p-1.5 text-gray-500 hover:text-red-400 transition"
                title="Remove Button"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {ctaLinks.length === 0 && (
            <p className="text-sm text-gray-500 italic text-center py-4">No buttons configured.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 border-t border-purple-500/20 pt-6">
        <button
          onClick={handleReset}
          className="flex items-center justify-center sm:justify-start gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition flex-shrink-0"
        >
          <RotateCcw className="w-4 h-4" /> Reset Defaults
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center justify-center sm:justify-start gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-medium transition shadow-lg shadow-purple-500/20 flex-shrink-0"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

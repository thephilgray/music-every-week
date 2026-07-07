import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '../contexts/ToastContext';
import type { DashboardConfig, DashboardLink } from '../types';
import { Plus, Trash2, Save, RotateCcw, HelpCircle, LayoutDashboard } from 'lucide-react';

const DEFAULT_DASHBOARD_LINKS: DashboardLink[] = [
  { label: 'Discord', url: 'https://discord.com/invite/MJRRwBddKV' },
  { label: 'Patreon', url: 'https://www.patreon.com/MusicEveryWeek' },
  { label: 'FAQ', url: 'https://docs.google.com/document/d/192JE_HXcs_cSJubnf1BEYyjbNr9V5YXeedK-MIJbvlo/edit?tab=t.0#heading=h.45at7kfvym83' },
  { label: 'Ideas & Comments Box', url: 'https://forms.gle/27w4CoSfb6EpssR6A' }
];

export function DashboardEditor() {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customContent, setCustomContent] = useState('');
  const [links, setLinks] = useState<DashboardLink[]>(DEFAULT_DASHBOARD_LINKS);
  const [initialContent, setInitialContent] = useState('');
  const [initialLinks, setInitialLinks] = useState<DashboardLink[]>(DEFAULT_DASHBOARD_LINKS);

  useEffect(() => {
    async function loadConfig() {
      try {
        const docRef = doc(db, 'config', 'dashboard');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as DashboardConfig;
          const contentVal = data.customContent !== undefined ? data.customContent : '';
          const linksVal = data.links && data.links.length > 0 ? data.links : DEFAULT_DASHBOARD_LINKS;
          setCustomContent(contentVal);
          setInitialContent(contentVal);
          setLinks(linksVal);
          setInitialLinks(linksVal);
        } else {
          setInitialContent('');
          setInitialLinks(DEFAULT_DASHBOARD_LINKS);
        }
      } catch (e) {
        console.error("Failed to load dashboard config", e);
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'config', 'dashboard');
      const configData: DashboardConfig = {
        customContent,
        links
      };
      await setDoc(docRef, configData);
      setInitialContent(customContent);
      setInitialLinks(links);
      success("Dashboard configuration saved successfully!");
    } catch (e) {
      console.error("Failed to save dashboard config", e);
      error("Failed to save dashboard configuration.");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = customContent !== initialContent || JSON.stringify(links) !== JSON.stringify(initialLinks);

  const handleReset = () => {
    if (window.confirm("Reset dashboard links and content to default values? You will still need to click Save.")) {
      setCustomContent('');
      setLinks(DEFAULT_DASHBOARD_LINKS);
    }
  };

  const handleAddLink = () => {
    setLinks([...links, { label: 'New Link', url: 'https://example.com' }]);
  };

  const handleRemoveLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleLinkChange = (index: number, field: keyof DashboardLink, value: string) => {
    const newLinks = [...links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    setLinks(newLinks);
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading dashboard configuration...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="pb-4 border-b border-purple-500/20">
        <h2 className="text-xl font-semibold text-purple-300 flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5" />
          Global: Dashboard Home Configuration
        </h2>
        <p className="text-xs text-purple-200/70 mt-1">
          Customize the tertiary navigation links and optional announcement block on the member dashboard.
        </p>
      </div>

      {/* Custom Content / Announcement Block */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-white">
            Custom Announcement / Content Block
          </label>
          <span className="text-xs text-purple-300/80 flex items-center gap-1">
            <HelpCircle className="w-3 h-3" /> Supports Markdown links [Text](Url)
          </span>
        </div>
        <p className="text-xs text-gray-400">
          An optional banner or welcome message displayed directly above the prompt list on the home dashboard. Leave blank to hide.
        </p>
        <textarea
          value={customContent}
          onChange={(e) => setCustomContent(e.target.value)}
          rows={3}
          placeholder="e.g. Welcome to the Spring Session! Check out the [submission guidelines](https://example.com) before submitting."
          className="w-full px-4 py-3 bg-black/40 border border-purple-500/30 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500 resize-y"
        />
      </div>

      {/* Tertiary Navigation Links */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-white">
              Dashboard Navigation Links
            </label>
            <p className="text-xs text-gray-400 mt-0.5">
              The horizontal row of custom links displayed at the very top of the home page.
            </p>
          </div>
          <button
            onClick={handleAddLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 border border-purple-500/50 rounded-lg text-xs font-medium transition whitespace-nowrap flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add Link
          </button>
        </div>

        <div className="space-y-3">
          {links.map((link, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-black/30 p-3 rounded-lg border border-purple-500/10">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => handleLinkChange(idx, 'label', e.target.value)}
                  placeholder="Link Label (e.g. Discord)"
                  className="px-3 py-1.5 bg-black/50 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
                />
                <input
                  type="text"
                  value={link.url}
                  onChange={(e) => handleLinkChange(idx, 'url', e.target.value)}
                  placeholder="https://..."
                  className="sm:col-span-2 px-3 py-1.5 bg-black/50 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <button
                onClick={() => handleRemoveLink(idx)}
                className="self-end sm:self-center p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                title="Remove link"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {links.length === 0 && (
            <div className="text-center py-6 border border-dashed border-gray-700 rounded-lg text-gray-500 text-sm">
              No navigation links configured. Click "Add Link" above to add one.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-purple-500/20 pt-6">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition whitespace-nowrap flex-shrink-0"
        >
          <RotateCcw className="w-4 h-4" /> Reset Defaults
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-medium transition shadow-lg shadow-purple-500/20 whitespace-nowrap flex-shrink-0"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

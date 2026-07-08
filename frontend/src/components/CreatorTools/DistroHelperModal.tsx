import React from 'react';
import { Copy, Tag, FileSpreadsheet, Users, X, Check, Filter } from 'lucide-react';
import { copyToClipboard } from '../../lib/utils';
import { useToast } from '../../contexts/ToastContext';

interface ParticipantRow {
    id: string;
    name: string;
    contact: string;
    status: string;
    type: 'user' | 'email';
    extensionHours?: number;
    hasPass?: boolean;
}

interface DistroHelperModalProps {
    isOpen: boolean;
    onClose: () => void;
    participants: ParticipantRow[];
    promptTitle: string;
    distroTarget: 'inactive' | 'active' | 'all';
    setDistroTarget: (val: 'inactive' | 'active' | 'all') => void;
    distroFormat: 'comma' | 'newline' | 'table';
    setDistroFormat: (val: 'comma' | 'newline' | 'table') => void;
    distroIncludePending: boolean;
    setDistroIncludePending: (val: boolean) => void;
}

export const DistroHelperModal: React.FC<DistroHelperModalProps> = ({
    isOpen,
    onClose,
    participants,
    promptTitle,
    distroTarget,
    setDistroTarget,
    distroFormat,
    setDistroFormat,
    distroIncludePending,
    setDistroIncludePending,
}) => {
    const { success } = useToast();

    if (!isOpen) return null;

    const targetParticipants = participants.filter(p => {
        if (!distroIncludePending && (p.status === 'pending' || p.status === 'invited')) {
            return false;
        }
        const isActive = p.status === 'submitted' || p.hasPass === true || (p.extensionHours != null && p.extensionHours > 0);
        if (distroTarget === 'inactive') return !isActive;
        if (distroTarget === 'active') return isActive;
        return true;
    });

    const getDistroText = () => {
        if (targetParticipants.length === 0) return '';
        if (distroFormat === 'comma') {
            return targetParticipants.map(p => p.contact).filter(Boolean).join(', ');
        }
        if (distroFormat === 'newline') {
            return targetParticipants.map(p => p.contact).filter(Boolean).join('\n');
        }
        // table format
        const header = "Name\tEmail\tStatus\tPass\tExtension";
        const rows = targetParticipants.map(p => 
            `${p.name || 'Unknown'}\t${p.contact}\t${p.status}\t${p.hasPass ? 'Yes' : 'No'}\t${p.extensionHours ? `${p.extensionHours}h` : 'None'}`
        );
        return [header, ...rows].join('\n');
    };

    const distroText = getDistroText();

    const handleCopy = async () => {
        if (!distroText) return;
        await copyToClipboard(distroText);
        success(`Copied ${targetParticipants.length} contacts to clipboard!`);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 pb-28">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative flex flex-col overflow-y-auto max-h-full">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400">
                            <Tag className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Mailchimp Distro & Tag Helper</h2>
                            <p className="text-xs text-gray-400">Audit lists and generate custom exports for Mailchimp tags</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Subtitle / Context */}
                <div className="bg-gray-950/60 border border-gray-800/80 rounded-xl p-3.5 text-xs text-gray-300 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-gray-400">Prompt: <strong className="text-white">{promptTitle}</strong></span>
                    <span className="bg-gray-800 px-2.5 py-1 rounded-full text-blue-300 font-medium border border-gray-700">
                        {targetParticipants.length} {targetParticipants.length === 1 ? 'member' : 'members'} selected
                    </span>
                </div>

                {/* Filters & Options */}
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">
                            Select Target Group
                        </label>
                        <div className="grid grid-cols-3 gap-2 bg-gray-950 p-1.5 rounded-xl border border-gray-800">
                            <button
                                onClick={() => setDistroTarget('inactive')}
                                className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 ${
                                    distroTarget === 'inactive'
                                        ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                                }`}
                            >
                                <Filter className="w-3.5 h-3.5" /> Inactive (No Submit/Pass)
                            </button>
                            <button
                                onClick={() => setDistroTarget('active')}
                                className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 ${
                                    distroTarget === 'active'
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30 shadow'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                                }`}
                            >
                                <Check className="w-3.5 h-3.5" /> Active (Submitted/Pass)
                            </button>
                            <button
                                onClick={() => setDistroTarget('all')}
                                className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 ${
                                    distroTarget === 'all'
                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                                }`}
                            >
                                <Users className="w-3.5 h-3.5" /> All Participants
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                                Output Format
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setDistroFormat('comma')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                                        distroFormat === 'comma'
                                            ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                                            : 'bg-gray-950 text-gray-400 border-gray-800 hover:border-gray-700'
                                    }`}
                                >
                                    Comma-Separated
                                </button>
                                <button
                                    onClick={() => setDistroFormat('newline')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                                        distroFormat === 'newline'
                                            ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                                            : 'bg-gray-950 text-gray-400 border-gray-800 hover:border-gray-700'
                                    }`}
                                >
                                    Newline (List)
                                </button>
                                <button
                                    onClick={() => setDistroFormat('table')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
                                        distroFormat === 'table'
                                            ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                                            : 'bg-gray-950 text-gray-400 border-gray-800 hover:border-gray-700'
                                    }`}
                                >
                                    <FileSpreadsheet className="w-3.5 h-3.5" /> Spreadsheet TSV
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-5">
                            <input
                                type="checkbox"
                                id="includePending"
                                checked={distroIncludePending}
                                onChange={(e) => setDistroIncludePending(e.target.checked)}
                                className="rounded bg-gray-950 border-gray-800 text-blue-500 focus:ring-0 cursor-pointer w-4 h-4"
                            />
                            <label htmlFor="includePending" className="text-xs text-gray-300 cursor-pointer select-none">
                                Include unaccepted invites
                            </label>
                        </div>
                    </div>
                </div>

                {/* Preview Box */}
                <div className="flex-1 min-h-[160px] flex flex-col">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">
                        Export Preview
                    </label>
                    <textarea
                        readOnly
                        value={distroText || 'No members match this filter.'}
                        className="w-full flex-1 bg-gray-950 border border-gray-800 rounded-xl p-3.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-gray-700 resize-none overflow-y-auto"
                        placeholder="Select options above..."
                    />
                </div>

                {/* Instructions & Action Footer */}
                <div className="border-t border-gray-800 pt-4 flex items-center justify-between gap-4 flex-wrap">
                    <p className="text-xs text-gray-400 max-w-sm">
                        {distroTarget === 'inactive' && "Tip: Copy this list to Mailchimp to tag inactive users or remove them from weekly distro notifications."}
                        {distroTarget === 'active' && "Tip: Use this list to reward active members or tag them in Mailchimp for exclusive announcements."}
                        {distroTarget === 'all' && "Tip: Complete member roster for this prompt, ready for CRM or Mailchimp import."}
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-xl text-sm font-semibold transition"
                        >
                            Close
                        </button>
                        <button
                            onClick={handleCopy}
                            disabled={!distroText}
                            className={`px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition shadow-lg ${
                                distroText
                                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 cursor-pointer'
                                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            <Copy className="w-4 h-4" /> Copy to Clipboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

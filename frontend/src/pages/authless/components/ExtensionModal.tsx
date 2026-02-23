import { useState } from 'react';
import { Plus, X, Copy, Check } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

interface ExtensionModalProps {
    isOpen: boolean;
    onClose: () => void;
    request: { id: string; title: string; deadline: string } | null;
}

export function ExtensionModal({ isOpen, onClose, request }: ExtensionModalProps) {
    const [selectedHours, setSelectedHours] = useState<number>(12);
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    if (!isOpen || !request) return null;

    const generateLink = async () => {
        setLoading(true);
        setCopySuccess(false);
        setGeneratedLink(null);
        try {
            const extensionId = uuidv4();
            const extensionRef = doc(db, 'extension_tokens', extensionId);
            
            await setDoc(extensionRef, {
                requestId: request.id,
                hours: selectedHours,
                createdAt: new Date().toISOString()
            });

            const link = `${window.location.origin}/s/${request.id}?ext_token=${extensionId}`;
            setGeneratedLink(link);

        } catch (error) {
            console.error("Error generating extension link:", error);
            alert("Failed to generate extension link.");
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (generatedLink) {
            navigator.clipboard.writeText(generatedLink);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md border border-gray-700 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Generate Extension Link</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <p className="text-gray-300 mb-4">
                    For Request: <span className="font-semibold">{request.title}</span> (Deadline: {new Date(request.deadline).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })})
                </p>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-400 mb-2">Extension Duration</label>
                    <div className="flex gap-2">
                        {[12, 24, 48, 72, 168].map(hours => (
                            <button
                                key={hours}
                                onClick={() => setSelectedHours(hours)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                    selectedHours === hours ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                +{hours} Hours
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={generateLink}
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-lg font-bold transition flex items-center justify-center gap-2"
                >
                    {loading ? <Plus className="animate-spin" /> : <Plus />} Generate Link
                </button>

                {generatedLink && (
                    <div className="mt-6 bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <p className="text-gray-400 text-sm mb-2">Share this link:</p>
                        <div className="flex items-center gap-2 bg-black p-3 rounded-md break-all">
                            <code className="flex-1 text-blue-400 text-sm">{generatedLink}</code>
                            <button
                                onClick={copyToClipboard}
                                className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                                title="Copy to clipboard"
                            >
                                {copySuccess ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
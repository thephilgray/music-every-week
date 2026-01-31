import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  confirmLabel = 'Confirm', 
  onConfirm, 
  onCancel,
  isDestructive = false
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button 
            onClick={onCancel}
            className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-full ${isDestructive ? 'bg-red-900/20 text-red-500' : 'bg-blue-900/20 text-blue-500'}`}>
                    <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white">{title}</h3>
            </div>
            
            <p className="text-gray-400 mb-6 leading-relaxed">
                {message}
            </p>

            <div className="flex justify-end gap-3">
                <button 
                    onClick={onCancel}
                    className="px-4 py-2 text-gray-400 hover:text-white transition bg-gray-800 hover:bg-gray-700 rounded-lg"
                >
                    Cancel
                </button>
                <button 
                    onClick={onConfirm}
                    className={`px-6 py-2 text-white rounded-lg font-semibold transition ${
                        isDestructive 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                    {confirmLabel}
                </button>
            </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

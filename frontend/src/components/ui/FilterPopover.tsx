import { Filter, X } from 'lucide-react';

// Feedback focus categories, mirrored from AuthlessSubmissionForm for consistency
const FEEDBACK_FOCUS_CATEGORIES = {
    "Songwriting & Composition": ["Lyrics", "Melody", "Harmony / Chords"],
    "Arrangement & Structure": ["Song Structure", "Instrumentation", "Dynamics / Pacing"],
    "Performance": ["Vocal Performance", "Instrumental Performance"],
    "Production & Mix": ["Recording Quality", "Mixing", "Sound Design / Vibe"]
};

interface FilterPopoverProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    searchSuggestions?: string[];
    sortBy: 'newest' | 'oldest' | 'mostComments' | 'fewestComments' | 'alpha' | 'unlistenedFirst';
    setSortBy: (sort: 'newest' | 'oldest' | 'mostComments' | 'fewestComments' | 'alpha' | 'unlistenedFirst') => void;
    filterByAI: boolean;
    setFilterByAI: (filter: boolean) => void;
    filterByFragile: boolean;
    setFilterByFragile: (filter: boolean) => void;
    filterByUnlistened: boolean;
    setFilterByUnlistened: (filter: boolean) => void;
    filterByFeedbackFocus: string[];
    setFilterByFeedbackFocus: (filters: string[]) => void;
    onClose: () => void; // Function to close the popover
    forceModal?: boolean; // Force modal mode even on desktop
}

export function FilterPopover({
    searchTerm,
    setSearchTerm,
    searchSuggestions,
    sortBy,
    setSortBy,
    filterByAI,
    setFilterByAI,
    filterByFragile,
    setFilterByFragile,
    filterByUnlistened,
    setFilterByUnlistened,
    filterByFeedbackFocus,
    setFilterByFeedbackFocus,
    onClose,
    forceModal = false
}: FilterPopoverProps) {
    // Check if any filters are active to show/hide "Clear Filters" button
    const hasActiveFilters = searchTerm || sortBy !== 'newest' || filterByAI || filterByFragile || filterByUnlistened || filterByFeedbackFocus.length > 0;

    const handleClearFilters = () => {
        setSearchTerm('');
        setSortBy('newest');
        setFilterByAI(false);
        setFilterByFragile(false);
        setFilterByUnlistened(false);
        setFilterByFeedbackFocus([]);
    };

    const isModal = forceModal;

    return (
        <>
            {/* Backdrop */}
            <div className={`fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm ${isModal ? 'block' : 'md:hidden'}`} onClick={onClose} />
            
            <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto z-[60] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 animate-in fade-in zoom-in-95 ${!isModal ? 'md:absolute md:top-0 md:right-0 md:left-auto md:translate-x-0 md:translate-y-0 md:mt-12 md:w-[320px] lg:w-[380px] md:slide-in-from-right-2' : 'md:w-[450px]'}`}>
                <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Filter className="w-5 h-5" /> Filters & Sort
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex flex-col gap-3">
                {/* Search */}
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search title, artist, or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        list="search-suggestions"
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 pr-8 text-white placeholder-gray-500 focus:border-blue-500 outline-none"
                    />
                    {searchSuggestions && searchSuggestions.length > 0 && (
                        <datalist id="search-suggestions">
                            {searchSuggestions.map((suggestion, idx) => (
                                <option key={idx} value={suggestion} />
                            ))}
                        </datalist>
                    )}
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white focus:outline-none"
                            title="Clear search"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Sort */}
                <div>
                    <label htmlFor="sort-by" className="block text-sm text-gray-400 mb-1">Sort by:</label>
                    <select
                        id="sort-by"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm focus:border-blue-500 outline-none"
                    >
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="mostComments">Most Comments</option>
                        <option value="fewestComments">Fewest Comments</option>
                        <option value="alpha">Alphabetical</option>
                        <option value="unlistenedFirst">Unlistened First</option>
                    </select>
                </div>

                {/* Checkbox Filters */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="filter-unlistened"
                            checked={filterByUnlistened}
                            onChange={(e) => setFilterByUnlistened(e.target.checked)}
                            className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-yellow-500 focus:ring-yellow-500"
                        />
                        <label htmlFor="filter-unlistened" className="text-sm text-yellow-500">Unlistened Tracks Only</label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="filter-ai"
                            checked={filterByAI}
                            onChange={(e) => setFilterByAI(e.target.checked)}
                            className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="filter-ai" className="text-sm text-gray-300">Exclude AI Tracks</label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="filter-fragile"
                            checked={filterByFragile}
                            onChange={(e) => setFilterByFragile(e.target.checked)}
                            className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-pink-500 focus:ring-pink-500"
                        />
                        <label htmlFor="filter-fragile" className="text-sm text-pink-300">Show Fragile Tracks Only</label>
                    </div>
                </div>

                {/* Feedback Focus Filter */}
                <details className="group border border-gray-700 rounded bg-gray-800/30">
                    <summary className="p-3 cursor-pointer text-sm font-medium text-gray-300 hover:text-white flex justify-between items-center select-none transition">
                        <span className="flex items-center gap-2">
                            Feedback Focus
                            {filterByFeedbackFocus.length > 0 && <span className="ml-2 text-blue-400 text-xs font-bold">({filterByFeedbackFocus.length})</span>}
                        </span>
                        <span className="text-gray-500 text-xs group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="p-4 pt-0 border-t border-gray-700/50 mt-2 space-y-4 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                        {Object.entries(FEEDBACK_FOCUS_CATEGORIES).map(([category, items]) => (
                            <div key={category}>
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 mt-2">{category}</h4>
                                <div className="grid grid-cols-1 gap-2">
                                    {items.map(item => (
                                        <label key={item} className="flex items-center gap-2 cursor-pointer hover:bg-gray-700/50 p-1 rounded transition">
                                            <input
                                                type="checkbox"
                                                checked={filterByFeedbackFocus.includes(item)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setFilterByFeedbackFocus([...filterByFeedbackFocus, item]);
                                                    else setFilterByFeedbackFocus(filterByFeedbackFocus.filter(i => i !== item));
                                                }}
                                                className="rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-300">{item}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </details>

                {hasActiveFilters && (
                    <button
                        onClick={handleClearFilters}
                        className="text-sm text-red-400 hover:text-red-300 transition mt-4"
                    >
                        Clear All Filters
                    </button>
                )}
            </div>
            </div>
        </>
    );
};

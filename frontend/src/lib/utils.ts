import { FieldValue, Timestamp } from 'firebase/firestore';

// Simple deterministic PRNG based on a seed
export function seededRandom(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }

    // LCG parameters
    const m = 0x80000000; // 2**31
    const a = 1103515245;
    const c = 12345;

    let state = hash;

    return function() {
        state = (a * state + c) % m;
        return state / m;
    };
}

export function getTimestampAsNumber(timestamp: number | FieldValue | Timestamp | string | undefined | { seconds: number, nanoseconds: number }): number {
    if (typeof timestamp === 'number') {
        return timestamp;
    }
    if (timestamp instanceof Timestamp) {
        return timestamp.toMillis();
    }
    // Handle raw object { seconds, nanoseconds } which sometimes comes from Firestore if not cast correctly
    if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
        return (timestamp as Timestamp).seconds * 1000;
    }
    if (typeof timestamp === 'string') {
        const d = new Date(timestamp).getTime();
        if (!isNaN(d)) return d;
    }
    
    // If it's FieldValue, it means it's still pending on the server.
    // Return 0 as a safe fallback for sorting purposes.
    if (timestamp) {
       console.warn("getTimestampAsNumber: Unhandled timestamp format:", timestamp);
    }
    return 0; 
}

export function formatCommentDate(timestamp: number): string {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Reset hours to compare dates only
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const commentDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffTime = today.getTime() - commentDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return timeStr; // "10:30 AM"
    } else if (diffDays === 1) {
        return `Yesterday at ${timeStr}`;
    } else if (diffDays < 7 && diffDays > 0) {
        return `${date.toLocaleDateString([], { weekday: 'long' })} at ${timeStr}`; // "Monday at 10:30 AM"
    } else {
        return `${date.toLocaleDateString()} at ${timeStr}`; // "10/10/2023 at 10:30 AM"
    }
}

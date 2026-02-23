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

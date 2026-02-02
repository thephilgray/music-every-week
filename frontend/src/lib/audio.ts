export const generateWaveform = async (file: File, samples: number = 100): Promise<number[]> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // decodeAudioData happens on main thread but is largely async/native optimized.
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0); // Left channel
        const blockSize = Math.floor(rawData.length / samples);
        const filteredData = [];
        
        for (let i = 0; i < samples; i++) {
            let blockStart = blockSize * i;
            let sum = 0;
            // Optimize: Just sample every Nth point to speed up large files
            // For visualization, averaging every point is best, but stepping is faster.
            // Let's do a simple average.
            for (let j = 0; j < blockSize; j++) {
                sum = sum + Math.abs(rawData[blockStart + j]);
            }
            filteredData.push(sum / blockSize);
        }
        
        // Normalize
        const max = Math.max(...filteredData);
        if (max === 0) return new Array(samples).fill(0);
        
        const multiplier = Math.pow(max, -1);
        return filteredData.map(n => n * multiplier);
        
    } catch (e) {
        console.error("Error generating waveform:", e);
        return [];
    }
}

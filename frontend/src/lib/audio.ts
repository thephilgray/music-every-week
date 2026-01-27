const workerCode = `
self.onmessage = (e) => {
    const { audioData, samples } = e.data;
    // audioData is Float32Array (channel data)
    
    try {
        const blockSize = Math.floor(audioData.length / samples);
        const filteredData = [];
        
        for (let i = 0; i < samples; i++) {
            let blockStart = blockSize * i;
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum = sum + Math.abs(audioData[blockStart + j]);
            }
            filteredData.push(sum / blockSize);
        }
        
        // Normalize
        const max = Math.max(...filteredData);
        if (max === 0) {
            self.postMessage(new Array(samples).fill(0));
            return;
        }
        
        const multiplier = Math.pow(max, -1);
        const result = filteredData.map(n => n * multiplier);
        self.postMessage(result);
    } catch (err) {
        // console.error("Worker error:", err);
        self.postMessage([]); // Fail safe
    }
};
`;

export const generateWaveform = async (file: File, samples: number = 100): Promise<number[]> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // decodeAudioData happens on main thread but is largely async/native optimized.
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0); // Left channel
        
        return new Promise((resolve) => {
            const blob = new Blob([workerCode], { type: "application/javascript" });
            const blobUrl = URL.createObjectURL(blob);
            const worker = new Worker(blobUrl);
            
            worker.onmessage = (e) => {
                resolve(e.data);
                worker.terminate();
                URL.revokeObjectURL(blobUrl); // Cleanup blob URL
            };
            
            // We transfer the buffer to the worker to avoid copying
            // Note: rawData.buffer might be the whole AudioBuffer's buffer which might be shared across channels?
            // Usually AudioBuffer creates separate buffers or interleaved. getChannelData returns a view.
            // Transferring rawData.buffer is safe if we don't use audioBuffer anymore.
            worker.postMessage({ audioData: rawData, samples }, [rawData.buffer]);
        });
        
    } catch (e) {
        console.error("Error generating waveform:", e);
        return [];
    }
}

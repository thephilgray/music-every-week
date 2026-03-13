import AnalyzerWorker from './audioAnalyzer.worker?worker';

export const analyzeAudio = async (file: File, samples: number = 100): Promise<{ waveform: number[], volumeAdjustmentDb: number }> => {
    let audioContext: AudioContext | null = null;
    try {
        const arrayBuffer = await file.arrayBuffer();
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // decodeAudioData is already async and handles threading internally for decoding
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0); // Left channel

        // Offload the heavy math (loops) to a background worker
        return new Promise((resolve, reject) => {
            const worker = new AnalyzerWorker();
            
            worker.onmessage = (event) => {
                worker.terminate();
                resolve(event.data);
            };

            worker.onerror = (err) => {
                console.error("Worker error analyzing audio:", err);
                worker.terminate();
                reject(err);
            };

            // Transfer the Float32Array's buffer to the worker (Zero-copy)
            worker.postMessage({ rawData, samples }, [rawData.buffer]);
        });
        
    } catch (e) {
        console.error("Error analyzing audio:", e);
        return { waveform: [], volumeAdjustmentDb: 0 };
    } finally {
        if (audioContext) {
            audioContext.close().catch(console.error);
        }
    }
}

// audioAnalyzer.worker.ts
self.onmessage = (event: MessageEvent<{ rawData: Float32Array, samples: number }>) => {
    const { rawData, samples } = event.data;
    const length = rawData.length;
    const blockSize = Math.floor(length / samples);
    const filteredData: number[] = [];
    let sumSquares = 0;

    // Process blocks for waveform and partial RMS
    for (let i = 0; i < samples; i++) {
        const blockStart = blockSize * i;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
            const sample = rawData[blockStart + j];
            sum += Math.abs(sample);
            sumSquares += sample * sample;
        }
        filteredData.push(sum / blockSize);
    }

    // Process remaining samples for RMS accuracy
    for (let i = blockSize * samples; i < length; i++) {
        sumSquares += rawData[i] * rawData[i];
    }

    // Calculate normalized waveform
    const max = Math.max(...filteredData);
    const waveform = max === 0 
        ? new Array(samples).fill(0) 
        : filteredData.map(n => parseFloat((n / max).toFixed(3)));

    // Calculate RMS Loudness & Adjustment
    const rms = Math.sqrt(sumSquares / length);
    const currentDb = 20 * Math.log10(rms || 0.00001);
    const TARGET_DB = -14;
    const adjustment = TARGET_DB - currentDb;
    
    // Clamp and format adjustment
    const volumeAdjustmentDb = parseFloat(Math.min(12, Math.max(-30, adjustment)).toFixed(2));

    self.postMessage({ waveform, volumeAdjustmentDb });
};

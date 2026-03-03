const PUBLIC_R2_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN;

interface UploadResult {
  url: string;
  key: string;
}

/**
 * Normalizes an image file, converting HEIC/HEIF to JPEG and compressing large images.
 */
async function processImage(file: File): Promise<{ blob: Blob | File, isProcessed: boolean }> {
    let currentBlob: Blob | File = file;
    let isProcessed = false;

    // 1. Handle HEIC/HEIF Conversion
    const isHeicFile = 
        file.type === 'image/heic' || 
        file.type === 'image/heif' || 
        file.name.toLowerCase().endsWith('.heic') || 
        file.name.toLowerCase().endsWith('.heif');

    if (isHeicFile) {
        console.log(`[processImage] HEIC/HEIF detected: ${file.name} (${file.type})`);
        
        // Strategy A: heic-converter (Newer, libheif-js based)
        try {
            console.log("[processImage] Attempting heic-converter...");
            const convertModule = await import('heic-converter') as any;
            const convert = convertModule.default || convertModule;
            
            if (typeof convert === 'function') {
                const resultBlob = await convert({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.8
                });
                
                if (resultBlob && resultBlob.size > 0) {
                    currentBlob = resultBlob;
                    isProcessed = true;
                    console.log(`[processImage] heic-converter success: ${(file.size / 1024).toFixed(1)}KB -> ${(currentBlob.size / 1024).toFixed(1)}KB`);
                }
            }
        } catch (err) {
            console.warn("[processImage] heic-converter failed:", err);
        }

        // Strategy B: heic2any (WASM-based conversion)
        if (!isProcessed) {
            try {
                console.log("[processImage] Attempting heic2any conversion...");
                const heicModule = await import('heic2any') as unknown;
                const heic2any = (heicModule as any)?.default || heicModule;
                
                if (typeof heic2any === 'function') {
                    const converted = await (heic2any as any)({
                        blob: file,
                        toType: 'image/jpeg',
                        quality: 0.7
                    });
                    
                    const result = Array.isArray(converted) ? converted[0] : converted;
                    if (result && result.size > 0) {
                        currentBlob = result;
                        isProcessed = true;
                        console.log(`[processImage] heic2any success: ${(file.size / 1024).toFixed(1)}KB -> ${(currentBlob.size / 1024).toFixed(1)}KB`);
                    }
                }
            } catch (err: any) {
                console.error("[processImage] heic2any failed:", err);
            }
        }

        // Strategy C: createImageBitmap (Native fallback for Safari)
        if (!isProcessed && typeof createImageBitmap === 'function') {
            try {
                console.log("[processImage] Attempting native createImageBitmap fallback...");
                const bitmap = await createImageBitmap(file);
                const canvas = document.createElement('canvas');
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(bitmap, 0, 0);
                    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.8));
                    if (blob) {
                        currentBlob = blob;
                        isProcessed = true;
                        console.log(`[processImage] Native conversion success: ${(file.size / 1024).toFixed(1)}KB -> ${(currentBlob.size / 1024).toFixed(1)}KB`);
                    }
                }
                bitmap.close();
            } catch (err) {
                console.warn("[processImage] Native conversion fallback failed:", err);
            }
        }
    }

    // 2. Standard Compression/Resize for large images (> 500KB)
    const type = isProcessed ? 'image/jpeg' : (currentBlob.type || '');
    const isRenderable = type.startsWith('image/') && !type.includes('heic') && !type.includes('heif');
    
    if (!isProcessed && isRenderable && currentBlob.size > 500 * 1024) {
        try {
            console.log(`[processImage] Compressing large image: ${currentBlob.size / 1024}KB`);
            const bitmap = await createImageBitmap(currentBlob);
            const canvas = document.createElement('canvas');
            
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = bitmap.width;
            let height = bitmap.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(bitmap, 0, 0, width, height);
                const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.85));
                if (blob) {
                    currentBlob = blob;
                    isProcessed = true;
                    console.log(`[processImage] Compression success: ${width}x${height}, ${(blob.size / 1024).toFixed(1)}KB`);
                }
            }
            bitmap.close();
        } catch (err) {
            console.warn("[processImage] Compression failed:", err);
        }
    }

    return { blob: currentBlob, isProcessed };
}

export async function uploadToR2(file: File): Promise<UploadResult> {
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  console.log(`Starting upload for ${file.name} (${sizeMB}MB). Type: ${file.type || 'unknown'}`);
  
  // 0. Optional Processing (Images only: HEIC conversion + Compression)
  const { blob: blobToUpload, isProcessed } = await processImage(file);
  
  // Determine final content type & filename
  let contentType = blobToUpload.type;
  let filename = file.name;

  if (isProcessed) {
      contentType = 'image/jpeg';
      // Change extension to .jpg for HEIC/HEIF files or processed images
      if (filename.toLowerCase().match(/\.(heic|heif)$/)) {
          filename = filename.replace(/\.(heic|heif)$/i, '.jpg');
      } else if (!filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.jpeg')) {
          const parts = filename.split('.');
          if (parts.length > 1) parts.pop();
          filename = parts.join('.') + '.jpg';
      }
  }

  // Fallback logic for types if still unknown
  if (!contentType || contentType === 'application/octet-stream') {
      if (filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg')) {
          contentType = 'image/jpeg';
      } else if (filename.toLowerCase().endsWith('.png')) {
          contentType = 'image/png';
      } else {
          contentType = file.type || 'application/octet-stream';
      }
  }

  // Final Safety Check
  const isStillHeic = contentType.includes('heic') || contentType.includes('heif') || filename.toLowerCase().endsWith('.heic') || filename.toLowerCase().endsWith('.heif');
  if (isStillHeic && !isProcessed) {
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (!isSafari) {
          throw new Error("Your browser was unable to convert this HEIC file to JPEG. Please upload a JPG or PNG instead.");
      }
  }

  const isAudio = contentType.startsWith('audio/');

  // 1. Get Presigned URL
  console.log(`[uploadToR2] Requesting presigned URL for ${filename} (${contentType})`);
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: filename,
      contentType: contentType,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to get upload URL: ${response.statusText}`);
  }

  const { url: signedUrl, key } = await response.json();
  console.log("[uploadToR2] Presigned URL received. Starting R2 PUT request...");

  // 2. Upload to R2
  const controller = new AbortController();
  // Audio files get 5 minutes, others 2 minutes
  const timeoutMs = isAudio ? 300000 : 120000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: blobToUpload,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!uploadResponse.ok) {
      throw new Error(`R2 Server Error: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }
    console.log("[uploadToR2] Upload successful.");
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
        const timeStr = isAudio ? "5 minutes" : "2 minutes";
        throw new Error(`Upload timed out after ${timeStr}. This usually happens on slow connections with large files.`);
    }
    console.error("[uploadToR2] Fetch Error:", err);
    throw err;
  }

  // 3. Return Public URL
  const publicUrl = PUBLIC_R2_DOMAIN 
    ? `${PUBLIC_R2_DOMAIN}/${key}` 
    : `https://pub-r2.dev/${key}`; 

  return { url: publicUrl, key };
}

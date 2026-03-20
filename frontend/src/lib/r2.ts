const PUBLIC_R2_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN;

interface UploadResult {
  url: string;
  key: string;
}

/**
 * Normalizes an image file, compressing large images.
 * HEIC/HEIF is explicitly not supported.
 */
async function processImage(file: File): Promise<{ blob: Blob | File, isProcessed: boolean }> {
    // 1. Explicitly block HEIC/HEIF
    const isHeicFile = 
        file.type === 'image/heic' || 
        file.type === 'image/heif' || 
        file.name.toLowerCase().endsWith('.heic') || 
        file.name.toLowerCase().endsWith('.heif');

    if (isHeicFile) {
        throw new Error("HEIC/HEIF images are not supported. Please convert your image to JPG or PNG before uploading.");
    }

    // 2. Standard Compression/Resize for large images (> 500KB)
    const type = file.type || '';
    const isRenderable = type.startsWith('image/') && type !== 'image/svg+xml';
    
    if (isRenderable && file.size > 500 * 1024) {
        try {
            console.log(`[processImage] Compressing large image: ${file.size / 1024}KB`);
            const bitmap = await createImageBitmap(file);
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
                    console.log(`[processImage] Compression success: ${width}x${height}, ${(blob.size / 1024).toFixed(1)}KB`);
                    bitmap.close();
                    return { blob, isProcessed: true };
                }
            }
            bitmap.close();
        } catch (err) {
            console.warn("[processImage] Compression failed:", err);
        }
    }

    return { blob: file, isProcessed: false };
}

export async function uploadToR2(file: File): Promise<UploadResult> {
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  console.log(`Starting upload for ${file.name} (${sizeMB}MB). Type: ${file.type || 'unknown'}`);
  
  // 0. Optional Processing (Images only: Compression)
  const { blob: blobToUpload, isProcessed } = await processImage(file);
  
  // Determine final content type & filename
  let contentType = blobToUpload.type;
  let filename = file.name;

  if (isProcessed) {
      contentType = 'image/jpeg';
      // If we forced it to jpeg via canvas, ensure extension matches
      if (!filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.jpeg')) {
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
      } else if (filename.toLowerCase().endsWith('.webp')) {
          contentType = 'image/webp';
      } else {
          contentType = file.type || 'application/octet-stream';
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
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const publicUrl = PUBLIC_R2_DOMAIN 
    ? `${PUBLIC_R2_DOMAIN}/${encodedKey}` 
    : `https://pub-r2.dev/${encodedKey}`; 

  return { url: publicUrl, key };
}

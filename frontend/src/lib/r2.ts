const PUBLIC_R2_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN;

interface UploadResult {
  url: string;
  key: string;
}

/**
 * Normalizes an image file, converting HEIC/HEIF to JPEG and compressing large images.
 */
async function processImage(file: File): Promise<Blob | File> {
    let currentBlob: Blob | File = file;
    let isHeic = false;

    // 1. Handle HEIC/HEIF Conversion
    const isHeicFile = 
        file.type === 'image/heic' || 
        file.type === 'image/heif' || 
        file.name.toLowerCase().endsWith('.heic') || 
        file.name.toLowerCase().endsWith('.heif');

    if (isHeicFile) {
        try {
            console.log("Converting HEIC to JPEG (Lazy loading converter)...");
            // Dynamic import for large package
            const heicModule = await import('heic2any');
            const heic2any = heicModule.default;
            
            const converted = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.85
            });
            currentBlob = Array.isArray(converted) ? converted[0] : converted;
            isHeic = true;
            console.log(`HEIC Conversion successful: ${(file.size / 1024).toFixed(1)}KB -> ${(currentBlob.size / 1024).toFixed(1)}KB`);
        } catch (err) {
            console.warn("HEIC conversion failed, attempting normal compression", err);
        }
    }

    // 2. Compression for large images (> 500KB)
    // If it's HEIC, we've already "compressed" it via heic2any quality setting
    // If it's not an image or it's small, skip
    const type = isHeic ? 'image/jpeg' : (currentBlob.type || '');
    if (!isHeic && (!type.startsWith('image/') || currentBlob.size < 500 * 1024)) {
        return currentBlob;
    }

    // If it was HEIC, we don't need further canvas-based compression unless we want to resize
    // For now, let's keep the logic simple: HEIC -> JPEG (done), then if still too big or needs resize:
    
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(currentBlob);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
                let width = img.width;
                let height = img.height;

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
                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        console.log(`Image processed: ${(currentBlob.size / 1024).toFixed(1)}KB -> ${(blob.size / 1024).toFixed(1)}KB`);
                        resolve(blob);
                    } else {
                        resolve(currentBlob);
                    }
                }, 'image/jpeg', 0.85);
            };
            img.onerror = () => resolve(currentBlob);
        };
        reader.onerror = () => resolve(currentBlob);
    });
}

export async function uploadToR2(file: File): Promise<UploadResult> {
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  console.log(`Starting upload for ${file.name} (${sizeMB}MB). Type: ${file.type || 'unknown'}`);
  
  // 0. Optional Processing (Images only: HEIC conversion + Compression)
  const blobToUpload = await processImage(file);
  
  // Determine final content type
  let contentType = blobToUpload.type;
  if (!contentType || contentType === 'application/octet-stream') {
      // Fallback logic for types
      if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
          contentType = 'image/jpeg'; // Since we processed it
      } else if (file.type.startsWith('image/') || (blobToUpload instanceof Blob && !(blobToUpload instanceof File))) {
          contentType = 'image/jpeg';
      } else {
          contentType = file.type || 'application/octet-stream';
      }
  }

  const isAudio = contentType.startsWith('audio/');

  // 1. Get Presigned URL
  console.log("Fetching presigned URL from API...");
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: contentType,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to get upload URL: ${response.statusText}`);
  }

  const { url: signedUrl, key } = await response.json();
  console.log("Presigned URL received. Starting R2 PUT request...");

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
    console.log("Upload to R2 successful.");
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
        const timeStr = isAudio ? "5 minutes" : "2 minutes";
        throw new Error(`Upload timed out after ${timeStr}. This usually happens on slow connections with large files.`);
    }
    console.error("Fetch Error during R2 upload:", err);
    throw err;
  }

  // 3. Return Public URL
  const publicUrl = PUBLIC_R2_DOMAIN 
    ? `${PUBLIC_R2_DOMAIN}/${key}` 
    : `https://pub-r2.dev/${key}`; 

  return { url: publicUrl, key };
}

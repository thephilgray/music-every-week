const PUBLIC_R2_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN;

interface UploadResult {
  url: string;
  key: string;
}

async function compressImage(file: File): Promise<Blob | File> {
    // Only compress images that are large (> 500KB)
    if (!file.type.startsWith('image/') || file.size < 500 * 1024) {
        return file;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
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
                        console.log(`Image compressed: ${(file.size / 1024).toFixed(1)}KB -> ${(blob.size / 1024).toFixed(1)}KB`);
                        resolve(blob);
                    } else {
                        resolve(file);
                    }
                }, 'image/jpeg', 0.85); // Compress to JPEG for better size
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
}

export async function uploadToR2(file: File): Promise<UploadResult> {
  const isAudio = file.type.startsWith('audio/');
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  console.log(`Starting upload for ${file.name} (${sizeMB}MB). Type: ${file.type}`);
  
  // 0. Optional Compression (Images only)
  const blobToUpload = await compressImage(file);
  const contentType = blobToUpload instanceof File ? blobToUpload.type : (file.type.startsWith('image/') ? 'image/jpeg' : file.type);

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
  } catch (err: any) {
    if (err.name === 'AbortError') {
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

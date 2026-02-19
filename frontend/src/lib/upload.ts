import SEA from 'gun/sea';

const RELAY_URL = import.meta.env.VITE_RELAY_URL || 'http://localhost:8080';
const RELAY_API = `${RELAY_URL}/api`;

// Use environment variable or fallback to placeholder (which will break if not set)
const PUBLIC_R2_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN || 'https://pub-your-r2-domain.r2.dev'; 

interface UploadResult {
  url: string; // The public URL to access the file
  key: string; // The storage key
}

export async function uploadFile(file: File, userPair: { pub: string, priv: string }): Promise<UploadResult> {
  // Check if file is HEIC/HEIF
  if (file.type.toLowerCase().includes('heic') || file.type.toLowerCase().includes('heif') || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
      throw new Error("HEIC/HEIF images are not supported. Please convert to JPG or PNG before uploading.");
  }

  // Check if userPair is valid BEFORE attempting to use it
  if (!userPair || !userPair.pub || !userPair.priv) {
    throw new Error("Authentication required for upload: Invalid user pair (missing pub or priv key). Please refresh and try again.");
  }

  // 1. Prepare Auth Headers
  const timestamp = Date.now();
  const data = { timestamp };
  console.log("Signing data:", data, "with pub:", userPair.pub);
  // Use the provided userPair directly
  const proof = await SEA.sign(data, userPair);
  const pub = userPair.pub;

  // Helper to determine mime type
  const getMimeType = (name: string, type: string) => {
    if (type && type !== 'application/octet-stream') return type;
    const ext = name.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'm4a': 'audio/mp4',
      'aac': 'audio/aac',
      'webm': 'audio/webm',
      'mp4': 'audio/mp4',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
    };
    return (ext && map[ext]) || 'application/octet-stream';
  };

  const finalContentType = getMimeType(file.name, file.type);

  // 2. Get Presigned URL
  const params = new URLSearchParams({
    filename: file.name,
    contentType: finalContentType,
  });

  console.log('Get Presigned URL', params);
  const response = await fetch(`${RELAY_API}/upload-url?${params.toString()}`, {
      headers: {
          'X-Pub': pub,
          'X-Proof': proof,
          'X-Timestamp': timestamp.toString()
      }
  });
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get upload URL');
  }

  const { url: signedUrl, key } = await response.json();

  // 3. Upload File to R2
  console.log('Upload file to R2 with type:', finalContentType);
  const uploadResponse = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': finalContentType,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file to R2');
  }

  // 4. Return Public URL
  // Encode key components to handle spaces/special chars safely in URL (fixes Safari issues)
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return {
    url: `${PUBLIC_R2_DOMAIN}/${encodedKey}`,
    key
  };
}
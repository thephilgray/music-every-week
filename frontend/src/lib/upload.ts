
import SEA from 'gun/sea';

const RELAY_API = 'http://localhost:8080/api';

// Use environment variable or fallback to placeholder (which will break if not set)
const PUBLIC_R2_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN || 'https://pub-your-r2-domain.r2.dev'; 

interface UploadResult {
  url: string; // The public URL to access the file
  key: string; // The storage key
}

export async function uploadFile(file: File, userPair: any): Promise<UploadResult> {
  if (!userPair) throw new Error("Authentication required for upload");

  // 1. Prepare Auth Headers
  const timestamp = Date.now();
  const data = { timestamp };
  const proof = await SEA.sign(data, userPair);
  const pub = userPair.pub;

  // 2. Get Presigned URL
  const params = new URLSearchParams({
    filename: file.name,
    contentType: file.type,
  });

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
  const uploadResponse = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file to R2');
  }

  // 4. Return Public URL
  return {
    url: `${PUBLIC_R2_DOMAIN}/${key}`,
    key
  };
}

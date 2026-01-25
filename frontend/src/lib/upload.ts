
const RELAY_API = 'http://localhost:8080/api';

// TODO: Set this in .env
const PUBLIC_R2_DOMAIN = 'https://pub-your-r2-domain.r2.dev'; 

interface UploadResult {
  url: string; // The public URL to access the file
  key: string; // The storage key
}

export async function uploadFile(file: File): Promise<UploadResult> {
  // 1. Get Presigned URL
  const params = new URLSearchParams({
    filename: file.name,
    contentType: file.type,
  });

  const response = await fetch(`${RELAY_API}/upload-url?${params.toString()}`);
  
  if (!response.ok) {
    throw new Error('Failed to get upload URL');
  }

  const { url: signedUrl, key } = await response.json();

  // 2. Upload File to R2
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

  // 3. Return Public URL
  // Note: If you have a custom domain mapped to your R2 bucket, use it here.
  // Otherwise, you might need to use the worker or public R2.dev URL.
  return {
    url: `${PUBLIC_R2_DOMAIN}/${key}`,
    key
  };
}

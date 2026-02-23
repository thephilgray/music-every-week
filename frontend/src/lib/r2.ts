const PUBLIC_R2_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN;

interface UploadResult {
  url: string;
  key: string;
}

export async function uploadToR2(file: File): Promise<UploadResult> {
  // 1. Get Presigned URL
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to get upload URL');
  }

  const { url: signedUrl, key } = await response.json();

  // 2. Upload to R2
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
  // Ensure we use the configured public domain
  const publicUrl = PUBLIC_R2_DOMAIN 
    ? `${PUBLIC_R2_DOMAIN}/${key}` 
    : `https://pub-r2.dev/${key}`; // Fallback or break if not set

  return { url: publicUrl, key };
}

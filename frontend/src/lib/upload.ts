
import SEA from 'gun/sea';

const RELAY_URL = import.meta.env.VITE_RELAY_URL || 'http://localhost:8080';
const RELAY_API = `${RELAY_URL}/api`;

// Use environment variable or fallback to placeholder (which will break if not set)
const PUBLIC_R2_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN || 'https://pub-your-r2-domain.r2.dev'; 

interface UploadResult {
  url: string; // The public URL to access the file
  key: string; // The storage key
}

export async function uploadFile(file: File, userPair: any): Promise<UploadResult> {
  if (!userPair) throw new Error("Authentication required for upload: No user pair found.");

  // Fallback: Try to recover keys from sessionStorage if 'priv' is missing
  let activePair = userPair;
  if (!activePair.priv) {
      console.warn("Private key missing in memory. Attempting recovery from sessionStorage...");
      try {
          // Iterate all keys to find the session
          for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key) {
                  const val = sessionStorage.getItem(key);
                  if (val) {
                      try {
                          const parsed = JSON.parse(val);
                          // Check if this session matches our pub key AND has a private key
                          if (parsed && parsed.sea && parsed.sea.pub === activePair.pub && parsed.sea.priv) {
                              activePair = parsed.sea;
                              break;
                          }
                          // Sometimes stored directly
                          if (parsed && parsed.pub === activePair.pub && parsed.priv) {
                              activePair = parsed;
                              break;
                          }
                      } catch (e) {
                          // Not JSON, skip
                      }
                  }
              }
          }
      } catch (e) {
          console.error("Failed to recover keys", e);
      }
  }

  if (!activePair.pub || !activePair.priv) {
      console.error("Invalid User Pair:", activePair);
      throw new Error("Authentication error: Session is read-only (missing private key). Please Log Out and Log In again to fix this.");
  }

  // Debug Key Quality
  if (typeof activePair.priv !== 'string') {
      console.warn("Private key is not a string!", activePair.priv);
  } else {
      // Check for non-Latin1 chars in priv key which might crash SEA
      // eslint-disable-next-line no-control-regex
      if (/[^\x00-\x7F]/.test(activePair.priv)) {
          console.error("CRITICAL: Private key contains invalid characters (non-Latin1). This will crash SEA.", activePair.priv.replace(/./g, '*'));
          throw new Error("Critical Auth Error: Your private key appears corrupted. Please clear cache/storage and login again.");
      }
  }

  // 1. Prepare Auth Headers
  const timestamp = Date.now();
  const data = { timestamp };
  
  let proof;
  try {
      proof = await SEA.sign(data, activePair);
  } catch (err: any) {
      console.error("SEA.sign failed:", err);
      // Fallback: Check if SEA is available globally or differently
      throw new Error(`Signing failed: ${err.message || err}`);
  }
  const pub = activePair.pub;

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

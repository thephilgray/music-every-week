import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

const S3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  console.log(`[Upload API] START - Method: ${req.method}`);
  
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // Robust body parsing for Vercel Node runtime
    let body = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            console.error('[Upload API] Failed to parse body string', e);
        }
    }

    const { filename, contentType } = body || {};
    console.log(`[Upload API] Received: filename="${filename}", contentType="${contentType}"`);

    if (!filename || !contentType) {
        console.error('[Upload API] Error: Missing filename or contentType', { body });
        return res.status(400).send('Missing filename or contentType');
    }

    const key = `authless/${Date.now()}_${filename.replace(/\s+/g, '_')}`;
    console.log(`[Upload API] Generated Key: "${key}"`);
    
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    console.log('[Upload API] Requesting Presigned URL from S3/R2...');
    const url = await getSignedUrl(S3, command, { expiresIn: 3600 });
    
    const duration = Date.now() - startTime;
    console.log(`[Upload API] SUCCESS - Presigned URL generated in ${duration}ms`);

    return res.status(200).json({ url, key });
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    console.error(`[Upload API] ERROR after ${duration}ms:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
}

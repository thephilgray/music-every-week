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
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
        return res.status(400).send('Missing filename or contentType');
    }

    const key = `authless/${Date.now()}_${filename.replace(/\s+/g, '_')}`;
    
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(S3, command, { expiresIn: 3600 });

    return res.status(200).json({ url, key });
  } catch (error: unknown) {
    console.error("Upload Error", error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
}

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
        return new Response('Missing filename or contentType', { status: 400 });
    }

    const key = `authless/${Date.now()}_${filename.replace(/\s+/g, '_')}`;
    
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(S3, command, { expiresIn: 3600 });

    return new Response(JSON.stringify({ url, key }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error("Upload Error", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

require('dotenv').config();
const { S3Client, HeadObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  console.error('Error: Missing R2 environment variables. Please check your .env file.');
  process.exit(1);
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const MIME_MAP = {
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'm4a': 'audio/mp4',
  'aac': 'audio/aac',
  'webm': 'audio/webm',
  'mp4': 'video/mp4',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
};

async function fixSingleFile(key) {
  if (!key) {
    console.error('Please provide a filename (key) as an argument.');
    console.error('Usage: node fix-single-file.js <filename>');
    process.exit(1);
  }

  // Remove any leading slash if present
  if (key.startsWith('/')) key = key.substring(1);

  const ext = key.split('.').pop()?.toLowerCase();
  if (!ext || !MIME_MAP[ext]) {
    console.error(`Error: Could not determine MIME type for extension ".${ext}"`);
    process.exit(1);
  }

  const expectedType = MIME_MAP[ext];
  console.log(`Checking file: ${key}`);
  console.log(`Target Content-Type: ${expectedType}`);

  try {
    const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    console.log(`Current Content-Type: ${head.ContentType}`);

    if (head.ContentType === expectedType) {
        console.log('Content-Type is already correct. No changes needed.');
        // return; // Optional: Force update anyway if desired, but usually not needed
    }

    console.log('Updating Content-Type...');
    await s3Client.send(new CopyObjectCommand({
        Bucket: bucketName,
        CopySource: `${bucketName}/${key}`,
        Key: key,
        ContentType: expectedType,
        MetadataDirective: 'REPLACE',
    }));
    console.log('Success! File updated.');

  } catch (err) {
    console.error('Error:', err.message);
  }
}

const filename = process.argv[2];
fixSingleFile(filename);

require('dotenv').config();
const { S3Client, ListObjectsV2Command, HeadObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');

// Configuration
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
  'mp4': 'video/mp4', // Usually video, but safe default
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
};

async function fixContentTypes() {
  console.log(`Starting Content-Type fix for bucket: ${bucketName}`);
  
  let continuationToken = undefined;
  let processedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      ContinuationToken: continuationToken,
    });

    try {
      const response = await s3Client.send(command);
      const contents = response.Contents || [];

      for (const object of contents) {
        processedCount++;
        const key = object.Key;
        const ext = key.split('.').pop()?.toLowerCase();
        
        if (!ext || !MIME_MAP[ext]) {
          console.log(`Skipping (unknown extension): ${key}`);
          continue;
        }

        const expectedType = MIME_MAP[ext];

        try {
          // Check current Content-Type
          const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
          const currentType = head.ContentType;

          if (currentType !== expectedType) {
            console.log(`Fixing ${key}: ${currentType} -> ${expectedType}`);
            
            // Copy object to itself to update metadata
            await s3Client.send(new CopyObjectCommand({
              Bucket: bucketName,
              CopySource: `${bucketName}/${key}`, // CopySource must be bucket/key
              Key: key,
              ContentType: expectedType,
              MetadataDirective: 'REPLACE',
            }));
            updatedCount++;
          } else {
            // console.log(`Skipping (correct): ${key}`);
          }
        } catch (err) {
          console.error(`Error processing ${key}:`, err.message);
          errorCount++;
        }
      }

      continuationToken = response.NextContinuationToken;

    } catch (err) {
      console.error('Error listing objects:', err);
      break;
    }
  } while (continuationToken);

  console.log('-----------------------------------');
  console.log(`Finished.`);
  console.log(`Processed: ${processedCount}`);
  console.log(`Updated:   ${updatedCount}`);
  console.log(`Errors:    ${errorCount}`);
}

fixContentTypes();

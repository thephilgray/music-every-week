require('dotenv').config();
const express = require('express');
const Gun = require('gun');
const path = require('path');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(Gun.serve);

// R2 / S3 Client Setup
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

app.get('/api/upload-url', async (req, res) => {
  try {
    const { filename, contentType } = req.query;
    
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'Missing filename or contentType' });
    }

    // In a production app, verify the user's Gun/SEA signature here
    // to ensure they have permission to upload.

    const key = `uploads/${Date.now()}-${filename}`;
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(r2, command, { expiresIn: 3600 });

    res.json({ url, key });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

const server = app.listen(port, () => {
  console.log(`MEW2 Relay listening on port ${port}`);
});

// Configure Gun
// If GCS is mounted at /data, we want Gun to write there.
// We use 'radata' file for persistence.
const gun = Gun({ 
  web: server,
  file: process.env.GUN_FILE || '/data/radata' 
});

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

console.log('GunDB Relay initialized.');

require('dotenv').config();
const express = require('express');
const Gun = require('gun');
const path = require('path');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const SEA = require('gun/sea');

const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: '*', // For development, allow all. In prod, lock this down.
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-pub', 'x-proof', 'x-timestamp']
}));

// Initialize R2 Client
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
    const pub = req.headers['x-pub'];
    const proof = req.headers['x-proof'];
    const timestamp = req.headers['x-timestamp'];
    
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'Missing filename or contentType' });
    }

    // Auth Check
    if (!pub || !proof || !timestamp) {
         return res.status(401).json({ error: 'Missing authentication headers' });
    }

    // 1. Check timestamp freshness (5 min window)
    const now = Date.now();
    if (Math.abs(now - parseInt(timestamp)) > 300000) {
        return res.status(401).json({ error: 'Request expired' });
    }

    // 2. Verify Signature
    const data = { timestamp: parseInt(timestamp) };
    const verified = await SEA.verify(proof, pub);
    
    if (!verified || verified.timestamp !== data.timestamp) {
         return res.status(403).json({ error: 'Invalid signature' });
    }

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

const PORT = process.env.PORT || 8765;
const server = app.listen(PORT, () => {
  console.log(`MEW2 Relay listening on port ${PORT}`);
});

// Configure Gun
const gun = Gun({ 
  web: server,
  file: process.env.GUN_FILE || 'radata' 
});

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

console.log('GunDB Relay initialized.');
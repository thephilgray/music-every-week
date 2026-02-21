require('dotenv').config();
const express = require('express');
const Gun = require('gun');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const SEA = require('gun/sea');

const app = express();

// 1. CORS Configuration - Most permissive for dev
app.use(cors({
    origin: true, // Allow any origin
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Pub', 'X-Proof', 'X-Timestamp', 'x-pub', 'x-proof', 'x-timestamp']
}));

// 2. Explicit Preflight Handling
app.options('*', cors());

// Initialize R2 Client
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Logging Middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

app.get('/api/upload-url', async (req, res) => {
  console.log('Received upload-url request');
  try {
    const { filename, contentType } = req.query;
    // Headers are lowercased by Express automatically
    const pub = req.headers['x-pub'];
    const proof = req.headers['x-proof'];
    const timestamp = req.headers['x-timestamp'];
    
    if (!filename || !contentType) {
      console.error('Missing filename or contentType');
      return res.status(400).json({ error: 'Missing filename or contentType' });
    }

    // Auth Check
    if (!pub || !proof || !timestamp) {
         console.error('Missing auth headers', { pub, proof, timestamp });
         return res.status(401).json({ error: 'Missing authentication headers' });
    }

    // 1. Check timestamp freshness (15 min window to allow for clock drift)
    const now = Date.now();
    if (Math.abs(now - parseInt(timestamp)) > 900000) {
        console.error('Request expired');
        return res.status(401).json({ error: 'Request expired' });
    }

    // 2. Verify Signature
    const data = { timestamp: parseInt(timestamp) };
    console.log('Verifying Auth:', { pub, timestamp: data.timestamp });
    
    const verified = await SEA.verify(proof, pub);
    console.log('SEA.verify result:', typeof verified, verified);
    
    if (!verified || verified.timestamp !== data.timestamp) {
         console.error('Invalid signature. Verified:', verified, 'Expected:', data);
         return res.status(403).json({ error: 'Invalid signature' });
    }

    const key = `uploads/${Date.now()}-${filename}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(r2, command, { expiresIn: 3600 });
    console.log('Generated signed URL for:', key);

    res.json({ url, key });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Root route for health check
app.get('/', (req, res) => {
    res.send('MEW2 Relay Active');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const path = require('path');

// ... (rest of imports)

const PORT = process.env.PORT || 8765;
const server = app.listen(PORT, () => {
  console.log(`MEW2 Relay listening on port ${PORT}`);
});

// Configure Gun
// Enforce absolute path to avoid FUSE/CWD ambiguity
// Default to /data/radata which matches the Cloud Run GCS Mount
const dbFile = process.env.GUN_FILE ? path.resolve(process.env.GUN_FILE) : '/data/radata';

console.log(`GunDB Storage Path: ${dbFile}`);

const gun = Gun({ 
  web: server,
  file: dbFile
});

console.log('GunDB Relay initialized.');

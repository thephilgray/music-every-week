import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { IncomingMessage, ServerResponse } from 'http'

// Plugin to serve /api/upload locally
const localUploadPlugin = () => ({
  name: 'configure-server',
  configureServer(server: any) {
    server.middlewares.use('/api/upload', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      const env = loadEnv('development', process.cwd(), '');
      
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          const { filename, contentType } = body;

          if (!filename || !contentType) {
            res.statusCode = 400;
            res.end('Missing filename or contentType');
            return;
          }

          const S3 = new S3Client({
            region: 'auto',
            endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
              accessKeyId: env.R2_ACCESS_KEY_ID,
              secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            },
          });

          const key = `authless/${Date.now()}_${filename.replace(/\s+/g, '_')}`;
          const command = new PutObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
            ContentType: contentType,
          });

          const url = await getSignedUrl(S3, command, { expiresIn: 3600 });

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ url, key }));
        } catch (err: any) {
          console.error('Local Upload Error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localUploadPlugin(),
  ],
  server: {
    host: true, // Expose to network (for mobile testing)
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1000, // Optional: bump limit if you prefer single file
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-gun': ['gun', 'gun/sea', 'gun/gun'],
          'vendor-utils': ['buffer', 'lucide-react'],
        }
      }
    }
  }
})
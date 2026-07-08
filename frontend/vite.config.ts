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

// Plugin to serve /api/bug-report locally during Vite dev
const localBugReportPlugin = () => ({
  name: 'configure-bug-report-server',
  configureServer(server: any) {
    server.middlewares.use('/api/bug-report', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
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
          const { title, description, diagnostics, screenshotUrl, reporter } = body;

          if (!description) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Description is required' }));
            return;
          }

          const token = env.GITHUB_TOKEN || env.GITHUB_PAT || env.GITHUB_BUG_REPORT_TOKEN;
          const rawRepoUrl = env.VITE_GITHUB_REPO_URL || env.GITHUB_REPO;

          if (!rawRepoUrl) {
            console.error('[Local Bug Report] Error: VITE_GITHUB_REPO_URL environment variable is not configured.');
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Server configuration error: VITE_GITHUB_REPO_URL is not set.' }));
            return;
          }

          const repo = rawRepoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '');
          const repoUrl = `https://github.com/${repo}`;
          const issueTitle = title || `[Bug]: ${description.substring(0, 60)}${description.length > 60 ? '...' : ''}`;
          const issueBody = `### Bug Description\n${description}\n\n### Reporter\n${reporter || 'Anonymous'}\n\n### Diagnostics\n\`\`\`\n${diagnostics || 'N/A'}\n\`\`\`\n\n${screenshotUrl ? `### Screenshot\n![Screenshot](${screenshotUrl})\n` : ''}`;

          if (!token) {
            console.log('[Local Bug Report] No GITHUB_TOKEN configured in .env. Returning fallback URL.');
            const fallbackUrl = `${repoUrl}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;
            res.statusCode = 501;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'GitHub token not configured on server.', fallbackUrl }));
            return;
          }

          console.log(`[Local Bug Report] Creating issue on GitHub repo: ${repo}`);
          const githubRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify({
              title: issueTitle,
              body: issueBody,
              labels: ['bug', 'user-reported']
            })
          });

          if (!githubRes.ok) {
            const errText = await githubRes.text();
            console.error('[Local Bug Report] GitHub API Error:', githubRes.status, errText);
            const fallbackUrl = `${repoUrl}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;
            res.statusCode = githubRes.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `GitHub API error: ${githubRes.statusText}`, fallbackUrl }));
            return;
          }

          const issueData: any = await githubRes.json();
          console.log(`[Local Bug Report] Issue created successfully: #${issueData.number}`);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, issueUrl: issueData.html_url, issueNumber: issueData.number }));
        } catch (err: any) {
          console.error('Local Bug Report Error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
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
    localBugReportPlugin(),
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
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-utils': ['buffer', 'lucide-react'],
        }
      }
    }
  }
})
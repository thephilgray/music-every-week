import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error('[Bug Report API] Failed to parse body string', e);
      }
    }

    const { title, description, diagnostics, screenshotUrl, reporter } = body || {};

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    // Support multiple common env var names for the GitHub token
    const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GITHUB_BUG_REPORT_TOKEN;
    const rawRepoUrl = process.env.VITE_GITHUB_REPO_URL || process.env.GITHUB_REPO;

    if (!rawRepoUrl) {
      console.error('[Bug Report API] Error: VITE_GITHUB_REPO_URL environment variable is not configured.');
      return res.status(500).json({ error: 'Server configuration error: VITE_GITHUB_REPO_URL is not set.' });
    }

    const repo = rawRepoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '');
    const repoUrl = `https://github.com/${repo}`;

    const issueTitle = title || `[Bug]: ${description.substring(0, 60)}${description.length > 60 ? '...' : ''}`;
    const issueBody = `### Bug Description\n${description}\n\n### Reporter\n${reporter || 'Anonymous'}\n\n### Diagnostics\n\`\`\`\n${diagnostics || 'N/A'}\n\`\`\`\n\n${screenshotUrl ? `### Screenshot\n![Screenshot](${screenshotUrl})\n` : ''}`;

    // If no server token is configured, return 501 so the client can fall back to browser tab opening
    if (!token) {
      console.log('[Bug Report API] No GITHUB_TOKEN configured. Returning fallback URL.');
      const fallbackUrl = `${repoUrl}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;
      return res.status(501).json({ 
        error: 'GitHub token not configured on server.',
        fallbackUrl
      });
    }

    console.log(`[Bug Report API] Creating issue on GitHub repo: ${repo}`);
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
      console.error('[Bug Report API] GitHub API Error:', githubRes.status, errText);
      
      const fallbackUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;
      return res.status(githubRes.status).json({ 
        error: `GitHub API error: ${githubRes.statusText}`,
        fallbackUrl 
      });
    }

    const issueData = await githubRes.json();
    console.log(`[Bug Report API] Issue created successfully: #${issueData.number}`);
    
    return res.status(200).json({ 
      success: true, 
      issueUrl: issueData.html_url, 
      issueNumber: issueData.number 
    });

  } catch (err: unknown) {
    console.error('[Bug Report API] Server Error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}

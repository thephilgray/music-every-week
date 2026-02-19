// Use environment variable or fallback to empty string
const PUBLIC_R2_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN || '';

/**
 * Fixes URLs that might have been saved with the placeholder domain.
 * Replaces 'https://pub-your-r2-domain.r2.dev' with the actual VITE_R2_PUBLIC_DOMAIN.
 */
export function fixUrl(url: string | undefined | null): string {
    if (!url) return '';
    
    // Check for the placeholder domain used during development/testing
    if (url.includes('pub-your-r2-domain.r2.dev') && PUBLIC_R2_DOMAIN) {
        return url.replace('https://pub-your-r2-domain.r2.dev', PUBLIC_R2_DOMAIN);
    }
    
    return url;
}

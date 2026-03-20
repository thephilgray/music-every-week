// Use environment variable or fallback to empty string
const PUBLIC_R2_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN || '';

/**
 * Fixes URLs that might have been saved with the placeholder domain.
 * Replaces 'https://pub-your-r2-domain.r2.dev' with the actual VITE_R2_PUBLIC_DOMAIN.
 */
export function fixUrl(url: string | undefined | null): string {
    if (!url) return '';
    
    let processedUrl = url;
    // 1. Check for the placeholder domain used during development/testing
    if (url.includes('pub-your-r2-domain.r2.dev') && PUBLIC_R2_DOMAIN) {
        processedUrl = url.replace('https://pub-your-r2-domain.r2.dev', PUBLIC_R2_DOMAIN);
    }
    
    // 2. Fix unencoded R2 URLs (handle spaces and # which break browser fetching)
    // Only apply if it's an R2 URL and has problematic characters
    if (processedUrl.includes('.r2.dev/') && (processedUrl.includes(' ') || processedUrl.includes('#'))) {
        // Encode spaces as %20 and # as %23
        // We do this manually rather than using encodeURI to ensure # is handled (encodeURI skips #)
        processedUrl = processedUrl.replace(/ /g, '%20').replace(/#/g, '%23');
    }
    
    return processedUrl;
}

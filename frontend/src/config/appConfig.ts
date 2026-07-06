// frontend/src/config/appConfig.ts

const APP_MODE = import.meta.env.VITE_APP_MODE || 'MEW';

export interface BrandConfig {
    name: string;          // e.g. "Music Every Week"
    shortName: string;     // e.g. "MEW"
    logoUrl: string;       // e.g. "/mewlogo.png"
    supportEmail: string;  // e.g. "support@example.com"
    tagline: string;       // e.g. "A music community and songwriting accountability group."
}

const PRESETS: Record<string, Partial<BrandConfig>> = {
    MEW: {
        name: 'Music Every Week',
        shortName: 'MEW',
        logoUrl: '/mewlogo.png',
        supportEmail: 'support@example.com',
        tagline: 'A music community and songwriting accountability group active since November 2019.'
    },
    DEMO: {
        name: 'Songwriting Club Demo',
        shortName: 'CLUB',
        logoUrl: '/mewlogo.png',
        supportEmail: 'support@example.com',
        tagline: 'An open collaborative music production platform for creative songwriting communities.'
    }
};

const preset = PRESETS[APP_MODE] || PRESETS.MEW;

export const BRAND_INFO: BrandConfig = {
    name: import.meta.env.VITE_BRAND_NAME || preset.name || 'Music Every Week',
    shortName: import.meta.env.VITE_BRAND_SHORT_NAME || preset.shortName || 'MEW',
    logoUrl: import.meta.env.VITE_BRAND_LOGO_URL || preset.logoUrl || '/mewlogo.png',
    supportEmail: import.meta.env.VITE_BRAND_SUPPORT_EMAIL || preset.supportEmail || 'support@example.com',
    tagline: import.meta.env.VITE_BRAND_TAGLINE || preset.tagline || 'A collaborative music community and songwriting accountability group.',
};
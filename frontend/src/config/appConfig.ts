// frontend/src/config/appConfig.ts

const APP_MODE = import.meta.env.VITE_APP_MODE || 'MEW';

interface AppConfig {
    scope: string;
    name: string;
    logoUrl?: string;
}

const CONFIG: Record<string, AppConfig> = {
    MEW: {
        scope: 'mew_v1_production',
        name: 'Music Every Week',
    },
    TRACKPEER: {
        scope: 'trackpeer_v1', // Placeholder for future use
        name: 'TrackPeer',
    }
};

const currentConfig = CONFIG[APP_MODE] || CONFIG.MEW;

export const APP_SCOPE = currentConfig.scope;
export const BRAND_INFO = {
    name: currentConfig.name,
    logoUrl: currentConfig.logoUrl,
};

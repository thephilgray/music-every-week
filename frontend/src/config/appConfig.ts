// frontend/src/config/appConfig.ts

const APP_MODE = import.meta.env.VITE_APP_MODE || 'MEW';

interface AppConfig {
    name: string;
    logoUrl?: string;
}

const CONFIG: Record<string, AppConfig> = {
    MEW: {
        name: 'Music Every Week',
    },
    TRACKPEER: {
        name: 'TrackPeer',
    }
};

const currentConfig = CONFIG[APP_MODE] || CONFIG.MEW;

export const BRAND_INFO = {
    name: currentConfig.name,
    logoUrl: currentConfig.logoUrl,
};
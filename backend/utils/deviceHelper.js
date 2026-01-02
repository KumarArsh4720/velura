import crypto from 'crypto';
import geoip from 'geoip-lite';

export const generateDeviceId = (req) => {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection.remoteAddress;
    return crypto
        .createHash('md5')
        .update(`${userAgent}:${ip}`)
        .digest('hex');
};

export const detectDeviceType = (req) => {
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.includes('Mobile')) return 'mobile';
    if (userAgent.includes('Tablet')) return 'tablet';
    if (userAgent.includes('TV') || userAgent.includes('SmartTV')) return 'tv';
    return 'computer';
};

export const generateDeviceName = (req) => {
    const userAgent = req.headers['user-agent'] || '';
    const browser = getBrowser(userAgent);
    const os = getOS(userAgent);
    return `${browser} on ${os}`;
};

export const getBrowser = (userAgent) => {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    return 'Unknown Browser';
};

export const getOS = (userAgent) => {
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS') || userAgent.includes('iPhone')) return 'iOS';
    return 'Unknown OS';
};

export const getLocationFromIP = async (ip) => {
    try {
        const geo = geoip.lookup(ip);
        if (geo && geo.city && geo.country) {
            return `${geo.city}, ${geo.country}`;
        }
        return 'Unknown Location';
    } catch (error) {
        return 'Unknown Location';
    }
};

export const formatLastActive = (date) => {
    if (!date) return 'Unknown';
    const now = new Date();
    const lastActive = new Date(date);
    const diffMinutes = Math.floor((now - lastActive) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hour${Math.floor(diffMinutes / 60) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffMinutes / 1440)} day${Math.floor(diffMinutes / 1440) > 1 ? 's' : ''} ago`;
};
import crypto from 'crypto';
import geoip from 'geoip-lite';
import User from '../models/User.js';

export const generateDeviceId = (userAgent, ip) => {
    return crypto
        .createHash('md5')
        .update(`${userAgent}:${ip}`)
        .digest('hex');
};

export const getDeviceInfo = (req) => {
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ip = req.ip || req.connection.remoteAddress;
    const deviceId = generateDeviceId(userAgent, ip);
    
    // Parse user agent for device type
    let deviceType = 'computer';
    let browser = 'Unknown';
    let os = 'Unknown';
    
    if (userAgent.includes('Mobile')) {
        deviceType = 'mobile';
    } else if (userAgent.includes('Tablet')) {
        deviceType = 'tablet';
    } else if (userAgent.includes('TV') || userAgent.includes('SmartTV')) {
        deviceType = 'tv';
    }
    
    // Simple browser detection
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edg')) browser = 'Edge';
    
    // Simple OS detection
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS') || userAgent.includes('iPhone')) os = 'iOS';
    
    // Get location from IP
    let location = 'Unknown';
    const geo = geoip.lookup(ip);
    if (geo) {
        location = `${geo.city || ''}, ${geo.country}`.trim();
    }
    
    return {
        deviceId,
        deviceType,
        deviceName: `${browser} on ${os}`,
        browser,
        os,
        location,
        ip,
        userAgent
    };
};

export const deviceAuthMiddleware = async (req, res, next) => {
    try {
        if (!req.user) {
            return next();
        }
        
        const deviceInfo = getDeviceInfo(req);
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return next();
        }
        
        // Check if device limit is reached
        if (user.isDeviceLimitReached()) {
            // For free plan, auto-logout oldest device
            if (user.subscription.plan === 'free') {
                const oldestDevice = user.getOldestActiveDevice();
                if (oldestDevice && oldestDevice.deviceId !== deviceInfo.deviceId) {
                    await user.removeDevice(oldestDevice.deviceId);
                }
            } else {
                // For paid plans, check if current device is already registered
                const existingDevice = user.devices.find(d => d.deviceId === deviceInfo.deviceId);
                if (!existingDevice) {
                    // Return error for paid plans when limit is reached
                    return res.status(403).json({
                        success: false,
                        message: `Device limit reached. Maximum ${user.getDeviceLimit()} device(s) allowed for your plan.`,
                        code: 'DEVICE_LIMIT_REACHED'
                    });
                }
            }
        }
        
        // Check if device already exists
        const existingDeviceIndex = user.devices.findIndex(d => d.deviceId === deviceInfo.deviceId);
        
        if (existingDeviceIndex !== -1) {
            // Update existing device
            user.devices[existingDeviceIndex].lastActive = new Date();
        } else {
            // Add new device with token
            user.devices.push({
                ...deviceInfo,
                token: req.headers.authorization?.split(' ')[1] || '',
                lastActive: new Date(),
                loginDate: new Date()
            });
        }
        
        await user.save();
        next();
    } catch (error) {
        console.error('Device auth middleware error:', error);
        next();
    }
};
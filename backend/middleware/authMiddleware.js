import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found or account deleted'
        });
      }

      // Enhanced device validation - check if token exists in user's devices
      if (user.devices && user.devices.length > 0) {
        const device = user.devices.find(d => d.token === token);
        if (!device) {
          return res.status(401).json({
            success: false,
            message: 'Session expired. Please login again.'
          });
        }

        // Update last active timestamp
        device.lastActive = new Date();
        await user.save();

        req.user = {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          profilePicture: user.profilePicture,
          subscription: user.subscription,
          isGoogleUser: !!user.googleId,
          currentDevice: device
        };
      } else {
        // For backward compatibility - users without devices array
        // Create a temporary device entry
        if (!user.devices) {
          user.devices = [];
        }
        
        const newDevice = {
          deviceId: require('crypto').createHash('md5').update(req.headers['user-agent'] + (req.ip || '')).digest('hex'),
          token: token,
          deviceType: 'computer',
          deviceName: 'Unknown Device',
          browser: 'Unknown',
          os: 'Unknown',
          location: 'Unknown',
          ip: req.ip,
          lastActive: new Date(),
          loginDate: new Date(),
          userAgent: req.headers['user-agent']
        };
        
        user.devices.push(newDevice);
        await user.save();

        req.user = {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          profilePicture: user.profilePicture,
          subscription: user.subscription,
          isGoogleUser: !!user.googleId,
          currentDevice: newDevice
        };
      }

      next();
    } catch (error) {
      console.error('JWT verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
};
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendResetEmail, sendVerificationEmail, sendWelcomeEmail } from '../utils/sendEmail.js';
import { protect as authMiddleware } from '../middleware/authMiddleware.js';
import bcrypt from 'bcryptjs';
import { generateDeviceId, detectDeviceType, generateDeviceName, getBrowser, getOS, getLocationFromIP, formatLastActive } from '../utils/deviceHelper.js';
import { deviceAuthMiddleware, getDeviceInfo } from '../middleware/deviceMiddleware.js';
import { enhancedLogger as logger } from '../utils/logger.js';

const router = express.Router();

// ======== ADD THIS ROUTE HERE ========
// Add this route to your authRoutes.js
router.get('/config', (req, res) => {
    res.json({
        googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
        clientUrl: process.env.CLIENT_URL || 'http://localhost:5173'
    });
});
// ======== END OF ADDED ROUTE ========

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

function getUserProfileLimit(plan) {
  const limits = {
    free: 1,
    basic: 1,
    standard: 3,
    premium: 5
  };
  return limits[plan] || 1;
}

function getUserDeviceLimit(plan) {
  const limits = {
    free: 1,
    basic: 1,
    standard: 2,
    premium: 4
  };
  return limits[plan] || 1;
}

// Simple Register - SEPARATED EMAIL SENDING FOR INSTANT RESPONSE
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Generate email verification token
    const emailVerificationToken = jwt.sign(
      { email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create user with verification token
    const user = await User.create({
      name,
      email,
      password,
      emailVerificationToken,
      emailVerificationExpire: Date.now() + 60 * 60 * 1000 // 1 hour
    });

    // Generate auth token
    const token = generateToken(user._id);

    // Device tracking
    const deviceId = generateDeviceId(req);
    const deviceType = detectDeviceType(req);
    const deviceName = generateDeviceName(req);
    const browser = getBrowser(req.headers['user-agent']);
    const os = getOS(req.headers['user-agent']);
    const ip = req.ip || req.connection.remoteAddress;
    const location = await getLocationFromIP(ip);

    await User.findByIdAndUpdate(user._id, {
      $push: {
        devices: {
          deviceId,
          token,
          deviceType,
          deviceName,
          browser,
          os,
          location,
          ip,
          lastActive: new Date(),
          loginDate: new Date(),
          userAgent: req.headers['user-agent']
        }
      }
    });

    // ✅ SEND IMMEDIATE RESPONSE TO USER
    res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to Velura!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        isGoogleUser: !!user.googleId,
        emailVerified: user.emailVerified
      }
    });

    // ✅ SEND EMAILS IN BACKGROUND (NON-BLOCKING)
    sendRegistrationEmailsInBackground(email, name, emailVerificationToken);

  } catch (error) {
    logger.error('❌ Register error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ✅ SEPARATE FUNCTION FOR BACKGROUND EMAIL SENDING
async function sendRegistrationEmailsInBackground(email, name, emailVerificationToken) {
  try {
    
    // Send welcome email immediately
    try {
      await sendWelcomeEmail(email, name);
    } catch (welcomeEmailError) {
      logger.error('❌ Failed to send welcome email in background:', welcomeEmailError);
    }

    // Wait 30 seconds then send verification email
    setTimeout(async () => {
      try {
        const verificationUrl = `${process.env.CLIENT_URL}/auth.html?verifyToken=${emailVerificationToken}`;
        await sendVerificationEmail(email, verificationUrl, name);
      } catch (emailError) {
        logger.error('❌ Failed to send verification email in background:', emailError);
      }
    }, 30000); // 30 seconds delay

  } catch (error) {
    logger.error('❌ Background email sending failed:', error);
  }
}

// Simple Login - ENHANCED WITH DEVICE LIMIT ENFORCEMENT
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordMatch = await user.matchPassword(password);
    if (!isPasswordMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // ============ DEVICE LIMIT CHECK ============
    const deviceId = generateDeviceId(req);
    const isNewDevice = !user.devices.some(d => d.deviceId === deviceId);
    
    if (isNewDevice) {
      // Check if user is at their device limit
      const deviceLimit = getUserDeviceLimit(user.subscription?.plan);
      const activeDevices = user.devices.filter(device => {
        // Consider device active if logged in within last 7 days
        return new Date(device.lastActive) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      });
      
      // If at limit, handle based on subscription plan
      if (activeDevices.length >= deviceLimit) {
        if (user.subscription?.plan === 'free') {
          // For free users: auto-logout oldest device
          const oldestDevice = activeDevices.reduce((oldest, current) => {
            return new Date(oldest.loginDate) < new Date(current.loginDate) ? oldest : current;
          });
          
          if (oldestDevice) {
            // Remove the oldest device
            await User.findByIdAndUpdate(user._id, {
              $pull: { devices: { deviceId: oldestDevice.deviceId } }
            });
          }
        } else {
          // For paid users: block login with error message
          return res.status(403).json({
            success: false,
            message: `Device limit reached! You can only use ${deviceLimit} device(s) simultaneously on your plan.`,
            code: 'DEVICE_LIMIT_REACHED',
            deviceLimit,
            currentDevices: activeDevices.length
          });
        }
      }
    }
    // ============ END DEVICE LIMIT CHECK ============

    // Generate token
    const token = generateToken(user._id);

    // ============ ADD/UPDATE DEVICE TRACKING ============
    const deviceType = detectDeviceType(req);
    const deviceName = generateDeviceName(req);
    const browser = getBrowser(req.headers['user-agent']);
    const os = getOS(req.headers['user-agent']);
    const ip = req.ip || req.connection.remoteAddress;
    const location = await getLocationFromIP(ip);

    // Check if device already exists
    const existingDeviceIndex = user.devices.findIndex(d => d.deviceId === deviceId);
    
    if (existingDeviceIndex !== -1) {
      // Update existing device token and activity
      user.devices[existingDeviceIndex].token = token;
      user.devices[existingDeviceIndex].lastActive = new Date();
    } else {
      // Add new device
      user.devices.push({
        deviceId,
        token,
        deviceType,
        deviceName,
        browser,
        os,
        location,
        ip,
        lastActive: new Date(),
        loginDate: new Date(),
        userAgent: req.headers['user-agent']
      });
    }

    await user.save();
    // ============ END DEVICE TRACKING ============

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        isGoogleUser: !!user.googleId,
        subscription: user.subscription
      },
      deviceInfo: {
        deviceCount: user.devices.length,
        deviceLimit: getUserDeviceLimit(user.subscription?.plan),
        isNewDevice: existingDeviceIndex === -1
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Enhanced Forgot Password - PREVENT GOOGLE USERS FROM RESETTING PASSWORDS
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, a reset link has been sent.'
      });
    }

    // ✅ CHECK IF USER IS GOOGLE USER (NO PASSWORD RESET ALLOWED)
    if (user.googleId) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, a reset link has been sent.'
      });
    }

    // ✅ CHECK IF USER HAS PASSWORD (PROTECT AGAINST DATABASE INCONSISTENCIES)
    if (!user.password) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, a reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Save reset token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.CLIENT_URL}/auth?resetToken=${resetToken}`;

    // Send email
    await sendResetEmail(email, resetUrl, user.name);

    res.json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.'
    });
  } catch (error) {
    logger.error('❌ Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending reset email: ' + error.message
    });
  }
});

// Enhanced Reset Password - ADD GOOGLE USER PROTECTION
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findOne({
      _id: decoded.id,
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // ✅ ADDITIONAL PROTECTION: CHECK IF USER IS GOOGLE USER
    if (user.googleId) {
      return res.status(400).json({
        success: false,
        message: 'Google users cannot reset password here. Use Google account recovery.'
      });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully! You can now login with your new password.'
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token'
    });
  }
});

// Google Auth - SEPARATED EMAIL SENDING FOR INSTANT RESPONSE
router.post('/google-auth', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required'
      });
    }

    // USE NEW OAUTH CREDENTIALS FOR USER AUTHENTICATION
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/auth.html';
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    

    if (!clientId || !clientSecret) {
      logger.error('❌ OAuth credentials missing');
      return res.status(500).json({
        success: false,
        message: 'Google authentication is not properly configured'
      });
    }

    // SIMPLE GOOGLE TOKEN EXCHANGE (no device parameters)
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      logger.error('❌ Google token exchange failed:', tokens.error_description);
      return res.status(400).json({
        success: false,
        message: `Google authentication failed: ${tokens.error_description}`
      });
    }

    if (!tokens.access_token) {
      logger.error('❌ No access token received');
      return res.status(400).json({
        success: false,
        message: 'Google authentication failed: No access token received'
      });
    }

    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to fetch user info: ${userResponse.status}`);
    }

    const userData = await userResponse.json();

    // Find or create user in database
    let user = await User.findOne({ 
      $or: [
        { email: userData.email },
        { googleId: userData.id }
      ]
    });

    let isNewUser = false;

    if (user) {
      // Update googleId if not set
      if (!user.googleId) {
        user.googleId = userData.id;
      }
      // Update profile picture if empty
      if (!user.profilePicture && userData.picture) {
        user.profilePicture = userData.picture;
      }
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        name: userData.name,
        email: userData.email,
        googleId: userData.id,
        profilePicture: userData.picture,
        emailVerified: true
      });
      isNewUser = true;
    }

    const authToken = generateToken(user._id);

    // Add device tracking
    const deviceId = generateDeviceId(req);
    const deviceType = detectDeviceType(req);
    const deviceName = generateDeviceName(req);
    const browser = getBrowser(req.headers['user-agent']);
    const os = getOS(req.headers['user-agent']);
    const ip = req.ip || req.connection.remoteAddress;
    const location = await getLocationFromIP(ip);

    await User.findByIdAndUpdate(user._id, {
      $push: {
        devices: {
          deviceId,
          token: authToken,
          deviceType,
          deviceName,
          browser,
          os,
          location,
          ip,
          lastActive: new Date(),
          loginDate: new Date(),
          userAgent: req.headers['user-agent']
        }
      }
    });


    // ✅ SEND IMMEDIATE RESPONSE
    res.json({
      success: true,
      message: 'Google authentication successful! Welcome to Velura!',
      token: authToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        isGoogleUser: !!user.googleId
      }
    });

    // ✅ SEND WELCOME EMAIL IN BACKGROUND FOR NEW GOOGLE USERS
    if (isNewUser) {
      try {
        await sendWelcomeEmail(user.email, user.name);
      } catch (emailError) {
        logger.error('❌ Failed to send welcome email to Google user in background:', emailError);
      }
    }

  } catch (error) {
    logger.error('❌ Google auth error:', error);
    res.status(400).json({
      success: false,
      message: 'Google authentication failed: ' + error.message
    });
  }
});

// Update Profile
router.put('/update-profile', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }

    const user = await User.findById(req.user.id);
    user.name = name;
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Change Password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const user = await User.findById(req.user.id);

    // Check if user is Google user (no password)
    if (user.googleId && !user.password) {
      return res.status(400).json({
        success: false,
        message: 'Google users cannot change password here. Use Google account settings.'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.matchPassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update Preferences
router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    const { emailNotifications, autoPlay } = req.body;

    const user = await User.findById(req.user.id);

    // Create preferences object if it doesn't exist
    if (!user.preferences) {
      user.preferences = {};
    }

    user.preferences.emailNotifications = emailNotifications || false;
    user.preferences.autoPlay = autoPlay || false;
    user.markModified('preferences');
    await user.save();

    res.json({
      success: true,
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get user preferences
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('preferences');

    res.json({
      success: true,
      preferences: user.preferences || {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get subscription
router.get('/subscription', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('subscription profiles');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Ensure profiles array exists
    if (!user.profiles) {
      user.profiles = [];
    }

    // Default subscription if none exists
    const subscription = user.subscription || {
      plan: 'free',
      status: 'active',
      startDate: new Date(),
      nextBillingDate: null,
      paymentMethod: null
    };

    res.json({
      success: true,
      subscription,
      profiles: user.profiles
    });
  } catch (error) {
    logger.error('Subscription fetch ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching subscription'
    });
  }
});

// Get profiles
router.get('/profiles', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Ensure profiles array exists and has at least one profile
    if (!user.profiles || user.profiles.length === 0) {
      user.profiles = [{
        name: user.name || 'Main Profile',
        avatar: '👤',
        ageRating: 'All Maturity Levels',
        locked: false,
        isMain: true,
        pin: null,
        createdAt: new Date()
      }];
      await user.save();
    }

    res.json({
      success: true,
      profiles: user.profiles
    });
  } catch (error) {
    logger.error('Profiles fetch ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching profiles'
    });
  }
});

// Enhanced profile creation with PIN validation AND HASHING
router.post('/profiles', authMiddleware, async (req, res) => {
  try {
    const { name, avatar, ageRating, pin } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Profile name is required'
      });
    }

    const user = await User.findById(req.user.id);

    // Check profile limit based on subscription
    const profileLimit = getUserProfileLimit(user.subscription?.plan);
    if (user.profiles && user.profiles.length >= profileLimit) {
      return res.status(400).json({
        success: false,
        message: `Profile limit reached. Maximum ${profileLimit} profiles allowed for your plan.`
      });
    }

    // Validate PIN
    if (pin && (!/^\d{4}$/.test(pin))) {
      return res.status(400).json({
        success: false,
        message: 'PIN must be exactly 4 digits'
      });
    }

    // Hash PIN if provided
    let hashedPin = null;
    if (pin) {
      const salt = await bcrypt.genSalt(10);
      hashedPin = await bcrypt.hash(pin, salt);
    }

    // Create new profile
    const newProfile = {
      name,
      avatar: avatar || '👤',
      ageRating: ageRating || 'All Maturity Levels',
      locked: !!pin, // Lock if PIN is set
      isMain: false,
      pin: hashedPin,
      createdAt: new Date()
    };

    if (!user.profiles) {
      user.profiles = [];
    }

    user.profiles.push(newProfile);
    await user.save();

    res.json({
      success: true,
      message: 'Profile created successfully',
      profile: newProfile
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Enhanced profile update with PIN hashing
router.put('/profiles/:profileId', authMiddleware, async (req, res) => {
  try {
    const { profileId } = req.params;
    const { name, avatar, ageRating, locked, pin } = req.body;

    const user = await User.findById(req.user.id);

    if (!user.profiles || user.profiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No profiles found'
      });
    }

    // Find profile by ID
    let profile = user.profiles.id(profileId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Update profile with validation
    if (name !== undefined) profile.name = name || 'Unnamed Profile';
    if (avatar !== undefined) profile.avatar = avatar;
    if (ageRating !== undefined) profile.ageRating = ageRating;
    if (locked !== undefined) profile.locked = locked;

    // Handle PIN updates with hashing
    if (pin !== undefined) {
      if (pin && !/^\d{4}$/.test(pin)) {
        return res.status(400).json({
          success: false,
          message: 'PIN must be exactly 4 digits'
        });
      }

      if (pin) {
        const salt = await bcrypt.genSalt(10);
        profile.pin = await bcrypt.hash(pin, salt);
        profile.locked = true; // Auto-lock when PIN is set
      } else {
        profile.pin = null;
        profile.locked = false; // Auto-unlock when PIN is removed
      }
    }

    user.markModified('profiles');
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: profile
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete profile
router.delete('/profiles/:profileId', authMiddleware, async (req, res) => {
  try {
    const { profileId } = req.params;

    const user = await User.findById(req.user.id);

    if (!user.profiles) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const profile = user.profiles.id(profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    if (profile.isMain) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete main profile'
      });
    }

    user.profiles.pull(profileId);
    await user.save();

    res.json({
      success: true,
      message: 'Profile deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Verify PIN for profile
router.post('/profiles/:profileId/verify-pin', authMiddleware, async (req, res) => {
  try {
    const { profileId } = req.params;
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({
        success: false,
        message: 'PIN is required'
      });
    }

    const user = await User.findById(req.user.id);
    const profile = user.profiles.id(profileId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    if (!profile.pin) {
      return res.status(400).json({
        success: false,
        message: 'Profile does not have a PIN'
      });
    }

    // Compare hashed PIN
    const isPinValid = await bcrypt.compare(pin, profile.pin);
    if (!isPinValid) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect PIN'
      });
    }

    res.json({
      success: true,
      message: 'PIN verified successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update subscription
router.put('/subscription', authMiddleware, async (req, res) => {
  try {
    const { plan, paymentMethodId } = req.body;

    if (!['free', 'basic', 'standard', 'premium'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan type'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user.subscription) {
      user.subscription = {};
    }

    user.subscription.plan = plan;
    user.subscription.status = plan === 'free' ? 'active' : 'active';
    user.subscription.updatedAt = new Date();

    if (plan !== 'free') {
      user.subscription.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      user.subscription.paymentMethod = paymentMethodId || user.subscription.paymentMethod;
    } else {
      user.subscription.nextBillingDate = null;
    }

    await user.save();

    res.json({
      success: true,
      message: `Subscription updated to ${plan} plan`,
      subscription: user.subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Generate and send security code for sensitive actions
router.post('/send-security-code', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate 6-digit code
        const securityCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // In a real app, you'd save this to the user and send via email
        // For now, we'll just return it (in production, send via email)
        
        // TODO: Send actual email with the code
        // await sendSecurityCodeEmail(user.email, securityCode, user.name);

        res.json({
            success: true,
            message: 'Security code sent to your email',
            code: securityCode // Remove this in production - only for testing
        });

    } catch (error) {
        logger.error('Send security code error:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending security code'
        });
    }
});

// Verify security code
router.post('/verify-security-code', authMiddleware, async (req, res) => {
    try {
        const { code } = req.body;
        const user = await User.findById(req.user.id);

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Security code is required'
            });
        }

        // In a real app, you'd verify against the code sent to the user
        // For demo, we'll accept any 6-digit code
        if (code.length === 6 && /^\d+$/.test(code)) {
            res.json({
                success: true,
                message: 'Security code verified successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Invalid security code'
            });
        }

    } catch (error) {
        logger.error('Verify security code error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying security code'
        });
    }
});

// Cancel subscription
router.post('/subscription/cancel', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user.subscription || user.subscription.plan === 'free') {
      return res.status(400).json({
        success: false,
        message: 'No active subscription to cancel'
      });
    }

    user.subscription.status = 'cancelled';
    user.subscription.cancelledAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      subscription: user.subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Verify password
router.post('/verify-password', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    const user = await User.findById(req.user.id);

    // Check if user is Google user (no password)
    if (user.googleId && !user.password) {
      return res.status(400).json({
        success: false,
        message: 'Google users cannot use password verification. Use email verification instead.'
      });
    }

    // Verify password
    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect password'
      });
    }

    res.json({
      success: true,
      message: 'Password verified successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Verify Email Route
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findOne({ 
      email: decoded.email,
      emailVerificationToken: token,
      emailVerificationExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    // Update user as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully! You can now access all features.'
    });

  } catch (error) {
    logger.error('Email verification error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid or expired verification token'
    });
  }
});

// Resend Verification Email
router.post('/resend-verification', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new verification token
    const emailVerificationToken = jwt.sign(
      { email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    user.emailVerificationToken = emailVerificationToken;
    user.emailVerificationExpire = Date.now() + 60 * 60 * 1000;
    await user.save();

    // Send verification email
    const verificationUrl = `${process.env.CLIENT_URL}/auth?verifyToken=${emailVerificationToken}`;
    await sendVerificationEmail(user.email, verificationUrl, user.name);

    res.json({
      success: true,
      message: 'Verification email sent successfully!'
    });

  } catch (error) {
    logger.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Check if user is Google user
router.get('/user-info', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('googleId email name profilePicture');

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        isGoogleUser: !!user.googleId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get all devices
router.get('/devices', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        // Mark current device
        const currentDeviceInfo = getDeviceInfo(req);
        const devices = user.devices.map(device => ({
            ...device.toObject(),
            current: device.deviceId === currentDeviceInfo.deviceId
        }));
        
        res.json({
            success: true,
            devices,
            deviceCount: devices.length,
            deviceLimit: user.getDeviceLimit()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching devices'
        });
    }
});

// Sign out specific device
router.post('/devices/signout', authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.body;
        const currentDeviceInfo = getDeviceInfo(req);
        
        // Prevent signing out current device
        if (deviceId === currentDeviceInfo.deviceId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot sign out current device'
            });
        }
        
        const user = await User.findById(req.user.id);
        await user.removeDevice(deviceId);
        
        res.json({
            success: true,
            message: 'Device signed out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error signing out device'
        });
    }
});

// Sign out all other devices
router.post('/devices/signout-all', authMiddleware, async (req, res) => {
    try {
        const currentDeviceInfo = getDeviceInfo(req);
        const user = await User.findById(req.user.id);
        
        // Keep only current device
        await user.removeOtherDevices(currentDeviceInfo.deviceId);
        
        res.json({
            success: true,
            message: 'All other devices signed out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error signing out devices'
        });
    }
});

// Sign out current device (for logout)
router.post('/devices/signout-current', authMiddleware, async (req, res) => {
    try {
        const currentDeviceInfo = getDeviceInfo(req);
        const user = await User.findById(req.user.id);
        
        await user.removeDevice(currentDeviceInfo.deviceId);
        
        res.json({
            success: true,
            message: 'Device signed out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error signing out device'
        });
    }
});

export default router;
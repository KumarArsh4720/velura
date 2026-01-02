import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    maxlength: 50,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: function () {
      return !this.googleId;
    },
    minlength: 6
  },
  googleId: {
    type: String,
    sparse: true
  },
  profilePicture: {
    type: String,
    default: ''
  },

  // ============ EMAIL VERIFICATION FIELDS ============
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpire: Date,

  // ============ PASSWORD RESET FIELDS ============
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  // Enhanced Preferences (KEEPING ALL EXISTING FIELDS)
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    autoPlay: {
      type: Boolean,
      default: true
    },
    matureContent: {
      type: Boolean,
      default: false
    },
    videoQuality: {
      type: String,
      default: 'auto',
      enum: ['auto', '720p', '1080p', '4k']
    },
    autoplayNext: {
      type: Boolean,
      default: true
    }
  },

  // Subscription Management (KEEPING ALL EXISTING FIELDS + ADDING NEW ONES)
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'standard', 'premium'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired'],
      default: 'active'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    nextBillingDate: Date,
    cancelledAt: Date,

    // Payment Information
    paymentMethod: String,

    // Subscription Limits (KEEPING THIS FOR OTHER PAGES)
    limits: {
      simultaneousStreams: { type: Number, default: 1 },
      maxVideoQuality: { type: String, default: '720p' },
      downloadLimit: { type: Number, default: 0 } // in GB
    },

    updatedAt: {
      type: Date,
      default: Date.now
    }
  },

  // Device Tracking System
  devices: [{
    deviceId: {
      type: String,
      required: true
    },
    token: {
      type: String,
      required: true
    },
    deviceType: {
      type: String,
      enum: ['computer', 'mobile', 'tablet', 'tv'],
      required: true
    },
    deviceName: {
      type: String,
      required: true
    },
    browser: {
      type: String,
      required: true
    },
    os: {
      type: String,
      required: true
    },
    location: {
      type: String,
      default: 'Unknown'
    },
    ip: String,
    lastActive: {
      type: Date,
      default: Date.now
    },
    loginDate: {
      type: Date,
      default: Date.now
    },
    userAgent: String
  }],
  
  // Payment Methods (KEEPING FOR OTHER PAGES)
  paymentMethods: [{
    id: String,
    type: {
      type: String,
      enum: ['card', 'paypal']
    },
    brand: String,
    last4: String,
    expMonth: Number,
    expYear: Number,
    isDefault: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Billing History (KEEPING FOR OTHER PAGES)
  billingHistory: [{
    invoiceId: String,
    date: {
      type: Date,
      default: Date.now
    },
    amount: Number,
    description: String,
    status: {
      type: String,
      enum: ['paid', 'pending', 'failed'],
      default: 'pending'
    },
    plan: String
  }],

  // Usage Statistics (KEEPING FOR OTHER PAGES)
  statistics: {
    moviesWatched: {
      type: Number,
      default: 0
    },
    showsWatched: {
      type: Number,
      default: 0
    },
    totalWatchTime: { // in minutes
      type: Number,
      default: 0
    },
    favoritesCount: {
      type: Number,
      default: 0
    }
  },

  // Profiles Management
  profiles: [{
    name: {
      type: String,
      required: true,
      trim: true,
      default: function () {
        return this.isMain ? 'Main Profile' : 'New Profile';
      }
    },
    avatar: {
      type: String,
      default: '👤'
    },
    ageRating: {
      type: String,
      default: 'All Maturity Levels',
      enum: ['Kids', 'PG and below', 'PG-13 and below', 'All Maturity Levels']
    },
    locked: {
      type: Boolean,
      default: false
    },
    isMain: {
      type: Boolean,
      default: false
    },
    pin: {
      type: String,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]

}, {
  timestamps: true,
  versionKey: false
});

// Hash password before saving - FIXED
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next(); // ✅ ADDED return
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next(); // ✅ ADDED return
  } catch (error) {
    return next(error); // ✅ ADDED return
  }
});

// Update subscription limits when plan changes (KEEPING FOR OTHER PAGES) - FIXED
userSchema.pre('save', function (next) {
  if (this.isModified('subscription.plan')) {
    const planLimits = {
      free: { simultaneousStreams: 1, maxVideoQuality: '720p', downloadLimit: 0 },
      basic: { simultaneousStreams: 1, maxVideoQuality: '720p', downloadLimit: 5 },
      standard: { simultaneousStreams: 2, maxVideoQuality: '1080p', downloadLimit: 10 },
      premium: { simultaneousStreams: 4, maxVideoQuality: '4k', downloadLimit: 30 }
    };

    this.subscription.limits = planLimits[this.subscription.plan] || planLimits.free;
    this.subscription.updatedAt = new Date();
  }

  // Auto-verify Google users
  if (this.googleId && !this.emailVerified) {
    this.emailVerified = true;
    this.emailVerificationToken = undefined;
    this.emailVerificationExpire = undefined;
  }

  // Ensure at least one profile exists for account management
  if (!this.profiles || this.profiles.length === 0) {
    this.profiles = [{
      name: this.name,
      avatar: '👤',
      ageRating: 'All Maturity Levels',
      locked: false,
      isMain: true,
      pin: null,
      createdAt: new Date()
    }];
  }
  return next(); // ✅ CHANGED from next() to return next()
});

// ============ NEW DEVICE MANAGEMENT METHODS ============

// Get device limit based on subscription plan
userSchema.methods.getDeviceLimit = function() {
  const planLimits = {
    free: 1,
    basic: 1,
    standard: 2,
    premium: 4
  };
  return planLimits[this.subscription?.plan] || 1;
};

// Check if device limit is reached
userSchema.methods.isDeviceLimitReached = function() {
  const activeDevices = this.devices.filter(device => {
    // Consider device active if logged in within last 7 days
    return new Date(device.lastActive) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  });
  return activeDevices.length >= this.getDeviceLimit();
};

// Get oldest active device (for auto-logout)
userSchema.methods.getOldestActiveDevice = function() {
  const activeDevices = this.devices.filter(device => {
    return new Date(device.lastActive) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  });
  
  if (activeDevices.length === 0) return null;
  
  return activeDevices.reduce((oldest, current) => {
    return new Date(oldest.loginDate) < new Date(current.loginDate) ? oldest : current;
  });
};

// Remove specific device
userSchema.methods.removeDevice = function(deviceId) {
  this.devices = this.devices.filter(device => device.deviceId !== deviceId);
  return this.save();
};

// Remove all devices except current one
userSchema.methods.removeOtherDevices = function(currentDeviceId) {
  this.devices = this.devices.filter(device => device.deviceId === currentDeviceId);
  return this.save();
};

// Update device activity
userSchema.methods.updateDeviceActivity = function(deviceId) {
  const device = this.devices.find(d => d.deviceId === deviceId);
  if (device) {
    device.lastActive = new Date();
  }
  return this.save();
};

// Get active device count
userSchema.methods.getActiveDeviceCount = function() {
  return this.devices.filter(device => {
    return new Date(device.lastActive) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }).length;
};

// ============ END OF NEW METHODS ============

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Update statistics method (KEEPING FOR OTHER PAGES)
userSchema.methods.updateStatistics = function () {
  // This method can be called when you implement watch history
  // For now, it's a placeholder for future functionality
  return this.save();
};

// Method to check if email verification token is valid
userSchema.methods.isEmailVerificationTokenValid = function () {
  return this.emailVerificationToken && 
         this.emailVerificationExpire && 
         this.emailVerificationExpire > Date.now();
};

// Method to check if reset token is valid
userSchema.methods.isResetTokenValid = function () {
  return this.resetPasswordToken && 
         this.resetPasswordExpire && 
         this.resetPasswordExpire > Date.now();
};

export default mongoose.model('User', userSchema);
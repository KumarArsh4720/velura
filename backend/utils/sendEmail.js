// backend/utils/sendEmail.js
import emailManager from '../services/emailManager.js';

// Email sending functions
export const sendResetEmail = async (email, resetUrl, name = 'User') => {
  try {
    console.log('📤 Sending reset email to:', email);
    
    const mailOptions = {
      from: `"Velura Stream" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset Your Velura Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #0d0d15; color: #e0e0ff; }
            .container { max-width: 600px; margin: 0 auto; background: #151525; padding: 30px; border-radius: 16px; }
            .header { text-align: center; margin-bottom: 30px; }
            .button { background: linear-gradient(135deg, #7a00ff, #0072ff); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; display: inline-block; font-weight: 600; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: #7a00ff; margin: 0;">🔒 Password Reset</h1>
              <p style="opacity: 0.8;">Secure your account</p>
            </div>
            
            <p>Hi <strong>${name}</strong>,</p>
            
            <p>We received a request to reset your password for your Velura account. Click the button below to create a new password:</p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </div>
            
            <p>Or copy and paste this link in your browser:</p>
            <p style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; word-break: break-all; font-size: 14px;">
              ${resetUrl}
            </p>
            
            <p><strong>This link will expire in 15 minutes for security.</strong></p>
            
            <p>If you didn't request this reset, please ignore this email and your password will remain unchanged.</p>
            
            <div class="footer">
              <p>Stay secure!<br>The Velura Team</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await emailManager.sendEmail(mailOptions);
    console.log('✅ Password reset email sent to:', email);
    return info;
  } catch (error) {
    console.error('❌ Error sending reset email:', error.message);
    
    if (error.message === 'Email system not initialized') {
      console.log('⚠️  Email system is not ready. Please run: npm run email:setup');
    }
    
    throw new Error('Failed to send reset email: ' + error.message);
  }
};

export const sendVerificationEmail = async (email, verificationUrl, name = 'User') => {
  try {
    console.log('📤 Sending verification email to:', email);
    
    const mailOptions = {
      from: `"Velura Stream" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Velura Account - Action Required! 🎬',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style type="text/css">
            /* Reset CSS for email compatibility */
            body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
            table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
            img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
            
            /* Main styles */
            body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background-color: #f6f9fc; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
            
            /* Header */
            .header { background: linear-gradient(135deg, #7a00ff 0%, #0072ff 100%); padding: 40px 20px; text-align: center; }
            .header h1 { color: #ffffff; font-size: 28px; font-weight: bold; margin: 0 0 10px 0; }
            .header p { color: rgba(255,255,255,0.9); font-size: 16px; margin: 0; }
            
            /* Content */
            .content { padding: 40px 30px; }
            .greeting { font-size: 24px; color: #333333; text-align: center; margin-bottom: 20px; font-weight: bold; }
            .message { font-size: 16px; color: #666666; line-height: 1.6; text-align: center; margin-bottom: 30px; }
            
            /* Verification card */
            .verification-card { background: #f8f9ff; border: 2px solid #e2e8ff; border-radius: 12px; padding: 30px; text-align: center; margin: 20px 0; }
            .verification-icon { background: linear-gradient(135deg, #7a00ff, #0072ff); color: #ffffff; width: 60px; height: 60px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
            .verification-title { font-size: 20px; color: #333333; margin-bottom: 15px; font-weight: bold; }
            
            /* Button */
            .button { display: inline-block; background: linear-gradient(135deg, #7a00ff, #0072ff); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0; }
            
            /* Manual link */
            .manual-link { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0; word-break: break-all; }
            .link-text { color: #4a5568; font-size: 14px; font-family: 'Courier New', monospace; }
            
            /* Security section */
            .security-section { background: #fff5f5; border: 1px solid #fed7d7; border-radius: 8px; padding: 20px; margin: 25px 0; }
            .security-title { color: #c53030; font-weight: bold; margin-bottom: 10px; }
            
            /* Footer */
            .footer { background: #f8f9fa; padding: 30px 20px; text-align: center; border-top: 1px solid #e9ecef; }
            .footer-text { color: #6c757d; font-size: 14px; margin-bottom: 15px; }
            .social-links { margin: 20px 0; }
            .social-link { color: #7a00ff; text-decoration: none; margin: 0 10px; font-weight: 600; }
            .copyright { color: #a0aec0; font-size: 12px; margin-top: 15px; }
            
            /* Mobile styles */
            @media only screen and (max-width: 600px) {
              .content { padding: 30px 20px; }
              .header { padding: 30px 20px; }
              .header h1 { font-size: 24px; }
              .greeting { font-size: 20px; }
              .button { padding: 14px 30px; font-size: 14px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <!-- Header -->
            <div class="header">
              <h1>Verify Your Email</h1>
              <p>Let's secure your account</p>
            </div>
            
            <!-- Content -->
            <div class="content">
              <h2 class="greeting">Hello, ${name}! 👋</h2>
              <p class="message">
                Thank you for joining Velura! To complete your registration and unlock all features, 
                please verify your email address by clicking the button below.
              </p>
              
              <!-- Verification Card -->
              <div class="verification-card">
                <div class="verification-icon">✓</div>
                <h3 class="verification-title">Email Verification Required</h3>
                <p style="color: #666666; margin-bottom: 20px; font-size: 14px;">
                  Click below to confirm this is your correct email address
                </p>
                
                <a href="${verificationUrl}" class="button" style="color: #ffffff;">
                  Verify Email Address
                </a>
                
                <p style="color: #718096; font-size: 14px; margin-top: 15px;">
                  <strong>⏰ This link expires in 1 hour</strong>
                </p>
              </div>
              
              <!-- Manual Link -->
              <p style="text-align: center; color: #666666; margin: 20px 0; font-size: 14px;">
                Or copy and paste this URL in your browser:
              </p>
              
              <div class="manual-link">
                <code class="link-text">${verificationUrl}</code>
              </div>
              
              <!-- Security Notice -->
              <div class="security-section">
                <h4 class="security-title">🔒 Security Notice</h4>
                <p style="color: #744210; font-size: 14px; line-height: 1.5; margin: 0;">
                  This verification ensures that you own this email address and helps protect your 
                  Velura account from unauthorized access. If you didn't create this account, 
                  please ignore this email.
                </p>
              </div>
            </div>
            
            <!-- Footer -->
            <div class="footer">
              <p class="footer-text">
                Need help? Contact our support team at 
                <a href="mailto:support@velura.com" style="color: #7a00ff; text-decoration: none;">
                  support@velura.com
                </a>
              </p>
              
              <div class="social-links">
                <a href="#" class="social-link">Twitter</a>
                <a href="#" class="social-link">Instagram</a>
                <a href="#" class="social-link">Facebook</a>
                <a href="#" class="social-link">YouTube</a>
              </div>
              
              <p class="copyright">
                © 2024 Velura Stream. All rights reserved.<br>
                123 Entertainment District, Stream City
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await emailManager.sendEmail(mailOptions);
    console.log('✅ Verification email sent to:', email);
    return info;
  } catch (error) {
    console.error('❌ Error sending verification email:', error.message);
    throw new Error('Failed to send verification email: ' + error.message);
  }
};

export const sendWelcomeEmail = async (email, name = 'User') => {
  try {
    console.log('📤 Sending welcome email to:', email);
    
    const mailOptions = {
      from: `"Velura Stream" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to Velura - Your Streaming Adventure Begins! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style type="text/css">
            /* Reset CSS for email compatibility */
            body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
            table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
            img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
            
            /* Main styles */
            body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background-color: #f6f9fc; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
            
            /* Header */
            .header { background: linear-gradient(135deg, #7a00ff 0%, #0072ff 100%); padding: 50px 20px; text-align: center; }
            .welcome-icon { font-size: 48px; margin-bottom: 20px; display: block; }
            .header h1 { color: #ffffff; font-size: 32px; font-weight: bold; margin: 0 0 10px 0; }
            .header p { color: rgba(255,255,255,0.9); font-size: 18px; margin: 0; }
            
            /* Content */
            .content { padding: 40px 30px; }
            .greeting { font-size: 28px; color: #333333; text-align: center; margin-bottom: 20px; font-weight: bold; }
            .welcome-message { font-size: 16px; color: #666666; line-height: 1.6; text-align: center; margin-bottom: 30px; }
            
            /* Features grid */
            .features-grid { display: block; margin: 30px 0; }
            .feature-card { background: #f8f9ff; border: 2px solid #e2e8ff; border-radius: 12px; padding: 25px 20px; text-align: center; margin-bottom: 20px; }
            .feature-icon { background: linear-gradient(135deg, #7a00ff, #0072ff); color: #ffffff; width: 50px; height: 50px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 15px; }
            .feature-title { font-size: 18px; color: #333333; margin-bottom: 10px; font-weight: bold; }
            .feature-desc { color: #666666; font-size: 14px; line-height: 1.5; }
            
            /* CTA Section */
            .cta-section { text-align: center; margin: 40px 0; }
            .cta-button { display: inline-block; background: linear-gradient(135deg, #7a00ff, #0072ff); color: #ffffff; text-decoration: none; padding: 18px 45px; border-radius: 8px; font-weight: bold; font-size: 18px; }
            
            /* Help section */
            .help-section { background: #f0fff4; border: 1px solid #c6f6d5; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center; }
            .help-title { color: #22543d; font-weight: bold; margin-bottom: 10px; }
            
            /* Footer */
            .footer { background: #f8f9fa; padding: 30px 20px; text-align: center; border-top: 1px solid #e9ecef; }
            .social-links { margin: 20px 0; }
            .social-link { color: #7a00ff; text-decoration: none; margin: 0 10px; font-weight: 600; }
            .copyright { color: #a0aec0; font-size: 12px; margin-top: 15px; }
            
            /* Mobile styles */
            @media only screen and (max-width: 600px) {
              .content { padding: 30px 20px; }
              .header { padding: 40px 20px; }
              .header h1 { font-size: 28px; }
              .greeting { font-size: 24px; }
              .cta-button { padding: 16px 35px; font-size: 16px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <!-- Header -->
            <div class="header">
              <div class="welcome-icon">🎬</div>
              <h1>Welcome to Velura</h1>
              <p>Your streaming adventure begins now!</p>
            </div>
            
            <!-- Content -->
            <div class="content">
              <h2 class="greeting">Hello, ${name}! 🎉</h2>
              <p class="welcome-message">
                We're absolutely thrilled to welcome you to Velura! Get ready to dive into 
                a world of unlimited entertainment with thousands of movies, TV shows, and 
                exclusive content tailored just for you.
              </p>
              
              <!-- Features Grid -->
              <div class="features-grid">
                <div class="feature-card">
                  <div class="feature-icon">🎭</div>
                  <h3 class="feature-title">Unlimited Content</h3>
                  <p class="feature-desc">Thousands of movies, TV shows, and exclusive originals</p>
                </div>
                
                <div class="feature-card">
                  <div class="feature-icon">📱</div>
                  <h3 class="feature-title">Watch Anywhere</h3>
                  <p class="feature-desc">Stream on all your favorite devices</p>
                </div>
                
                <div class="feature-card">
                  <div class="feature-icon">🚀</div>
                  <h3 class="feature-title">Ad-Free Experience</h3>
                  <p class="feature-desc">Enjoy uninterrupted streaming</p>
                </div>
                
                <div class="feature-card">
                  <div class="feature-icon">🔒</div>
                  <h3 class="feature-title">Secure & Private</h3>
                  <p class="feature-desc">Your data and privacy are protected</p>
                </div>
              </div>
              
              <!-- CTA Section -->
              <div class="cta-section">
                <a href="${process.env.CLIENT_URL}/browse" class="cta-button" style="color: #ffffff;">
                  Start Streaming Now
                </a>
              </div>
              
              <!-- Help Section -->
              <div class="help-section">
                <h4 class="help-title">💫 Need Assistance?</h4>
                <p style="color: #276749; font-size: 14px; margin: 0;">
                  Our support team is here to help! Contact us at 
                  <a href="mailto:support@velura.com" style="color: #22543d; font-weight: 600;">
                    support@velura.com
                  </a>
                </p>
              </div>
            </div>
            
            <!-- Footer -->
            <div class="footer">
              <div class="social-links">
                <a href="#" class="social-link">Twitter</a>
                <a href="#" class="social-link">Instagram</a>
                <a href="#" class="social-link">Facebook</a>
                <a href="#" class="social-link">YouTube</a>
              </div>
              
              <p class="copyright">
                © 2024 Velura Stream. All rights reserved.<br>
                123 Entertainment District, Stream City, SC 12345<br>
                This email was sent to ${email}
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await emailManager.sendEmail(mailOptions);
    console.log('✅ Welcome email sent to:', email);
    return info;
  } catch (error) {
    console.error('❌ Error sending welcome email:', error.message);
    throw new Error('Failed to send welcome email: ' + error.message);
  }
};

// Initialize function
export const initializeEmailSystem = async () => {
  return await emailManager.init();
};

// Test function
export const testEmailSetup = async () => {
  try {
    console.log('🧪 Testing email system...');
    
    if (!emailManager.isReady()) {
      await emailManager.init();
    }
    
    if (emailManager.isReady()) {
      console.log('✅ Email system is ready');
      return true;
    } else {
      console.log('❌ Email system is not ready');
      return false;
    }
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    return false;
  }
};

export default {
  sendResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
  initializeEmailSystem,
  testEmailSetup,
  emailManager
};
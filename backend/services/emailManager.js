// backend/services/emailManager.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import fs from 'fs/promises';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.join(__dirname, '..', '.env') });

class EmailManager {
  constructor() {
    this.tokenPath = path.join(__dirname, '..', 'token.json');
    this.initialized = false;
    this.transporter = null;
  }

  // Initialize email system (called by server.js)
  async init() {
    console.log('\n📧 Initializing Email System...');
    
    try {
      // Check if we should skip email setup
      if (process.env.SKIP_EMAIL_SETUP === 'true') {
        console.log('⚠️  Skipping email setup (SKIP_EMAIL_SETUP=true)');
        console.log('📧 Email system: DISABLED');
        return true;
      }

      // Check required config
      const required = ['EMAIL_USER', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
      const missing = required.filter(key => !process.env[key]);
      
      if (missing.length > 0) {
        console.log(`⚠️  Missing email config: ${missing.join(', ')}`);
        console.log('📧 Email system: NOT CONFIGURED (emails will fail)');
        return false;
      }

      // Try to create transporter
      this.transporter = await this.createTransporter();
      
      if (this.transporter) {
        console.log('✅ Email system: READY');
        console.log(`   Account: ${process.env.EMAIL_USER}`);
        this.initialized = true;
        return true;
      }
      
      return false;
    } catch (error) {
      console.log('⚠️  Email system initialization failed:', error.message);
      console.log('📧 Email system: DEGRADED (emails may fail)');
      return false;
    }
  }

  async createTransporter() {
    try {
      console.log('   Creating email transporter...');
      
      // First try to use existing tokens
      const tokens = await this.loadTokens();
      
      if (tokens) {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          'https://developers.google.com/oauthplayground'
        );
        
        oauth2Client.setCredentials(tokens);
        
        // Try to refresh token
        try {
          const { token } = await oauth2Client.getAccessToken();
          
          if (token) {
            // Save refreshed tokens if needed
            const newTokens = oauth2Client.credentials;
            if (newTokens.refresh_token && newTokens.refresh_token !== tokens.refresh_token) {
              await this.saveTokens(newTokens);
            }
            
            return nodemailer.createTransport({
              service: 'gmail',
              auth: {
                type: 'OAuth2',
                user: process.env.EMAIL_USER,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: newTokens.refresh_token || tokens.refresh_token,
                accessToken: token,
              },
            });
          }
        } catch (refreshError) {
          console.log('   Token refresh failed:', refreshError.message);
          // Continue to manual setup
        }
      }
      
      // If no tokens or refresh failed, check if we have .env token
      if (process.env.GMAIL_REFRESH_TOKEN) {
        console.log('   Trying .env refresh token...');
        
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          'https://developers.google.com/oauthplayground'
        );
        
        oauth2Client.setCredentials({
          refresh_token: process.env.GMAIL_REFRESH_TOKEN
        });
        
        try {
          const { token } = await oauth2Client.getAccessToken();
          
          if (token) {
            // Save to token.json for future
            const newTokens = oauth2Client.credentials;
            await this.saveTokens(newTokens);
            
            return nodemailer.createTransport({
              service: 'gmail',
              auth: {
                type: 'OAuth2',
                user: process.env.EMAIL_USER,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: newTokens.refresh_token,
                accessToken: token,
              },
            });
          }
        } catch (envTokenError) {
          console.log('   .env token failed:', envTokenError.message);
        }
      }
      
      // All automatic methods failed
      console.log('   No valid tokens found');
      console.log('📧 Email system: SETUP REQUIRED');
      console.log('   Run: npm run email:setup (after server starts)');
      
      return null;
      
    } catch (error) {
      console.log('   Transporter creation error:', error.message);
      return null;
    }
  }

  async loadTokens() {
    try {
      const data = await fs.readFile(this.tokenPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async saveTokens(tokens) {
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2));
  }

  // Public method to send emails
  async sendEmail(mailOptions) {
    if (!this.initialized || !this.transporter) {
      throw new Error('Email system not initialized');
    }
    
    try {
      return await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Email send error:', error.message);
      throw error;
    }
  }

  isReady() {
    return this.initialized;
  }
}

export default new EmailManager();
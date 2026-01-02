// backend/utils/tokenManager.js
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TokenManager {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
    );
    
    this.tokenPath = path.join(__dirname, '../token.json');
    this.isRefreshing = false;
    this.refreshPromise = null;
  }

  // Load tokens from file
  async loadTokens() {
    try {
      const tokenData = await fs.readFile(this.tokenPath, 'utf8');
      const tokens = JSON.parse(tokenData);
      this.oauth2Client.setCredentials(tokens);
      return tokens;
    } catch (error) {
      console.log('No saved tokens found');
      return null;
    }
  }

  // Save tokens to file
  async saveTokens(tokens) {
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2));
    // Also update .env refresh token for backward compatibility
    await this.updateEnvToken(tokens.refresh_token);
  }

  async updateEnvToken(refreshToken) {
    try {
      const envPath = path.join(__dirname, '../.env');
      let envContent = await fs.readFile(envPath, 'utf8');
      
      if (envContent.includes('GMAIL_REFRESH_TOKEN=')) {
        envContent = envContent.replace(
          /GMAIL_REFRESH_TOKEN=.*/,
          `GMAIL_REFRESH_TOKEN=${refreshToken}`
        );
      } else {
        envContent += `\nGMAIL_REFRESH_TOKEN=${refreshToken}`;
      }
      
      await fs.writeFile(envPath, envContent);
    } catch (error) {
      console.log('Could not update .env file:', error.message);
    }
  }

  // Get valid access token (auto-refreshes if needed)
  async getAccessToken() {
    try {
      // Load saved tokens
      let tokens = await this.loadTokens();
      
      if (!tokens) {
        throw new Error('No tokens available. Run setup first.');
      }

      // Set credentials
      this.oauth2Client.setCredentials(tokens);

      // Get new access token (will auto-refresh if expired)
      const { token } = await this.oauth2Client.getAccessToken();
      
      if (!token) {
        throw new Error('Failed to get access token');
      }

      // Check if token was refreshed
      const newTokens = this.oauth2Client.credentials;
      if (newTokens.refresh_token && newTokens.refresh_token !== tokens.refresh_token) {
        console.log('🔁 Token was refreshed, saving new tokens...');
        await this.saveTokens(newTokens);
      }

      return token;
    } catch (error) {
      console.error('Token error:', error.message);
      
      // If refresh token is invalid, we need to re-authenticate
      if (error.message.includes('invalid_grant')) {
        console.log('⚠️  Refresh token expired. Please re-authenticate.');
        await this.removeTokens();
        throw new Error('REAUTH_REQUIRED');
      }
      
      throw error;
    }
  }

  async removeTokens() {
    try {
      await fs.unlink(this.tokenPath);
      console.log('Old tokens removed');
    } catch (error) {
      // File doesn't exist, that's fine
    }
  }

  // Setup tokens for the first time (run once)
  async setupTokens(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      if (!tokens.refresh_token) {
        throw new Error('No refresh token received. Make sure to request offline access.');
      }

      await this.saveTokens(tokens);
      console.log('✅ Tokens saved successfully!');
      return true;
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  }
}

export default new TokenManager();
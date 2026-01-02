// backend/scripts/email-setup.js - Updated with chalk colors
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import readline from 'readline';
import fs from 'fs';
import chalk from 'chalk'; // Added chalk

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function setupEmail() {
  console.clear();
  console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.white('               📧 VELURA EMAIL SETUP WIZARD               ') + chalk.cyan('║'));
  console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan('║') + chalk.green('  Purpose:   ') + chalk.white('Setup Gmail OAuth for sending emails') + chalk.cyan('   ║'));
  console.log(chalk.cyan('║') + chalk.blue('  Email:     ') + chalk.white(process.env.EMAIL_USER || 'Not configured') + chalk.cyan('   ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝\n'));
  
  // Check if already configured
  const tokenPath = path.join(__dirname, '..', 'token.json');
  
  if (fs.existsSync(tokenPath)) {
    const choice = await askQuestion(chalk.yellow('⚠️  Existing tokens found. Setup again? (y/N): '));
    if (choice.toLowerCase() !== 'y') {
      console.log(chalk.gray('Setup cancelled.'));
      rl.close();
      return;
    }
  }
  
  // Check required config
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'EMAIL_USER'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.log(chalk.red('❌ Missing in .env:'), missing.join(', '));
    console.log(chalk.yellow('   Add them first, then run setup again.'));
    rl.close();
    return;
  }
  
  console.log(chalk.green('✅ Configuration found:'));
  console.log(chalk.white(`   Email: ${process.env.EMAIL_USER}`));
  console.log(chalk.white(`   Client ID: ${process.env.GOOGLE_CLIENT_ID?.substring(0, 20)}...`));
  console.log('\n');
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  
  const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://mail.google.com/',
  ];
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  
  console.log(chalk.cyan('📋 STEP 1: Get Authorization Code'));
  console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.white('1. Open this URL in your browser:'));
  console.log(chalk.underline.blue(authUrl) + '\n');
  console.log(chalk.white('2. Login with: ') + chalk.cyan(process.env.EMAIL_USER));
  console.log(chalk.white('3. Click "Allow" (if "App not verified", click "Advanced" then "Go to app")'));
  console.log(chalk.white('4. Copy the authorization code'));
  console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  
  const code = await askQuestion(chalk.green('✏️  Paste authorization code: '));
  
  try {
    console.log(chalk.cyan('\n🔄 Exchanging code for tokens...'));
    const { tokens } = await oauth2Client.getToken(code.trim());
    
    if (!tokens.refresh_token) {
      console.log(chalk.red('\n❌ ERROR: No refresh token received!'));
      console.log(chalk.yellow('   This happens if you already authorized before.'));
      console.log(chalk.white('   Fix: Go to ') + chalk.underline.blue('https://myaccount.google.com/permissions'));
      console.log(chalk.white('   Remove "Testing" app, then try setup again.'));
      rl.close();
      return;
    }
    
    // Save to token.json
    await fs.promises.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
    
    // Update .env
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = await fs.promises.readFile(envPath, 'utf8');
    
    if (envContent.includes('GMAIL_REFRESH_TOKEN=')) {
      envContent = envContent.replace(
        /GMAIL_REFRESH_TOKEN=.*/,
        `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`
      );
    } else {
      envContent += `\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}`;
    }
    
    await fs.promises.writeFile(envPath, envContent);
    
    console.log(chalk.green('\n✅ SUCCESS! Email setup complete.'));
    console.log(chalk.white('   • Tokens saved to token.json'));
    console.log(chalk.white('   • Refresh token added to .env'));
    console.log(chalk.white('   • Email system is now ready for use.'));
    console.log(chalk.gray('   The system will auto-refresh tokens when needed.\n'));
    
    // Test the setup
    console.log(chalk.cyan('🧪 Testing connection...'));
    oauth2Client.setCredentials(tokens);
    const { token } = await oauth2Client.getAccessToken();
    
    if (token) {
      console.log(chalk.green('✅ Connection test passed!'));
      console.log(chalk.green('✅ Email system is fully operational.\n'));
    }
    
    console.log(chalk.cyan('🚀 Next Steps:'));
    console.log(chalk.white('   Test email: ') + chalk.cyan('npm run email:test'));
    console.log(chalk.white('   Start server: ') + chalk.cyan('npm start'));
    
  } catch (error) {
    console.log(chalk.red('\n❌ Setup failed:'), error.message);
    console.log(chalk.yellow('\n💡 TIPS:'));
    console.log(chalk.white('   • Make sure you copied the entire code'));
    console.log(chalk.white('   • Codes expire after a few minutes'));
    console.log(chalk.white('   • Try the setup process again'));
  } finally {
    rl.close();
  }
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// Run setup
setupEmail();
// backend/scripts/email-test.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import emailManager from '../services/emailManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testEmail() {
  console.log('\n🧪 Email System Test\n');
  
  // Initialize
  const ready = await emailManager.init();
  
  if (!ready) {
    console.log('❌ Email system not ready.');
    console.log('   Run: npm run email:setup');
    process.exit(1);
  }
  
  // Send test email
  try {
    const mailOptions = {
      from: `"Velura Test" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: '✅ Velura Email System Test',
      text: 'This is a test email from your Velura backend. If you receive this, your email system is working correctly!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
            <h1 style="color: #7a00ff;">✅ Email System Test</h1>
            <p>This is a test email from your Velura backend.</p>
            <p>If you receive this, your email system is working correctly!</p>
            <p style="margin-top: 30px; color: #666; font-size: 12px;">
              Sent at: ${new Date().toLocaleString()}
            </p>
          </div>
        </div>
      `
    };
    
    console.log('📤 Sending test email to:', process.env.EMAIL_USER);
    const info = await emailManager.sendEmail(mailOptions);
    
    console.log('\n✅ Test email sent successfully!');
    console.log('📧 Message ID:', info.messageId);
    console.log('\n🎉 Email system is fully operational!');
    
  } catch (error) {
    console.log('\n❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Run: npm run email:setup');
    console.log('   2. Check your .env file has correct values');
    console.log('   3. Make sure you have internet connection');
    process.exit(1);
  }
}

testEmail();
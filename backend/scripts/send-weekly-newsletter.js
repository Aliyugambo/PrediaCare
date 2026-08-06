/**
 * Weekly Health Newspaper Email Sender
 * 
 * This script selects a random health news article from the database and sends it
 * to all active newsletter subscribers. It is intended to be run via a cron job
 * once per week (e.g., every Monday at 8 AM).
 * 
 * Usage:  node backend/scripts/send-weekly-newsletter.js
 * 
 * Cron example (weekly on Monday at 8:00 AM):
 *   0 8 * * 1  /usr/bin/node /path/to/carenix-html/backend/scripts/send-weekly-newsletter.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();
const path = require('path');
const nodemailer = require('nodemailer');

// Load email config
const loadEmailConfig = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || 
      process.env.EMAIL_USER === 'your-email@gmail.com' ||
      process.env.EMAIL_PASS === 'your-app-password') {
    console.log('⚠️  Email not configured. Set EMAIL_USER and EMAIL_PASS in .env');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

async function sendWeeklyNewsletter() {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] Starting weekly health newspaper send...`);

  let connection;
  try {
    // Connect to database
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      user: process.env.MYSQL_USER || 'carenix_user',
      password: process.env.MYSQL_PASSWORD || 'StrongPassword123!',
      database: process.env.MYSQL_DATABASE || 'carenix_clinic',
      port: process.env.MYSQL_PORT || 3306,
      multipleStatements: true
    });
    console.log('Connected to MySQL database');

    // Get a random published health news article
    const [newsRows] = await connection.execute(`
      SELECT id, title, summary, content, category, author, created_at
      FROM health_news
      WHERE status = 'published'
      ORDER BY RAND()
      LIMIT 1
    `);

    if (newsRows.length === 0) {
      console.log('⚠️  No published health news articles found. Skipping.');
      await connection.end();
      return;
    }

    const article = newsRows[0];
    console.log(`📰 Selected article: "${article.title}" (Category: ${article.category})`);

    // Get all active subscribers
    const [subscribers] = await connection.execute(`
      SELECT email, name FROM newsletter_subscribers
      WHERE is_active = 1
      ORDER BY subscribed_at DESC
    `);

    if (subscribers.length === 0) {
      console.log('ℹ️  No active subscribers. Nothing to send.');
      await connection.end();
      return;
    }

    console.log(`📬 Found ${subscribers.length} active subscribers`);

    // Create transporter
    const transporter = loadEmailConfig();
    if (!transporter) {
      console.log('⚠️  Email not configured. Cannot send health newspaper.');
      await connection.end();
      return;
    }

    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const subject = `📰 Weekly Health Newspaper - ${article.title}`;

    let sentCount = 0;
    let failedCount = 0;

    for (const subscriber of subscribers) {
      const displayName = subscriber.name || 'Dear Subscriber';
      const recipientName = displayName.split(' ')[0];

      const html = generateNewsletterHTML(article, recipientName);

      try {
        await transporter.sendMail({
          from: fromAddress,
          to: subscriber.email,
          subject: subject,
          html: html
        });
        sentCount++;
        console.log(`  ✅ Sent to: ${subscriber.email}`);
      } catch (error) {
        failedCount++;
        console.error(`  ❌ Failed to send to: ${subscriber.email}`, error.message);
      }
    }

    await connection.end();

    console.log(`\n📊 Weekly Newsletter Summary:`);
    console.log(`  Total subscribers: ${subscribers.length}`);
    console.log(`  Sent successfully: ${sentCount}`);
    console.log(`  Failed: ${failedCount}`);
    console.log(`[${new Date().toISOString()}] Weekly health newspaper send completed.`);

  } catch (error) {
    console.error('❌ Error in weekly newsletter:', error);
    if (connection) await connection.end();
    process.exit(1);
  }
}

function generateNewsletterHTML(article, recipientName) {
  const formattedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Health Newspaper</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: linear-gradient(135deg, #4CAF50, #2563eb); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .header .date { font-size: 14px; margin-top: 8px; opacity: 0.9; }
    .content { padding: 30px; }
    .greeting { font-size: 18px; margin-bottom: 20px; }
    .article-card { background: #f8fafc; border-left: 4px solid #4CAF50; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .article-title { color: #1e293b; font-size: 22px; margin: 0 0 10px 0; }
    .article-meta { font-size: 13px; color: #64748b; margin-bottom: 15px; }
    .article-category { display: inline-block; background: #e0e7ff; color: #2563eb; padding: 3px 12px; border-radius: 20px; font-size: 12px; text-transform: uppercase; }
    .article-summary { font-size: 16px; color: #475569; margin-bottom: 15px; }
    .article-content { color: #334155; margin-bottom: 15px; font-size: 14px; }
    .read-more { display: inline-block; background: #2563eb; color: white; padding: 10px 24px; text-decoration: none; border-radius: 5px; font-weight: 600; font-size: 14px; }
    .footer { background: #1e293b; color: #94a3b8; padding: 20px; text-align: center; font-size: 12px; }
    .unsubscribe { color: #94a3b8; text-decoration: underline; font-size: 12px; }
    .divider { height: 1px; background: #e2e8f0; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📰 Weekly Health Newspaper</h1>
      <div class="date">${formattedDate}</div>
    </div>
    <div class="content">
      <p class="greeting">Hello ${recipientName},</p>
      
      <p>Welcome to your weekly dose of health insights from PrediaCare Clinic. Here's your featured health article for this week:</p>
      
      <div class="article-card">
        <span class="article-category">${article.category || 'Health'}</span>
        <h2 class="article-title">${article.title}</h2>
        <div class="article-meta">By ${article.author || 'PrediaCare Medical Team'} | Published: ${new Date(article.created_at).toLocaleDateString()}</div>
        <p class="article-summary">${article.summary}</p>
        <p class="article-content">${article.content.substring(0, 400)}${article.content.length > 400 ? '...' : ''}</p>
        <a href="https://www.google.com/search?q=${encodeURIComponent(article.title)}" class="read-more" target="_blank">Read Full Article</a>
      </div>
      
      <div class="divider"></div>
      
      <p><strong>Stay healthy!</strong></p>
      <p>The PrediaCare Clinic Team<br>No 48 Arsenal Road, Sun City Estate, Galadimawa, Abuja</p>
    </div>
    <div class="footer">
      <p>This is your weekly health newspaper from PrediaCare Clinic.</p>
      <p>You received this email because you subscribed to our newsletter.</p>
      <a href="https://www.google.com/search?q=unsubscribe+newsletter" class="unsubscribe">Unsubscribe</a>
      <p>&copy; 2026 PrediaCare Clinic. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

sendWeeklyNewsletter();

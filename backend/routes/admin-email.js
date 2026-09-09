/**
 * Admin Email Routes
 * Endpoints for admins to compose and send emails to system users
 */

const express = require('express');
const pool = require('../config/database');
const { sendEmail } = require('../config/email');
const { checkPermission, PERMISSIONS } = require('../config/permissions');
const router = express.Router();

// ==================== GET USERS FOR SELECTION ====================

router.get('/users', checkPermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  try {
    const { role, search, limit = 100, offset = 0 } = req.query;
    const connection = await pool.getConnection();

    const limitNum = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    let query = 'SELECT id, name, email, role, is_active FROM users WHERE 1=1';
    const params = [];

    if (role && role !== 'all') {
      query += ' AND role = ?';
      params.push(role);
    }

    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY name ASC LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const [users] = await connection.execute(query, params);

    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    if (role && role !== 'all') {
      countQuery += ' AND role = ?';
    }
    if (search) {
      countQuery += ' AND (name LIKE ? OR email LIKE ?)';
    }
    const [countResult] = await connection.execute(
      countQuery,
      role && role !== 'all' ? [role, ...(search ? [`%${search}%`, `%${search}%`] : [])] : (search ? [`%${search}%`, `%${search}%`] : [])
    );

    connection.release();

    res.json({
      success: true,
      data: users,
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching users for email:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== GET USERS BY ROLE (for quick filters) ====================

router.get('/users-by-role', checkPermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT role, COUNT(*) as count FROM users WHERE is_active = TRUE GROUP BY role`
    );
    connection.release();

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching user counts:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== SEND EMAIL ====================

router.post('/send', checkPermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  try {
    const { recipient_ids, recipient_emails, subject, body, html } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ success: false, message: 'Subject and body are required' });
    }

    const connection = await pool.getConnection();

    let emails = [];
    let recipientCount = 0;

    if (recipient_ids && Array.isArray(recipient_ids) && recipient_ids.length > 0) {
      const placeholders = recipient_ids.map(() => '?').join(',');
      const [users] = await connection.execute(
        `SELECT email, name FROM users WHERE id IN (${placeholders}) AND is_active = TRUE`,
        recipient_ids
      );
      emails = users.map(u => ({ email: u.email, name: u.name }));
      recipientCount = emails.length;
    } else if (recipient_emails && Array.isArray(recipient_emails) && recipient_emails.length > 0) {
      emails = recipient_emails.map(email => ({ email, name: email }));
      recipientCount = emails.length;
    } else {
      connection.release();
      return res.status(400).json({ success: false, message: 'No recipients specified' });
    }

    if (emails.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'No valid recipients found' });
    }

    const senderId = req.session.userId || null;
    const senderName = req.session.userName || 'Admin';
    const isHtml = html !== false;
    const content = isHtml
      ? body
      : `<!DOCTYPE html><html><body><pre style="font-family: Arial, sans-serif;">${body}</pre></body></html>`;

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
       <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
         <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
           <img src="https://prediacareclinics.com/assets/images/logo/logo_64.svg" alt="PrediaCare Clinic Logo" width="64" height="64" style="display: block; margin: 0 auto 10px;">
           <h2 style="margin: 0;">${escapeHtml(subject)}</h2>
         </div>
        <div style="background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd;">
          ${content}
        </div>
        <div style="background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; font-size: 12px;">
          <p style="margin: 0;">This message was sent by ${escapeHtml(senderName)} from PrediaCare Clinic.</p>
          <p style="margin: 5px 0 0 0;">© 2026 PrediaCare Clinic. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;

    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const recipient of emails) {
      try {
        const sent = await sendEmail(recipient.email, subject, fullHtml);
        if (sent) successCount++;
        else {
          failedCount++;
          errors.push(`${recipient.email}: send returned false`);
        }
      } catch (emailErr) {
        failedCount++;
        errors.push(`${recipient.email}: ${emailErr.message}`);
      }
    }

    const status = failedCount === 0 ? 'sent' : (successCount === 0 ? 'failed' : 'partial');
    const errorMessage = errors.length > 0 ? errors.slice(0, 5).join('; ') : null;
    const recipientEmailsStr = emails.map(e => e.email).join(', ');

    await connection.execute(
      `INSERT INTO email_history (sender_id, sender_name, recipient_emails, recipient_count, subject, body, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [senderId, senderName, recipientEmailsStr, recipientCount, subject, body, status, errorMessage]
    );

    connection.release();

    res.json({
      success: true,
      message: `Email sent to ${successCount} of ${recipientCount} recipient(s)`,
      sent: successCount,
      failed: failedCount,
      total: recipientCount
    });
  } catch (err) {
    console.error('Error sending bulk email:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== GET EMAIL HISTORY ====================

router.get('/history', checkPermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const connection = await pool.getConnection();

    const limitNum = Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const [history] = await connection.execute(
      `SELECT id, sender_id, sender_name, recipient_count, subject, status, sent_at FROM email_history ORDER BY sent_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`
    );

    const [[countResult]] = await connection.execute('SELECT COUNT(*) as total FROM email_history');

    connection.release();

    res.json({
      success: true,
      data: history,
      total: countResult.total
    });
  } catch (err) {
    console.error('Error fetching email history:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/history/:id', checkPermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT * FROM email_history WHERE id = ?', [id]);
    connection.release();

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error fetching email:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = router;

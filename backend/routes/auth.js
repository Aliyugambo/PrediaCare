const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { sendEmail } = require('../config/email');
const router = express.Router();

// Rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
});

// Register endpoint (patients only - doctors and staff must be created by admin)
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate inputs
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Only patients can self-register. Doctors and staff must be created by admin.
    if (role !== 'patient') {
      return res.status(400).json({ success: false, message: 'Only patients can register themselves. Doctors and staff must be created by the admin.' });
    }

    const connection = await pool.getConnection();

    // Check if email already exists
    const [existingUser] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.length > 0) {
      connection.release();
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into database
    await connection.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    );

    // Get the inserted user's ID
    const [newUser] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    const newUserId = newUser[0].id;

    connection.release();

    const loginUrl = `${process.env.RESET_URL_BASE || 'https://prediacareclinics.com'}/sign-in.html`;
    const welcomeHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .detail { margin: 10px 0; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; }
          .footer { background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; font-size: 12px; }
          .cta-button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Welcome to PrediaCare Clinic</h2>
          </div>
          <div class="content">
            <p>Dear <strong>${name}</strong>,</p>
            <p>Thank you for creating an account with <strong>PrediaCare Clinic</strong>. We're excited to have you on board.</p>
            <p>Your account has been successfully registered. You can now log in to access your patient dashboard, book appointments, and manage your health records.</p>
            <p style="text-align: center;">
              <a href="${loginUrl}" class="cta-button">Proceed to Login</a>
            </p>
            <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from PrediaCare Clinic.</p>
            <p>© 2026 PrediaCare Clinic. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    sendEmail(email, 'Welcome to PrediaCare Clinic', welcomeHtml).catch(() => {});

    res.status(201).json({ 
      success: true, 
      message: 'Registration successful. Please Proceed to email to sign in.' 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// Login endpoint
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validate inputs
    if (!email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Email, password, and role are required' });
    }

    // Validate role (include admin so admins can authenticate)
    if (!['patient', 'doctor', 'staff', 'admin', 'customer_care', 'diagnostic', 'pharmacist', 'nurse', 'bloodbank'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const connection = await pool.getConnection();

    // Find user by email
    const [users] = await connection.execute(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      connection.release();
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      connection.release();
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Verify role matches
    if (user.role !== role) {
      connection.release();
      return res.status(403).json({ 
        success: false, 
        message: `Your account is registered as a ${user.role}, not a ${role}` 
      });
    }

    connection.release();

    // Store user info in session
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;
    req.session.userRole = user.role;

    console.log('=== LOGIN ===');
    console.log('User ID:', user.id);
    console.log('User role:', user.role);
    console.log('Setting session:', { userId: user.id, userRole: user.role, userEmail: user.email });

    // For doctors, also store the doctor profile ID
    if (user.role === 'doctor') {
      try {
        const [doctors] = await pool.execute(
          'SELECT id FROM doctors WHERE user_id = ?',
          [user.id]
        );
        if (doctors.length > 0) {
          req.session.doctorId = doctors[0].id;
          console.log('Doctor profile ID set:', doctors[0].id);
        } else {
          // Create doctor profile if it doesn't exist
          const [newDoctor] = await pool.execute(
            'INSERT INTO doctors (user_id, specialization, qualification, experience_years, consultation_fee, bio) VALUES (?, ?, ?, ?, ?, ?)',
            [user.id, 'General Medicine', '', 0, 0.00, '']
          );
          req.session.doctorId = newDoctor.insertId;
          console.log('Doctor profile created:', newDoctor.insertId);
        }
      } catch (err) {
        console.error('Error fetching/creating doctor ID:', err);
      }
    }

    // Save session explicitly before sending response
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.log('❌ Session save error:', err);
          reject(err);
        } else {
          console.log('✅ Session saved successfully');
          console.log('Session ID:', req.sessionID);
          resolve();
        }
      });
    });

    // Redirect based on role
    // IMPORTANT: Use user.role (from database) not role (from request body) for security
    let redirectUrl = '/patient-dashboard.html';
    console.log('🔍 DEBUG - Redirect logic - Form role:', role, '| DB role:', user.role);
    
    if (user.role === 'doctor') {
      redirectUrl = '/doctor-dashboard.html';
    } else if (user.role === 'staff' || user.role === 'nurse') {
      redirectUrl = '/staff-dashboard.html';
    } else if (user.role === 'admin') {
      redirectUrl = '/admin-dashboard.html';
    } else if (user.role === 'customer_care') {
      redirectUrl = '/customer-care-dashboard.html';
    } else if (user.role === 'diagnostic') {
      redirectUrl = '/diagnostic-dashboard.html';
     } else if (user.role === 'pharmacist') {
      redirectUrl = '/pharmacist-dashboard.html';
    } else if (user.role === 'bloodbank') {
      redirectUrl = '/bloodbank-dashboard.html';
    }
    
    console.log('🔍 DEBUG - Final redirect URL:', redirectUrl);

    res.json({ 
      success: true, 
      message: 'Login successful',
      redirectUrl: redirectUrl,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// Forgot password endpoint - sends reset link to email
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const connection = await pool.getConnection();

    const [users] = await connection.execute(
      'SELECT id, name FROM users WHERE email = ?',
      [email]
    );

    // Always return success to prevent email enumeration, but only send email if user exists
    if (users.length === 0) {
      connection.release();
      return res.json({ success: true, message: 'If an account exists with that email, a password reset link has been sent.' });
    }

    const user = users[0];

    // Generate secure random token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token in database
    await connection.execute(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [resetToken, resetTokenExpires, user.id]
    );

    connection.release();

    // Build reset URL
    const resetUrl = `${process.env.RESET_URL_BASE || 'https://prediacareclinics.com'}/reset-password.html?token=${resetToken}`;

    // Send email
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .cta-button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          .footer { background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>PrediaCare Clinic - Password Reset</h2>
          </div>
          <div class="content">
            <p>Dear <strong>${user.name}</strong>,</p>
            <p>You requested to reset your password. Click the button below to set a new password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="cta-button">Reset Password</a>
            </p>
            <p>This link will expire in 15 minutes. If you did not request this, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from PrediaCare Clinic.</p>
            <p>© 2026 PrediaCare Clinic. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail(email, 'Password Reset Request - PrediaCare Clinic', emailHtml);

    res.json({ success: true, message: 'If an account exists with that email, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Reset password endpoint
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    const connection = await pool.getConnection();

    const [users] = await connection.execute(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
      [token]
    );

    if (users.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await connection.execute(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [hashedPassword, users[0].id]
    );

    connection.release();

    res.json({ success: true, message: 'Password reset successfully. You can now sign in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Get current user session
router.get('/user', (req, res) => {
  console.log('\n=== /user endpoint called ===');
  console.log('Session ID:', req.sessionID);
  console.log('Session cookie:', req.headers.cookie);
  console.log('Session exists:', !!req.session);
  console.log('Session keys:', req.session ? Object.keys(req.session) : 'no session');
  console.log('Session userId:', req.session?.userId);
  console.log('Session userRole:', req.session?.userRole);
  console.log('Session store type:', typeof req.sessionStore);
  
  // Prevent caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  if (!req.session.userId) {
    console.log('❌ No userId in session - returning 401');
    return res.status(401).json({ success: false, message: 'Not logged in', code: 'NO_SESSION' });
  }

  const userData = {
    id: req.session.userId,
    name: req.session.userName,
    email: req.session.userEmail,
    role: req.session.userRole
  };

  console.log('✅ Returning user data:', userData);
  console.log('🔍 DEBUG - Role being sent:', req.session.userRole, '| Type:', typeof req.session.userRole);

  // doctors may need their profile id on the client for debugging/queries
  if (req.session.userRole === 'doctor') {
    userData.doctorId = req.session.doctorId || null;
  }

  res.json({ 
    success: true, 
    user: userData
  });
});

module.exports = router;

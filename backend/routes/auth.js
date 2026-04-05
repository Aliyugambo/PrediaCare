const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
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

    res.status(201).json({ 
      success: true, 
      message: 'Registration successful. Please sign in.' 
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
    if (!['patient', 'doctor', 'staff', 'admin', 'customer_care', 'diagnostic', 'pharmacist'].includes(role)) {
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
    } else if (user.role === 'staff') {
      redirectUrl = '/staff-dashboard.html';
    } else if (user.role === 'admin') {
      redirectUrl = '/admin-dashboard.html';
    } else if (user.role === 'customer_care') {
      redirectUrl = '/customer-care-dashboard.html';
    } else if (user.role === 'diagnostic') {
      redirectUrl = '/diagnostic-dashboard.html';
    } else if (user.role === 'pharmacist') {
      redirectUrl = '/pharmacist-dashboard.html';
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
  console.log('Session:', req.session);
  console.log('Session userId:', req.session?.userId);
  console.log('Session userRole:', req.session?.userRole);
  
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

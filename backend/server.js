const express = require('express');
const path = require('path');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const mysql2 = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const pool = require('./config/database');
const authRoutes = require('./routes/auth');
const doctorsRoutes = require('./routes/doctors');
const appointmentsRoutes = require('./routes/appointments');
const messagesRoutes = require('./routes/messages');
const resultsRoutes = require('./routes/results');
const medicationsRoutes = require('./routes/medications');
const healthSummaryRoutes = require('./routes/health-summary');
const doctorRoutes = require('./routes/doctor');
const adminRoutes = require('./routes/admin');
const staffRoutes = require('./routes/staff');
const customerCareRoutes = require('./routes/customer-care');
const diagnosticRoutes = require('./routes/diagnostic');
const healthTipsRoutes = require('./routes/health-tips');
const pharmacyRoutes = require('./routes/pharmacy');
const billingRoutes = require('./routes/billing');

const app = express();

// Serve static files from root directory
app.use(express.static(path.join(__dirname, '..')));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Session configuration
const cookieSecure = process.env.NODE_ENV === 'production';
const rateLimit = require('express-rate-limit');
const csurf = require('csurf');
const helmet = require('helmet');

// Basic security headers
app.use(helmet());

// Fail fast if session secret is not provided
if (!process.env.SESSION_SECRET) {
  console.error('Missing SESSION_SECRET environment variable. Set SESSION_SECRET in .env');
  process.exit(1);
}

app.use(session({
  key: 'carenix_session',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: cookieSecure,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Rate limiter - apply globally but with tighter limits for auth endpoints below
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// CSRF protection (requires sessions)
// skip for authentication endpoints so users can register/login without a token
// also skip for API endpoints that rely on session-based auth
app.use((req, res, next) => {
  // paths like /api/auth/register, /api/auth/login
  if (req.path.startsWith('/api/auth/')) {
    return next();
  }
  // Skip CSRF for specific API endpoints (they use session-based auth, not CSRF tokens)
  const csrfExemptPaths = [
    '/api/auth',
    '/api/appointments',
    '/api/messages',
    '/api/medications',
    '/api/results',
    '/api/health-summary',
    '/api/doctor',
    '/api/admin',
    '/api/upload',
    '/api/staff',
    '/api/customer-care',
    '/api/diagnostic',
    '/api/pharmacy',
    '/api/billing'
  ];
  if (csrfExemptPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  // install csurf middleware for other paths
  return csurf()(req, res, next);
});

// Expose CSRF token for frontend clients (for single-page apps)
app.use((req, res, next) => {
  // Only provide token for safe requests to avoid overhead
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    try {
      const token = req.csrfToken ? req.csrfToken() : undefined;
      if (token) res.setHeader('XSRF-TOKEN', token);
    } catch (err) {
      // csurf may throw if no session; ignore and continue
    }
  }
  next();
});

// CORS middleware - allow all origins for development with credentials
// Note: When credentials are true, origin cannot be '*' - must use specific origin
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    // Also allow localhost and file:// for development
    if (!origin || 
        origin.startsWith('http://localhost') || 
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('file://')) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins in development
    }
  },
  credentials: true
}));

// Add headers middleware for static files and API (REMOVED - causes duplicate headers and conflicts with cors middleware)
// The cors middleware above already handles CORS properly

// Session refresh middleware - update session on each request to keep it alive
app.use((req, res, next) => {
  if (req.session) {
    // Touch the session to reset the maxAge timer
    req.session.touch();
  }
  next();
});

// Handle preflight requests
app.options('*', (req, res) => {
  res.sendStatus(200);
});

// File upload configuration
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images, PDF, and DOC files are allowed'));
  }
});

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  
  res.json({
    success: true,
    message: 'File uploaded successfully',
    filePath: req.file.path,
    fileName: req.file.filename,
    originalName: req.file.originalname
  });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Patient feature routes
app.use('/api/doctors', doctorsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/medications', medicationsRoutes);
app.use('/api/health-summary', healthSummaryRoutes);

// Doctor feature routes
app.use('/api/doctor', doctorRoutes);

// Staff feature routes (lab workers, receptionists)
app.use('/api/staff', staffRoutes);

// Customer Care Staff routes
app.use('/api/customer-care', customerCareRoutes);

// Diagnostic Staff routes
app.use('/api/diagnostic', diagnosticRoutes);

// Health Tips routes (public)
app.use('/api/health-tips', healthTipsRoutes);

// Admin routes for user and role management
app.use('/api/admin', adminRoutes);

// Pharmacy routes
app.use('/api/pharmacy', pharmacyRoutes);

// Billing routes
app.use('/api/billing', billingRoutes);

// Middleware to check authentication
const checkAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  next();
};

// Middleware to check role
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    console.log('🔍 checkRole middleware - Session:', req.session?.userId, '| Role:', req.session?.userRole, '| Allowed:', allowedRoles);
    
    if (!req.session.userId) {
      console.log('❌ checkRole failed: No session userId');
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.session.userRole)) {
      console.log('❌ checkRole failed: Role', req.session.userRole, 'not in allowed roles', allowedRoles);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    console.log('✅ checkRole passed');
    next();
  };
};

// Protected dashboard routes - serve only if authenticated with correct role
app.get('/patient-dashboard.html', checkRole(['patient']), (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'patient-dashboard.html'));
});

app.get('/doctor-dashboard.html', checkRole(['doctor']), (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'doctor-dashboard.html'));
});

app.get('/staff-dashboard.html', checkRole(['staff', 'admin']), (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'staff-dashboard.html'));
});

app.get('/pharmacist-dashboard.html', checkRole(['pharmacist', 'admin']), (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'pharmacist-dashboard.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

module.exports = app;

if (!process.env.PASSENGER_APP_ENV) {
    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
        console.log(`Running on ${PORT}`);
    });
}

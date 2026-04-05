# Carenix Clinic Website - Complete Authentication System

## Overview
Your clinic website now includes a complete role-based authentication system with Node.js/Express backend and MySQL database. Users can register, login, and access role-specific dashboards (Patient, Doctor, Staff).

## What's New

### Backend Files Created:
- **backend/server.js** - Express server with authentication routes and session management
- **backend/init-db.js** - Database initialization script with sample users
- **backend/routes/auth.js** - Authentication endpoints (register, login, logout)
- **backend/config/database.js** - MySQL connection pool configuration
- **backend/package.json** - Node.js dependencies and scripts
- **backend/.env.example** - Environment variables template
- **backend/SETUP_GUIDE.md** - Detailed setup instructions

### Updated HTML Files:
- **sign-in.html** - Updated form to send credentials to backend API
- **register.html** - Updated form to register users with role selection

## Quick Start (5 Minutes)

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure MySQL
Edit `backend/.env`:
```env
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=carenix_clinic
PORT=5000
SESSION_SECRET=change-this-to-something-random
```

### 3. Create Database
```bash
node init-db.js
```

### 4. Start Backend Server
```bash
npm start
```

### 5. Serve HTML Files (Another Terminal)
```bash
cd ..
python -m http.server 80
```

### 6. Test
Open browser: `http://localhost/sign-in.html`

## Sample Test Accounts

After database initialization:

| Role   | Email               | Password  | Dashboard              |
|--------|-------------------|-----------|------------------------|
| Patient| patient@example.com | patient123 | patient-dashboard.html |
| Doctor | doctor@example.com  | doctor123  | doctor-dashboard.html  |
| Staff  | staff@example.com   | staff123   | staff-dashboard.html   |

## Authentication Flow

```
User visits sign-in.html
        ↓
Enters email, password, role
        ↓
Form POSTs to /api/auth/login
        ↓
Backend validates credentials against MySQL
        ↓
If valid: Creates session, returns redirect URL
        ↓
Frontend redirects to appropriate dashboard
        ↓
Backend middleware checks session before serving dashboard
        ↓
User gains access to role-specific dashboard
```

## Key Features

✅ **Password Security**
- Passwords hashed with bcryptjs (10 salt rounds)
- Never stored in plain text

✅ **Session Management**
- Express-session with MySQL session store
- 24-hour session timeout
- Secure HTTP-only cookies

✅ **Role-Based Access Control**
- Patient, Doctor, Staff roles
- Role mismatch detection (e.g., patient account can't login as doctor)
- Protected dashboard routes

✅ **Error Handling**
- Email validation
- Duplicate email detection
- Password confirmation
- Role validation
- User-friendly error messages

✅ **API Security**
- CORS enabled for localhost
- Session-based authentication
- No stored passwords in response

## API Endpoints

### Register User
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "patient"
}
```

### Login User
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "patient@example.com",
  "password": "patient123",
  "role": "patient"
}
```

### Get Current User
```
GET /api/auth/user
```

### Logout User
```
POST /api/auth/logout
```

## Database Schema

### users table
```
id (PK) | name | email (UNIQUE) | password_hash | role (ENUM) | created_at | updated_at
```

### sessions table
```
session_id (PK) | expires | data | created_at | updated_at
```

## File Structure

```
carenix-html/
├── backend/
│   ├── config/
│   │   └── database.js          # MySQL connection
│   ├── routes/
│   │   └── auth.js              # Authentication endpoints
│   ├── init-db.js               # Database setup script
│   ├── server.js                # Express server
│   ├── package.json             # Dependencies
│   ├── .env                     # Configuration (create from .env.example)
│   ├── .env.example             # Configuration template
│   ├── SETUP_GUIDE.md           # Detailed setup guide
│   └── node_modules/            # Dependencies (created by npm install)
│
├── sign-in.html                 # ✓ Updated with API integration
├── register.html                # ✓ Updated with API integration
├── patient-dashboard.html       # Create this (protected)
├── doctor-dashboard.html        # Create this (protected)
├── staff-dashboard.html         # Create this (protected)
├── [other HTML files]
└── assets/                      # CSS, JS, images
```

## Troubleshooting

### Backend won't start
1. Check if Node.js is installed: `node -v`
2. Check if MySQL is running
3. Check `.env` file has correct database credentials
4. Check if port 5000 is not in use: `lsof -i :5000`

### Login fails with "Invalid email or password"
1. Check email is correct
2. Verify user exists in database
3. Password is case-sensitive

### Login succeeds but redirects fail
1. Make sure HTML files are served from `http://localhost` (not `file://`)
2. Check browser console for CORS errors
3. Verify backend is running on `http://localhost:5000`

### MySQL connection errors
1. Start MySQL service
2. Verify credentials in `.env`
3. Check database name matches
4. Run `node init-db.js` to create tables

### Port 5000 already in use
```bash
# Kill process on port 5000
lsof -i :5000
kill -9 <PID>

# Or use different port in .env
PORT=5001
```

## Next Steps

1. **Create Dashboard Pages**
   - patient-dashboard.html
   - doctor-dashboard.html
   - staff-dashboard.html

2. **Add Logout Button**
   - Add this to your dashboards:
   ```html
   <button onclick="logout()">Logout</button>
   <script>
   async function logout() {
     const res = await fetch('http://localhost:5000/api/auth/logout', {method: 'POST'});
     if(res.ok) window.location.href = 'sign-in.html';
   }
   </script>
   ```

3. **Display User Info**
   - Add this to get current user:
   ```javascript
   fetch('http://localhost:5000/api/auth/user')
     .then(r => r.json())
     .then(data => console.log(data.user))
   ```

4. **Implement Features**
   - Patient appointments
   - Doctor schedule
   - Staff attendance
   - User profile management
   - Password reset

## Environment Variables

```env
# MySQL Configuration
MYSQL_HOST=localhost              # Database host
MYSQL_USER=root                   # Database user
MYSQL_PASSWORD=password           # Database password
MYSQL_DATABASE=carenix_clinic     # Database name

# Server Configuration
PORT=5000                         # Express server port
NODE_ENV=development              # development or production

# Security
SESSION_SECRET=your-secret-key    # Session encryption key (change this!)
```

## Security Checklist

- [ ] Change SESSION_SECRET in .env to random value
- [ ] Use strong MySQL password (not just "password")
- [ ] Store .env file securely (never commit to git)
- [ ] Implement HTTPS in production
- [ ] Add rate limiting for login attempts
- [ ] Add email verification for registration
- [ ] Implement password reset functionality
- [ ] Add CSRF protection
- [ ] Sanitize all user inputs
- [ ] Use environment variables for sensitive data

## Support Resources

- **Node.js Docs:** https://nodejs.org/docs/
- **Express Docs:** https://expressjs.com/
- **MySQL Docs:** https://dev.mysql.com/doc/
- **bcryptjs:** https://www.npmjs.com/package/bcryptjs
- **Express-session:** https://www.npmjs.com/package/express-session

## Questions?

Check the following in order:
1. Terminal output for error messages
2. Browser console (F12) for frontend errors
3. SETUP_GUIDE.md for detailed instructions
4. MySQL error logs

---

**Created:** February 2026
**Technology:** Node.js + Express + MySQL + bcryptjs
**Authentication:** Session-based with role verification

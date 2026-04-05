# Carenix Clinic - Backend Setup Guide

## Overview
This guide helps you set up the Node.js/Express backend with MySQL authentication for your Carenix clinic website.

## Prerequisites
- Node.js (v14 or higher) - [Download](https://nodejs.org/)
- MySQL Server (v5.7 or higher) - [Download](https://dev.mysql.com/downloads/mysql/)
- npm (comes with Node.js)

## Setup Instructions

### Step 1: Install MySQL
1. Download and install MySQL Server from https://dev.mysql.com/downloads/mysql/
2. During installation, note your MySQL username (usually 'root') and password
3. Start the MySQL service

### Step 2: Configure Environment Variables
1. Copy `.env.example` to `.env` in the backend folder:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Edit `backend/.env` with your MySQL credentials:
   ```
   MYSQL_HOST=localhost
   MYSQL_USER=root
   MYSQL_PASSWORD=your_mysql_password
   MYSQL_DATABASE=carenix_clinic
   PORT=5000
   SESSION_SECRET=your-secret-key-change-this
   ```

### Step 3: Install Dependencies
```bash
cd backend
npm install
```

### Step 4: Initialize Database
Run the database initialization script to create tables and sample users:
```bash
node init-db.js
```

Expected output:
```
Connected to MySQL
Database created or already exists
Users table created or already exists
Sessions table created or already exists
Sample patient created (patient@example.com / patient123)
Sample doctor created (doctor@example.com / doctor123)
Sample staff created (staff@example.com / staff123)
Database initialization completed successfully!
```

### Step 5: Start the Backend Server
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

You should see:
```
Server running on http://localhost:5000
Make sure MySQL is running and .env is configured
```

### Step 6: Test the Setup
Open your browser and go to `http://localhost` (make sure your HTML files are served via HTTP)

## Sample Test Accounts

After initialization, you can test with these accounts:

**Patient Account:**
- Email: `patient@example.com`
- Password: `patient123`
- Role: Patient

**Doctor Account:**
- Email: `doctor@example.com`
- Password: `doctor123`
- Role: Doctor

**Staff Account:**
- Email: `staff@example.com`
- Password: `staff123`
- Role: Staff

## API Endpoints

### POST /api/auth/register
Register a new user.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "patient"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Registration successful. Please sign in."
}
```

### POST /api/auth/login
Authenticate user and create session.

**Request:**
```json
{
  "email": "patient@example.com",
  "password": "patient123",
  "role": "patient"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "redirectUrl": "/patient-dashboard.html",
  "user": {
    "id": 1,
    "name": "John Patient",
    "email": "patient@example.com",
    "role": "patient"
  }
}
```

### POST /api/auth/logout
Destroy user session.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### GET /api/auth/user
Get current logged-in user information.

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "name": "John Patient",
    "email": "patient@example.com",
    "role": "patient"
  }
}
```

## Database Schema

### users table
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('patient', 'doctor', 'staff') NOT NULL DEFAULT 'patient',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### sessions table
```sql
CREATE TABLE sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin PRIMARY KEY,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Troubleshooting

### "Error: connect ECONNREFUSED 127.0.0.1:3306"
- MySQL server is not running
- Start MySQL: 
  - Windows: Services > MySQL80 > Start
  - Mac: System Preferences > MySQL > Start MySQL Server
  - Linux: `sudo systemctl start mysql`

### "Error: ER_ACCESS_DENIED_FOR_USER"
- MySQL password is incorrect
- Update `MYSQL_PASSWORD` in `.env` file
- Or reset MySQL password

### "Error: ER_BAD_DB_ERROR"
- Database not initialized
- Run `node init-db.js` again

### CORS Error in Browser
- Make sure backend is running on `http://localhost:5000`
- HTML files should be served from `http://localhost` (not `file://`)

## Serving HTML Files

To properly serve your HTML files, use a simple HTTP server:

**Option 1: Using Python (if installed)**
```bash
# From the carenix-html directory (not backend)
python -m http.server 80
# or
python -m http.server 8000
```

**Option 2: Using Node.js**
```bash
# Install globally
npm install -g http-server

# Run from carenix-html directory
http-server -p 80
```

**Option 3: Using PHP**
```bash
php -S localhost:80
```

Then access: `http://localhost/sign-in.html`

## File Structure

```
carenix-html/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── routes/
│   │   └── auth.js
│   ├── package.json
│   ├── server.js
│   ├── init-db.js
│   ├── .env
│   └── .env.example
├── sign-in.html (updated with API calls)
├── register.html (updated with API calls)
├── patient-dashboard.html
├── doctor-dashboard.html
├── staff-dashboard.html
└── [other HTML files]
```

## Testing the Authentication Flow

1. **Register a new user:**
   - Go to `http://localhost/register.html`
   - Fill in the form with name, email, password, and select a role
   - Click Sign Up
   - You should see "Registration successful. Please sign in."
   - Redirected to sign-in page

2. **Login:**
   - Go to `http://localhost/sign-in.html`
   - Enter email, password, and select the same role as registered
   - Click Sign In
   - Should be redirected to appropriate dashboard based on role

3. **Try wrong credentials:**
   - Try logging in with wrong password
   - Should see error message

4. **Try mismatched role:**
   - Register as patient
   - Try logging in as doctor
   - Should see error: "Your account is registered as a patient, not a doctor"

## Next Steps

1. Create actual dashboard pages (patient-dashboard.html, doctor-dashboard.html, staff-dashboard.html)
2. Add logout button to dashboards that calls `/api/auth/logout`
3. Add user profile pages
4. Implement password reset functionality
5. Add email verification for registrations

## Security Notes

- Change `SESSION_SECRET` in `.env` to a strong random value
- Use HTTPS in production
- Implement rate limiting on login/register endpoints
- Add email verification for new accounts
- Implement password reset functionality
- Use strong password requirements

## Support

For issues or questions, check:
1. Backend server logs
2. MySQL error logs
3. Browser console (F12 > Console tab)
4. Network tab to see API requests/responses

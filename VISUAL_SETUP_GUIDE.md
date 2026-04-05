# Visual Setup Guide - Step by Step

## What You Need

1. **Node.js** - https://nodejs.org/ (Download LTS version)
2. **MySQL Server** - https://dev.mysql.com/downloads/mysql/
3. **Text Editor** - VS Code, Sublime Text, etc.
4. **Terminal/Command Prompt**

---

## Step-by-Step Installation

### ✅ Step 1: Check Prerequisites (2 minutes)

Open terminal and run:

```bash
node -v
npm -v
mysql --version
```

You should see version numbers. If not, install the missing software.

---

### ✅ Step 2: Start MySQL (1 minute)

**Windows:**
- Services > MySQL80 > Right-click > Start

**Mac:**
- System Preferences > MySQL > Start MySQL Server

**Linux:**
```bash
sudo systemctl start mysql
```

---

### ✅ Step 3: Install Backend Dependencies (2 minutes)

Navigate to backend folder:

```bash
cd carenix-html/backend
npm install
```

Wait for it to finish. You'll see many packages being installed.

Expected output:
```
added 68 packages, and audited 69 packages in 3s
```

---

### ✅ Step 4: Configure Database (2 minutes)

Copy the example file:

```bash
cp .env.example .env
```

Edit `.env` file with your MySQL password:

```env
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your_password_here    ← Change this!
MYSQL_DATABASE=carenix_clinic
PORT=5000
SESSION_SECRET=super-secret-key-12345
```

**Windows users:** Use Notepad or VS Code to edit
**Mac/Linux users:** Use `nano`, `vim`, or any editor

---

### ✅ Step 5: Create Database (2 minutes)

Still in backend folder, run:

```bash
node init-db.js
```

You should see:
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

✅ **Database is ready!**

---

### ✅ Step 6: Start Backend Server (1 minute)

```bash
npm start
```

You should see:
```
Server running on http://localhost:5000
Make sure MySQL is running and .env is configured
```

✅ **Backend is running!**

---

### ✅ Step 7: Serve HTML Files (1 minute)

**Open a NEW terminal window** (keep the first one running)

Navigate to main folder:

```bash
cd carenix-html
```

Choose one method:

**Option A: Python (if installed)**
```bash
python -m http.server 80
```

**Option B: Node.js http-server**
```bash
npm install -g http-server
http-server -p 80
```

**Option C: PHP (if installed)**
```bash
php -S localhost:80
```

You should see:
```
Serving on http://localhost:80
```

✅ **Frontend is running!**

---

## Testing (3 minutes)

### Open Browser

Go to: `http://localhost/sign-in.html`

You should see your login page.

### Test Login

Enter these credentials:
- **Email:** patient@example.com
- **Password:** patient123
- **Role:** Patient

Click "Sign In"

✅ Should redirect to patient-dashboard.html

### Test Another Account

Go to: `http://localhost/sign-in.html` again

Try:
- **Email:** doctor@example.com
- **Password:** doctor123
- **Role:** Doctor

Click "Sign In"

✅ Should redirect to doctor-dashboard.html

### Test Registration

Go to: `http://localhost/register.html`

Fill in:
- **Name:** Test User
- **Email:** test123@example.com
- **Password:** mypassword123
- **Confirm Password:** mypassword123
- **Role:** Patient
- Check "I agree with Terms"

Click "Sign Up"

✅ Should show success message and redirect to login

### Login with New Account

Go to: `http://localhost/sign-in.html`

Enter:
- **Email:** test123@example.com
- **Password:** mypassword123
- **Role:** Patient

✅ Should login successfully

---

## Troubleshooting Guide

### Problem: "Cannot find module 'express'"

**Solution:**
```bash
cd backend
npm install
```

---

### Problem: "Error: connect ECONNREFUSED"

**Solution:** MySQL is not running

**Windows:** Start MySQL from Services
**Mac:** Start from System Preferences
**Linux:** `sudo systemctl start mysql`

---

### Problem: "Error: ER_ACCESS_DENIED_FOR_USER"

**Solution:** Wrong MySQL password in `.env`

Edit `.env` with correct password, then restart server:
```bash
npm start
```

---

### Problem: "Port 5000 already in use"

**Solution:** Another app is using port 5000

**Option 1:** Kill the process
```bash
lsof -i :5000
kill -9 <PID>
```

**Option 2:** Change port in `.env`
```env
PORT=5001
```

---

### Problem: "CORS error in browser"

**Solution:** HTML files not served over HTTP

❌ Wrong: `file:///home/user/carenix-html/sign-in.html`
✅ Right: `http://localhost/sign-in.html`

Make sure you're running a web server (Step 7)

---

### Problem: "Login works but page stays on same page"

**Solution:** Create dashboard pages

Create these files:
- `patient-dashboard.html`
- `doctor-dashboard.html`  
- `staff-dashboard.html`

Use LOGOUT_COMPONENT.html as template.

---

## Architecture Diagram

```
Your Browser
    ↓
    │ http://localhost/sign-in.html
    ↓
Web Server
(serving HTML files)
    ↓
    │ POST /api/auth/login
    ↓
Backend Server
(http://localhost:5000)
    ↓
    │ Query User
    ↓
MySQL Database
(carenix_clinic)
```

---

## Terminal Windows

You should have **TWO terminal windows open**:

**Terminal 1 (Backend):**
```
$ npm start
Server running on http://localhost:5000
```

**Terminal 2 (Frontend):**
```
$ python -m http.server 80
Serving on http://localhost:80
```

---

## File Locations

Important files are here:

```
/home/thinktwice/my-codes/clinic/carenix-html/
├── backend/
│   ├── .env ← MySQL password goes here
│   ├── server.js ← Backend code
│   └── package.json ← Dependencies
│
├── sign-in.html ← Login page
├── register.html ← Registration page
└── AUTHENTICATION_README.md ← Full docs
```

---

## Next Steps

Once everything is working:

1. **Create Dashboard Pages**
   - Copy LOGOUT_COMPONENT.html content
   - Create patient-dashboard.html
   - Create doctor-dashboard.html
   - Create staff-dashboard.html

2. **Add Features**
   - User profile pages
   - Appointment system
   - Doctor schedule
   - Staff attendance

3. **Deploy**
   - Move to production server
   - Update URLs from localhost
   - Get SSL certificate (HTTPS)
   - Configure domain name

---

## Quick Reference Commands

```bash
# Navigate to backend
cd carenix-html/backend

# Install dependencies (first time only)
npm install

# Create database (first time only)
node init-db.js

# Start backend server
npm start

# In another terminal, serve HTML
cd carenix-html
python -m http.server 80

# Check if port is in use
lsof -i :5000
```

---

## Common Errors & Solutions

| Error | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED` | MySQL not running | Start MySQL service |
| `ER_ACCESS_DENIED` | Wrong password | Update `.env` file |
| `EADDRINUSE` | Port 5000 in use | Kill process or change port |
| `CORS error` | Not using http:// | Use web server in Step 7 |
| `Module not found` | Dependencies not installed | Run `npm install` |
| `Cannot find .env` | File not created | Run `cp .env.example .env` |

---

## Success Signs

✅ All of these should work:

1. Terminal shows: "Server running on http://localhost:5000"
2. Browser opens: http://localhost/sign-in.html (shows login form)
3. Login with patient@example.com / patient123 works
4. New registration at http://localhost/register.html works
5. Can login with newly created account
6. No errors in browser console (F12)

---

## Need Help?

Check these files for more info:

1. `backend/SETUP_GUIDE.md` - Detailed setup
2. `AUTHENTICATION_README.md` - Full system info
3. `IMPLEMENTATION_COMPLETE.md` - What was built
4. `LOGOUT_COMPONENT.html` - Logout code

---

## Time Estimate

- ⏱️ Prerequisites check: 2 min
- ⏱️ Start MySQL: 1 min
- ⏱️ Install dependencies: 2 min
- ⏱️ Configure database: 2 min
- ⏱️ Create database: 2 min
- ⏱️ Start servers: 2 min
- ⏱️ Test authentication: 3 min

**Total: ~15 minutes to working system**

---

**You're all set! Good luck with your clinic website! 🏥**

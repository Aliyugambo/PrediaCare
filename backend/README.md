# Carenix Backend Instructions

This folder contains the Express-based backend for the Carenix clinic application. It uses session-based authentication and role/permission-based access control.

## Setup

1. Copy `.env.example` to `.env` and fill in values:
   ```env
   MYSQL_HOST=127.0.0.1
   MYSQL_USER=carenix_user
   MYSQL_PASSWORD=your_db_pass
   MYSQL_DATABASE=carenix_clinic
   SESSION_SECRET=some_long_random_string
   NODE_ENV=development
   COOKIE_SECURE=false
   ```

2. Install dependencies and initialize database:
   ```bash
   cd backend
   npm install
   node init-db.js
   ```
   The initializer will create an admin user (`admin@example.com`/`admin123`), a patient, several doctors and a staff account for testing.

3. Start the server:
   ```bash
   npm run dev
   ```

## Registration rules

- Anyone may self-register through `POST /api/auth/register` as a **patient** or **doctor** (not staff).
- **Staff** accounts must be created by an administrator using the admin API.

## Admin API

All routes under `/api/admin` require a logged-in user with the `MANAGE_USERS` permission (role `admin` by default).

- `POST /api/admin/create-user` – create a doctor or staff account.
- `POST /api/admin/set-role` – change a user’s role to doctor or staff.
- `POST /api/admin/set-user-permissions` – assign extra permissions to a user.
- `POST /api/admin/clear-user-permissions` – remove custom permissions.
- `GET /api/admin/user-permissions/:id` – view a user’s role, overrides, and effective permissions.

> **Note**: The admin endpoint does _not_ allow creating patients or additional admins; these must be handled manually.

## Roles and permissions

See `backend/config/permissions.js` for a full list. A new `admin` role has been added with all permissions and is used for user management. The system supports per-user permission overrides stored in `backend/config/user_permissions.json`.

## Security

- Strict session secret required.
- CSRF protection enabled (`csurf`).
- Rate limiting applied globally and on auth endpoints.
- Uses `helmet` for HTTP headers.

## Extending

If you want permission overrides stored in the database instead of a JSON file, create a `user_permissions` table and update `config/permissions.js` accordingly.


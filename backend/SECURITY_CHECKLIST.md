Security checklist for Carenix backend

- [ ] Move all secrets to environment variables (.env) and never commit .env
- [ ] Use strong `SESSION_SECRET` and `MYSQL_PASSWORD` in production
- [ ] Ensure `cookie.secure=true` in production (HTTPS)
- [ ] Restrict registration to `patient` or require admin approval for elevated roles
- [ ] Add rate limiting on auth endpoints (implemented)
- [ ] Add CSRF protection for session-based flows (implemented; clients must send token)
- [ ] Add input validation and sanitization on all endpoints
- [ ] Enable logging and alerting for repeated failed logins
- [ ] Encourage use of HTTPS and HSTS
- [ ] Periodically rotate secrets and database credentials
- [ ] Review database user privileges (principle of least privilege)
- [ ] Run dependency vulnerability scans (npm audit)

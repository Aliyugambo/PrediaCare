const mysql = require('mysql2/promise');
const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '../.env')
});

// Require important DB env vars — fail fast if missing in production
if (!process.env.MYSQL_PASSWORD || !process.env.MYSQL_USER || !process.env.MYSQL_DATABASE) {
  console.error('Missing required MySQL environment variables. Please set MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE.');
  process.exit(1);
}

console.log('🔍 DB Config loaded:', {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'unknown',
  database: process.env.MYSQL_DATABASE || 'unknown',
  hasPassword: !!process.env.MYSQL_PASSWORD
});

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 30000,
  // For cloud DBs like Aiven
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

module.exports = pool;

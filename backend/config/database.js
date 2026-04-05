const mysql = require('mysql2/promise');
require('dotenv').config();

// Require important DB env vars — fail fast if missing in production
if (!process.env.MYSQL_PASSWORD || !process.env.MYSQL_USER || !process.env.MYSQL_DATABASE) {
  console.error('Missing required MySQL environment variables. Please set MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE.');
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 30000
});

module.exports = pool;

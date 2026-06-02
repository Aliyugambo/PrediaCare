const mysql = require('mysql');
const mysql2 = require('mysql2');

// Patch mysql to intercept authentication and delegate to mysql2 for caching_sha2_password
const originalConnection = mysql.createConnection;
const originalPool = mysql.createPool;

mysql.createConnection = function(config) {
  const connection = originalConnection.call(this, config);
  
  connection.on('handshake', (packet) => {
    if (packet.authenticationPlugin === 'caching_sha2_password') {
      // Close the old connection and create a new one with mysql2
      connection.destroy();
      const conn2 = mysql2.createConnection(config);
      conn2.connect();
    }
  });
  
  return connection;
};

mysql.createPool = function(config) {
  const pool = originalPool.call(this, config);
  return pool;
};

module.exports = mysql;

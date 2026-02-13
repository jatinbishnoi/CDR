const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

const promisePool = pool.promise();

// Create database tables
const createTables = async () => {
    try {
        // Drop tables if they exist (only in development)
        if (process.env.NODE_ENV === 'development') {
            await promisePool.query('SET FOREIGN_KEY_CHECKS = 0');
            await promisePool.query('DROP TABLE IF EXISTS cdr_records');
            await promisePool.query('DROP TABLE IF EXISTS contacts');
            await promisePool.query('DROP TABLE IF EXISTS call_relationships');
            await promisePool.query('SET FOREIGN_KEY_CHECKS = 1');
        }

        // Create CDR table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS cdr_records (
                id INT AUTO_INCREMENT PRIMARY KEY,
                caller_number VARCHAR(50) NOT NULL,
                receiver_number VARCHAR(50) NOT NULL,
                call_duration INT DEFAULT 0,
                call_date DATE,
                call_time TIME,
                call_type ENUM('incoming', 'outgoing', 'missed') DEFAULT 'outgoing',
                location_lat DECIMAL(10, 8),
                location_lng DECIMAL(11, 8),
                location_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_caller (caller_number),
                INDEX idx_receiver (receiver_number),
                INDEX idx_date (call_date),
                INDEX idx_type (call_type),
                INDEX idx_caller_date (caller_number, call_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create contacts table for analysis
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS contacts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone_number VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100),
                total_calls INT DEFAULT 0,
                total_duration INT DEFAULT 0,
                incoming_calls INT DEFAULT 0,
                outgoing_calls INT DEFAULT 0,
                missed_calls INT DEFAULT 0,
                avg_call_duration DECIMAL(10,2) DEFAULT 0,
                last_call_date DATE,
                location_lat DECIMAL(10, 8),
                location_lng DECIMAL(11, 8),
                location_name VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_total_calls (total_calls DESC),
                INDEX idx_last_call (last_call_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create call relationships table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS call_relationships (
                id INT AUTO_INCREMENT PRIMARY KEY,
                caller_number VARCHAR(50),
                receiver_number VARCHAR(50),
                call_count INT DEFAULT 1,
                total_duration INT DEFAULT 0,
                first_call_date DATE,
                last_call_date DATE,
                UNIQUE KEY unique_relationship (caller_number, receiver_number),
                INDEX idx_call_count (call_count DESC),
                INDEX idx_last_call_date (last_call_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        console.log('Database tables created/verified successfully');
    } catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    }
};

module.exports = { promisePool, createTables };
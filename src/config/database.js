const mysql = require('mysql2');


// Create a connection for administrative tasks (without database selected)
const adminPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
});

const promiseAdminPool = adminPool.promise();

// Function to ensure database exists
async function ensureDatabase(dbName) {
    try {
        await promiseAdminPool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        console.log(`Database ${dbName} ensured`);
    } catch (error) {
        console.error(`Error creating database ${dbName}:`, error);
        throw error;
    }
}

// Create connection pools for different databases
let cdrPool, sdrPool;
let promiseCdrPool, promiseSdrPool;

// Initialize pools after databases are created
async function initializePools() {
    // Ensure databases exist
    const cdrDbName = process.env.CDR_DB_NAME || 'cdr_analysis';
    const sdrDbName = process.env.SDR_DB_NAME || 'sdr_database';

    await ensureDatabase(cdrDbName);
    await ensureDatabase(sdrDbName);

    // Create CDR pool
    cdrPool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: cdrDbName,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
    });

    // Create SDR pool
    sdrPool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: sdrDbName,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
    });

    promiseCdrPool = cdrPool.promise();
    promiseSdrPool = sdrPool.promise();

    console.log('Database pools initialized successfully');

    return { promiseCdrPool, promiseSdrPool };
}

// Get pools function - this is what we need to export
async function getPools() {
    if (!promiseCdrPool || !promiseSdrPool) {
        await initializePools();
    }
    return { promiseCdrPool, promiseSdrPool };
}

// Create CDR database tables
const createCdrTables = async () => {
    try {
        // Drop tables if they exist (only in development)
        if (process.env.NODE_ENV === 'development') {
            await promiseCdrPool.query('SET FOREIGN_KEY_CHECKS = 0');
            await promiseCdrPool.query('DROP TABLE IF EXISTS cdr_records');
            await promiseCdrPool.query('DROP TABLE IF EXISTS contacts');
            await promiseCdrPool.query('DROP TABLE IF EXISTS call_relationships');
            await promiseCdrPool.query('SET FOREIGN_KEY_CHECKS = 1');
        }

        // Create CDR table
        await promiseCdrPool.query(`
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
        await promiseCdrPool.query(`
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
        await promiseCdrPool.query(`
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

        console.log('CDR database tables created/verified successfully');
    } catch (error) {
        console.error('Error creating CDR tables:', error);
        throw error;
    }
};

// Create SDR database tables
const createSdrTables = async () => {
    try {
        // Drop tables if they exist (only in development)
        if (process.env.NODE_ENV === 'development') {
            await promiseSdrPool.query('SET FOREIGN_KEY_CHECKS = 0');
            await promiseSdrPool.query('DROP TABLE IF EXISTS sdr_records');
            await promiseSdrPool.query('DROP TABLE IF EXISTS lbs_tracking');
            await promiseSdrPool.query('DROP TABLE IF EXISTS sdr_imports');
            await promiseSdrPool.query('SET FOREIGN_KEY_CHECKS = 1');
        }

        // Create SDR (Subscriber Details Registry) table
        await promiseSdrPool.query(`
            CREATE TABLE IF NOT EXISTS sdr_records (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mobile_number VARCHAR(20) UNIQUE NOT NULL,
                imsi VARCHAR(30),
                imei VARCHAR(30),
                
                -- Personal Information
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                father_name VARCHAR(200),
                spouse_name VARCHAR(200),
                gender CHAR(1),
                date_of_birth DATE,
                nationality VARCHAR(50),
                
                -- Contact Information
                alternate_contact VARCHAR(20),
                subscriber_contact VARCHAR(20),
                email VARCHAR(100),
                
                -- Address Information
                address TEXT,
                permanent_address TEXT,
                local_address TEXT,
                office_address TEXT,
                city VARCHAR(100),
                district VARCHAR(100),
                state VARCHAR(100),
                pin_code VARCHAR(20),
                
                -- Identification
                id_type VARCHAR(50),
                id_number VARCHAR(255),
                
                -- Subscription Details
                subscription_type ENUM('PREPAID', 'POSTPAID') DEFAULT 'PREPAID',
                activation_date DATETIME,
                deactivation_date DATETIME,
                deactivation_reason TEXT,
                subscriber_status VARCHAR(50) DEFAULT 'Active',
                circle_code VARCHAR(50),
                dealer_code VARCHAR(100),
                dealer_name VARCHAR(200),
                
                -- SIM Details
                sim_type VARCHAR(50) DEFAULT 'Physical',
                m2m_flag VARCHAR(10),
                
                -- Location Tracking
                current_lat DECIMAL(10, 8),
                current_lng DECIMAL(11, 8),
                last_location_update DATETIME,
                last_cgi VARCHAR(100),
                last_vlr VARCHAR(100),
                
                -- Metadata
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                data_source VARCHAR(100),
                
                INDEX idx_mobile (mobile_number),
                INDEX idx_imsi (imsi),
                INDEX idx_imei (imei),
                INDEX idx_name (first_name, last_name),
                INDEX idx_status (subscriber_status),
                FULLTEXT idx_address_search (address, permanent_address, city, state)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create LBS (Location Based Services) tracking table
        await promiseSdrPool.query(`
            CREATE TABLE IF NOT EXISTS lbs_tracking (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mobile_number VARCHAR(20),
                imsi VARCHAR(30),
                imei VARCHAR(30),
                
                -- Location Data
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                location_accuracy VARCHAR(20),
                location_type VARCHAR(10),
                
                -- Network Data
                cgi VARCHAR(100),
                vlr VARCHAR(100),
                lac VARCHAR(50),
                cell_id VARCHAR(50),
                
                -- Timestamp
                location_time DATETIME,
                received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                -- Source Message
                raw_message TEXT,
                request_id VARCHAR(100),
                
                -- Relationship
                sdr_id INT,
                
                FOREIGN KEY (sdr_id) REFERENCES sdr_records(id),
                INDEX idx_mobile_time (mobile_number, location_time),
                INDEX idx_location (latitude, longitude),
                INDEX idx_request (request_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create SDR Import History
        await promiseSdrPool.query(`
            CREATE TABLE IF NOT EXISTS sdr_imports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                filename VARCHAR(255),
                record_count INT,
                success_count INT,
                error_count INT,
                import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50),
                error_log TEXT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create users table for authentication
        await promiseSdrPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                full_name VARCHAR(100),
                role ENUM('admin', 'data_entry', 'viewer') DEFAULT 'viewer',
                is_active BOOLEAN DEFAULT true,
                last_login TIMESTAMP NULL,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id),
                INDEX idx_role (role),
                INDEX idx_username (username)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create sessions table for token management
        await promiseSdrPool.query(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token VARCHAR(500) NOT NULL,
                device_info TEXT,
                ip_address VARCHAR(45),
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                INDEX idx_token (token),
                INDEX idx_expires (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create permissions table
        await promiseSdrPool.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role ENUM('admin', 'data_entry', 'viewer') NOT NULL,
                permission VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_role_permission (role, permission)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Insert default permissions
        await promiseSdrPool.query(`
            INSERT IGNORE INTO role_permissions (role, permission) VALUES
            ('admin', 'all_access'),
            ('admin', 'user_manage'),
            ('admin', 'data_import'),
            ('admin', 'data_view'),
            ('admin', 'data_export'),
            ('data_entry', 'data_import'),
            ('data_entry', 'data_view'),
            ('viewer', 'data_view')
        `);

        console.log('SDR database tables created/verified successfully');
    } catch (error) {
        console.error('Error creating SDR tables:', error);
        throw error;
    }
};

// Create all tables
const createTables = async () => {
    try {
        // First initialize pools and ensure databases exist
        await initializePools();

        // Then create tables
        await createCdrTables();
        await createSdrTables();
        console.log('All database tables created successfully');

        return { promiseCdrPool, promiseSdrPool };
    } catch (error) {
        console.error('Error creating tables:', error);
        throw error;
    }
};

// Export all the functions and pools
module.exports = {
    getPools,
    createTables,
    initializePools,
    promiseCdrPool: () => promiseCdrPool,
    promiseSdrPool: () => promiseSdrPool
};
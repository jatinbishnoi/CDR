const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const connection = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
});

async function seedAllUsers() {
    try {
        console.log('🚀 Starting complete user seeding...');
        
        connection.connect();
        
        // Use sdr_database
        const dbName = process.env.SDR_DB_NAME || 'sdr_database';
        connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
        connection.query(`USE ${dbName}`);
        
        console.log(`✅ Using database: ${dbName}`);
        
        // Create tables
        const createTables = `
            -- Users table
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
                INDEX idx_role (role),
                INDEX idx_username (username)
            );
            
            -- User sessions table
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
            );
            
            -- Role permissions table
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role ENUM('admin', 'data_entry', 'viewer') NOT NULL,
                permission VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_role_permission (role, permission)
            );
        `;
        
        connection.query(createTables);
        console.log('✅ All tables created/verified');
        
        // Insert permissions
        const permissions = [
            ['admin', 'all_access'],
            ['admin', 'user_manage'],
            ['admin', 'data_import'],
            ['admin', 'data_view'],
            ['admin', 'data_export'],
            ['data_entry', 'data_import'],
            ['data_entry', 'data_view'],
            ['viewer', 'data_view']
        ];
        
        for (const [role, permission] of permissions) {
            connection.query(
                'INSERT IGNORE INTO role_permissions (role, permission) VALUES (?, ?)',
                [role, permission]
            );
        }
        console.log('✅ Permissions inserted');
        
        // Hash passwords
        const adminHash = await bcrypt.hash('Admin@123', 10);
        const dataEntryHash = await bcrypt.hash('DataEntry@123', 10);
        const viewerHash = await bcrypt.hash('Viewer@123', 10);
        
        // Insert users
        const users = [
            ['admin', 'admin@system.com', adminHash, 'System Administrator', 'admin'],
            ['dataentry1', 'dataentry1@system.com', dataEntryHash, 'Data Entry User 1', 'data_entry'],
            ['dataentry2', 'dataentry2@system.com', dataEntryHash, 'Data Entry User 2', 'data_entry'],
            ['viewer1', 'viewer1@system.com', viewerHash, 'Viewer User 1', 'viewer'],
            ['viewer2', 'viewer2@system.com', viewerHash, 'Viewer User 2', 'viewer']
        ];
        
        for (const [username, email, password, fullName, role] of users) {
            connection.query(
                `INSERT INTO users (username, email, password, full_name, role, is_active) 
                 VALUES (?, ?, ?, ?, ?, true)
                 ON DUPLICATE KEY UPDATE 
                 password = VALUES(password),
                 full_name = VALUES(full_name),
                 role = VALUES(role),
                 updated_at = NOW()`,
                [username, email, password, fullName, role],
                (err) => {
                    if (err) console.error(`Error inserting ${username}:`, err.message);
                }
            );
        }
        
        console.log('\n✅ All users created/updated successfully!');
        console.log('\n📋 User Credentials:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🛡️  ADMIN USER:');
        console.log('   Username: admin');
        console.log('   Password: Admin@123');
        console.log('   Email: admin@system.com');
        console.log('   Role: admin');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 DATA ENTRY USERS:');
        console.log('   Username: dataentry1');
        console.log('   Password: DataEntry@123');
        console.log('   Username: dataentry2');
        console.log('   Password: DataEntry@123');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('👁️  VIEWER USERS:');
        console.log('   Username: viewer1');
        console.log('   Password: Viewer@123');
        console.log('   Username: viewer2');
        console.log('   Password: Viewer@123');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        connection.end();
        
    } catch (error) {
        console.error('❌ Error seeding users:', error);
        connection.end();
        process.exit(1);
    }
}

seedAllUsers();
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Create connection to MySQL
const connection = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
});

// Hash password for admin
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

async function seedAdmin() {
    try {
        console.log('Starting admin seed process...');
        
        // Connect to MySQL
        connection.connect();
        
        // Use or create sdr_database
        connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.SDR_DB_NAME || 'sdr_database'}`);
        console.log(`✅ Database ${process.env.SDR_DB_NAME || 'sdr_database'} ensured`);
        
        // Switch to sdr_database
        connection.query(`USE ${process.env.SDR_DB_NAME || 'sdr_database'}`);
        
        // Create users table if it doesn't exist
        const createTableQuery = `
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        
        connection.query(createTableQuery);
        console.log('✅ Users table created/verified');
        
        // Create role_permissions table
        const createPermissionsTable = `
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role ENUM('admin', 'data_entry', 'viewer') NOT NULL,
                permission VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_role_permission (role, permission)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        
        connection.query(createPermissionsTable);
        console.log('✅ Role permissions table created/verified');
        
        // Insert default permissions
        const insertPermissions = `
            INSERT IGNORE INTO role_permissions (role, permission) VALUES
            ('admin', 'all_access'),
            ('admin', 'user_manage'),
            ('admin', 'data_import'),
            ('admin', 'data_view'),
            ('admin', 'data_export'),
            ('data_entry', 'data_import'),
            ('data_entry', 'data_view'),
            ('viewer', 'data_view');
        `;
        
        connection.query(insertPermissions);
        console.log('✅ Default permissions inserted');
        
        // Generate hash for Admin@123
        const hashedPassword = await bcrypt.hash('Admin@123', 10);
        console.log('✅ Password hash generated');
        
        // Check if admin already exists
        connection.query(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            ['admin', 'admin@system.com'],
            (err, results) => {
                if (err) throw err;
                
                if (results.length > 0) {
                    console.log('⚠️ Admin user already exists, updating password...');
                    
                    // Update existing admin
                    connection.query(
                        'UPDATE users SET password = ?, updated_at = NOW() WHERE username = ? OR email = ?',
                        [hashedPassword, 'admin', 'admin@system.com'],
                        (updateErr) => {
                            if (updateErr) throw updateErr;
                            console.log('✅ Admin password updated successfully');
                            console.log('\n📋 Admin Credentials:');
                            console.log('   Username: admin');
                            console.log('   Password: Admin@123');
                            console.log('   Email: admin@system.com');
                            console.log('   Role: admin');
                            connection.end();
                        }
                    );
                } else {
                    // Insert new admin
                    connection.query(
                        `INSERT INTO users 
                        (username, email, password, full_name, role, is_active) 
                        VALUES (?, ?, ?, ?, ?, ?)`,
                        ['admin', 'admin@system.com', hashedPassword, 'System Administrator', 'admin', true],
                        (insertErr) => {
                            if (insertErr) throw insertErr;
                            console.log('✅ Admin user created successfully');
                            console.log('\n📋 Admin Credentials:');
                            console.log('   Username: admin');
                            console.log('   Password: Admin@123');
                            console.log('   Email: admin@system.com');
                            console.log('   Role: admin');
                            connection.end();
                        }
                    );
                }
            }
        );
        
    } catch (error) {
        console.error('❌ Error seeding admin:', error);
        connection.end();
        process.exit(1);
    }
}

// Run the seed function
seedAdmin();
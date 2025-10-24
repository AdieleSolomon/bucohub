import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import { Parser } from '@json2csv/plainjs';
import PDFDocument from 'pdfkit';

const app = express();
const PORT = process.env.PORT || 3000;

// =============================
// ENVIRONMENT VARIABLE VALIDATION
// =============================

console.log('Environment Variables Check:');
console.log('PORT:', process.env.PORT);
console.log('MYSQLHOST:', process.env.MYSQLHOST);
console.log('MYSQLUSER:', process.env.MYSQLUSER);
console.log('MYSQLDATABASE:', process.env.MYSQLDATABASE);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);

// =============================
// DATABASE CONNECTION WITH RAILWAY SUPPORT
// =============================

const dbConfig = {
    host: process.env.MYSQLHOST || process.env.RAILWAY_MYSQLHOST || process.env.DB_HOST || "localhost",
    user: process.env.MYSQLUSER || process.env.RAILWAY_MYSQLUSER || process.env.DB_USER || "root",   
    password: process.env.MYSQLPASSWORD || process.env.RAILWAY_MYSQLPASSWORD || process.env.DB_PASSWORD || "",  
    database: process.env.MYSQLDATABASE || process.env.RAILWAY_MYSQLDATABASE || process.env.DB_NAME || "bucohub",
    port: process.env.MYSQLPORT || process.env.RAILWAY_MYSQLPORT || process.env.DB_PORT || 3306,
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    reconnect: true
};

console.log('Database Configuration:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    port: dbConfig.port,
    usingRailway: !!(process.env.MYSQLHOST || process.env.RAILWAY_MYSQLHOST)
});

// Use connection pool instead of single connection
const db = mysql.createPool(dbConfig);

// =============================
// DATABASE INITIALIZATION FUNCTIONS (FIXED)
// =============================

const initializeRailwayDatabase = () => {
    console.log('🚄 Starting Railway database initialization...');
    
    // For Railway, ensure database exists first
    const tempDb = mysql.createConnection({
        host: dbConfig.host,
        user: dbConfig.user,
        password: dbConfig.password,
        port: dbConfig.port
    });
    
    tempDb.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``, (err) => {
        if (err) {
            console.log('⚠️ Database creation might have failed:', err.message);
        } else {
            console.log(`✅ Database ${dbConfig.database} ensured`);
        }
        tempDb.end();
        
        // Now proceed with table creation
        initializeDatabaseTables();
    });
};

const initializeDatabase = () => {
    console.log('💻 Starting local database initialization...');
    
    const setupSQL = `
        CREATE DATABASE IF NOT EXISTS \`bucohub\`;
        USE \`bucohub\`;

        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('super_admin', 'admin', 'moderator') DEFAULT 'admin',
            is_active BOOLEAN DEFAULT TRUE,
            last_login TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS registrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            firstName VARCHAR(100) NOT NULL,
            lastName VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(20),
            password VARCHAR(255) NOT NULL,
            age INT,
            education VARCHAR(255),
            experience TEXT,
            courses JSON,
            motivation TEXT,
            profilePictureUrl VARCHAR(500),
            is_active BOOLEAN DEFAULT TRUE,
            email_verified BOOLEAN DEFAULT FALSE,
            last_login TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_name (firstName, lastName),
            INDEX idx_created_at (created_at)
        );

        CREATE TABLE IF NOT EXISTS password_resets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            token VARCHAR(255) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email_token (email, token),
            INDEX idx_expires (expires_at)
        );

        CREATE TABLE IF NOT EXISTS courses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            duration_weeks INT,
            price DECIMAL(10,2),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS student_courses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            course_id INT NOT NULL,
            enrollment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            progress_percentage INT DEFAULT 0,
            status ENUM('enrolled', 'in_progress', 'completed', 'dropped') DEFAULT 'enrolled',
            completed_at TIMESTAMP NULL,
            FOREIGN KEY (student_id) REFERENCES registrations(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE KEY unique_student_course (student_id, course_id),
            INDEX idx_student_status (student_id, status),
            INDEX idx_course_status (course_id, status)
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            admin_id INT,
            action VARCHAR(100) NOT NULL,
            table_name VARCHAR(100),
            record_id INT,
            old_values JSON,
            new_values JSON,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_admin_date (admin_id, created_at),
            INDEX idx_action (action)
        );

        -- Insert default admin user
        INSERT IGNORE INTO admins (first_name, last_name, email, password, role) VALUES 
        ('System', 'Administrator', 'admin@bucohub.com', '$2a$10$8K1p/a0dRL1B0VZQY2Qz3uYQYQYQYQYQYQYQYQYQYQYQYQYQYQYQ', 'super_admin');

        -- Insert sample courses
        INSERT IGNORE INTO courses (name, description, duration_weeks, price) VALUES 
        ('UI/UX Design', 'Learn user interface and user experience design principles', 12, 299.99),
        ('Front-end Development', 'Master HTML, CSS, JavaScript and modern frameworks', 16, 399.99),
        ('Back-end Development', 'Learn server-side programming with Node.js and databases', 20, 449.99),
        ('Full Stack Development', 'Complete web development from front-end to back-end', 24, 599.99),
        ('Data Science', 'Data analysis, machine learning and visualization', 20, 499.99),
        ('Digital Marketing', 'SEO, social media marketing, and analytics', 12, 349.99),
        ('Mobile App Development', 'Build iOS and Android applications', 18, 449.99),
        ('Artificial Intelligence', 'Machine learning and AI fundamentals', 22, 549.99),
        ('Cybersecurity', 'Network security and ethical hacking', 16, 499.99);
    `;

    db.query(setupSQL, (err, results) => {
        if (err) {
            console.error('❌ Database initialization failed:', err.message);
        } else {
            console.log('✅ Database initialized successfully');
            createAdditionalIndexes();
        }
    });
};

const initializeDatabaseTables = () => {
    console.log('📊 Creating database tables...');
    
    const setupSQL = `
        USE \`${dbConfig.database}\`;

        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('super_admin', 'admin', 'moderator') DEFAULT 'admin',
            is_active BOOLEAN DEFAULT TRUE,
            last_login TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS registrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            firstName VARCHAR(100) NOT NULL,
            lastName VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(20),
            password VARCHAR(255) NOT NULL,
            age INT,
            education VARCHAR(255),
            experience TEXT,
            courses JSON,
            motivation TEXT,
            profilePictureUrl VARCHAR(500),
            is_active BOOLEAN DEFAULT TRUE,
            email_verified BOOLEAN DEFAULT FALSE,
            last_login TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_name (firstName, lastName),
            INDEX idx_created_at (created_at)
        );

        CREATE TABLE IF NOT EXISTS password_resets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            token VARCHAR(255) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email_token (email, token),
            INDEX idx_expires (expires_at)
        );

        CREATE TABLE IF NOT EXISTS courses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            duration_weeks INT,
            price DECIMAL(10,2),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS student_courses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            course_id INT NOT NULL,
            enrollment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            progress_percentage INT DEFAULT 0,
            status ENUM('enrolled', 'in_progress', 'completed', 'dropped') DEFAULT 'enrolled',
            completed_at TIMESTAMP NULL,
            FOREIGN KEY (student_id) REFERENCES registrations(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE KEY unique_student_course (student_id, course_id),
            INDEX idx_student_status (student_id, status),
            INDEX idx_course_status (course_id, status)
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            admin_id INT,
            action VARCHAR(100) NOT NULL,
            table_name VARCHAR(100),
            record_id INT,
            old_values JSON,
            new_values JSON,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_admin_date (admin_id, created_at),
            INDEX idx_action (action)
        );

        -- Insert default data
        INSERT IGNORE INTO admins (first_name, last_name, email, password, role) VALUES 
        ('System', 'Administrator', 'admin@bucohub.com', '$2a$10$8K1p/a0dRL1B0VZQY2Qz3uYQYQYQYQYQYQYQYQYQYQYQYQYQYQYQ', 'super_admin');

        INSERT IGNORE INTO courses (name, description, duration_weeks, price) VALUES 
        ('UI/UX Design', 'Learn user interface and user experience design principles', 12, 299.99),
        ('Front-end Development', 'Master HTML, CSS, JavaScript and modern frameworks', 16, 399.99),
        ('Back-end Development', 'Learn server-side programming with Node.js and databases', 20, 449.99),
        ('Full Stack Development', 'Complete web development from front-end to back-end', 24, 599.99),
        ('Data Science', 'Data analysis, machine learning and visualization', 20, 499.99),
        ('Digital Marketing', 'SEO, social media marketing, and analytics', 12, 349.99),
        ('Mobile App Development', 'Build iOS and Android applications', 18, 449.99),
        ('Artificial Intelligence', 'Machine learning and AI fundamentals', 22, 549.99),
        ('Cybersecurity', 'Network security and ethical hacking', 16, 499.99);
    `;

    db.query(setupSQL, (err, results) => {
        if (err) {
            console.error('❌ Database table creation failed:', err.message);
        } else {
            console.log('✅ Database tables created successfully');
            createAdditionalIndexesForRailway();
        }
    });
};

// FIXED: Create indexes with proper MySQL syntax
const createAdditionalIndexes = () => {
    const indexes = [
        `USE \`bucohub\`; CREATE INDEX idx_registrations_phone ON registrations(phone)`,
        `USE \`bucohub\`; CREATE INDEX idx_registrations_active ON registrations(is_active)`,
        `USE \`bucohub\`; CREATE INDEX idx_admins_active ON admins(is_active)`,
        `USE \`bucohub\`; CREATE INDEX idx_student_courses_progress ON student_courses(progress_percentage)`,
        `USE \`bucohub\`; CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC)`
    ];

    let completed = 0;
    const totalIndexes = indexes.length;

    indexes.forEach((sql) => {
        db.query(sql, (err) => {
            completed++;
            
            if (err) {
                // MySQL error 1061 = duplicate key name (index already exists)
                if (err.errno === 1061) {
                    console.log('✅ Index already exists (this is normal)');
                } else {
                    console.log('⚠️ Index creation error:', err.message);
                }
            } else {
                console.log('✅ Index created successfully');
            }

            if (completed === totalIndexes) {
                console.log('✅ All index operations completed');
                createDatabaseViewsAndProcedures();
            }
        });
    });
};

// FIXED: Railway version with proper MySQL syntax
const createAdditionalIndexesForRailway = () => {
    const indexes = [
        `USE \`${dbConfig.database}\`; CREATE INDEX idx_registrations_phone ON registrations(phone)`,
        `USE \`${dbConfig.database}\`; CREATE INDEX idx_registrations_active ON registrations(is_active)`,
        `USE \`${dbConfig.database}\`; CREATE INDEX idx_admins_active ON admins(is_active)`,
        `USE \`${dbConfig.database}\`; CREATE INDEX idx_student_courses_progress ON student_courses(progress_percentage)`,
        `USE \`${dbConfig.database}\`; CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC)`
    ];

    let completed = 0;
    const totalIndexes = indexes.length;

    indexes.forEach((sql) => {
        db.query(sql, (err) => {
            completed++;
            
            if (err) {
                if (err.errno === 1061) {
                    console.log('✅ Index already exists (this is normal)');
                } else {
                    console.log('⚠️ Index creation error:', err.message);
                }
            } else {
                console.log('✅ Index created successfully');
            }

            if (completed === totalIndexes) {
                console.log('✅ All index operations completed');
                createDatabaseViewsAndProcedures();
            }
        });
    });
};

const createDatabaseViewsAndProcedures = () => {
    const viewsAndProceduresSQL = `
        USE \`${dbConfig.database}\`;

        CREATE OR REPLACE VIEW student_summary AS
        SELECT 
            r.id,
            CONCAT(r.firstName, ' ', r.lastName) AS full_name,
            r.email,
            r.phone,
            r.age,
            r.education,
            COUNT(sc.id) AS enrolled_courses,
            AVG(sc.progress_percentage) AS avg_progress,
            r.created_at
        FROM registrations r
        LEFT JOIN student_courses sc ON r.id = sc.student_id AND sc.status != 'dropped'
        WHERE r.is_active = TRUE
        GROUP BY r.id;

        CREATE OR REPLACE VIEW course_enrollment_stats AS
        SELECT 
            c.id,
            c.name,
            c.duration_weeks,
            COUNT(sc.id) AS total_enrollments,
            AVG(sc.progress_percentage) AS avg_progress,
            SUM(CASE WHEN sc.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
        FROM courses c
        LEFT JOIN student_courses sc ON c.id = sc.course_id
        WHERE c.is_active = TRUE
        GROUP BY c.id;
    `;

    db.query(viewsAndProceduresSQL, (err) => {
        if (err) {
            console.error('❌ Views and procedures creation failed:', err.message);
        } else {
            console.log('✅ Database views and procedures created successfully');
        }
    });
};

// =============================
// DATABASE CONNECTION HANDLER
// =============================

db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        if (process.env.NODE_ENV === 'production') {
            console.log('🔄 Continuing without database connection...');
        } else {
            process.exit(1);
        }
    } else {
        console.log('✅ Connected to MySQL database:', dbConfig.database);
        connection.release();
        
        // Initialize database based on environment
        if (process.env.MYSQLHOST || process.env.RAILWAY_ENVIRONMENT) {
            console.log('🚄 Railway environment detected - using Railway DB initialization');
            initializeRailwayDatabase();
        } else {
            console.log('💻 Local environment - using standard initialization');
            initializeDatabase();
        }
    }
});

// =============================
// MIDDLEWARE AND FILE UPLOAD CONFIG
// =============================

const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Uploads directory created:', uploadsDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const fileExt = path.extname(file.originalname).toLowerCase();
        const fileName = path.basename(file.originalname, fileExt);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeFileName = fileName.replace(/[^a-zA-Z0-9]/g, '-');
        
        cb(null, `profile-${safeFileName}-${uniqueSuffix}${fileExt}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type. Only ${allowedMimes.join(', ')} are allowed.`), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    },
    fileFilter: fileFilter
});

// MIDDLEWARE SETUP
app.use(cors()); 
app.use(express.json()); 
app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1d',
    etag: true
}));

// Serve static files
app.use(express.static('.'));

// Serve HTML files
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'admin.html'));
});

app.get('/student-profile.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'student-profile.html'));
});

app.get('/courses.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'courses.html'));
});

app.get('/about.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'about.html'));
});

app.get('/contact.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'contact.html'));
});

// =============================
// UTILITY FUNCTIONS
// =============================

const authenticateAdmin = (req, res, next) => {
    // Implement proper authentication logic
    next();
};

const authorizeRole = (allowedRoles) => {
    return (req, res, next) => {
        // Implement proper authorization logic
        next();
    };
};

const FileUtils = {
    validateFile: (file) => {
        if (!file) return { valid: false, error: 'No file provided' };
        
        const maxSize = 5 * 1024 * 1024;
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        
        if (file.size > maxSize) {
            return { valid: false, error: 'File size exceeds 5MB limit' };
        }
        
        if (!allowedTypes.includes(file.mimetype)) {
            return { valid: false, error: 'Invalid file type' };
        }
        
        return { valid: true };
    },
    
    generateFileUrl: (filename) => {
        if (!filename) return null;
        return `/uploads/${filename}`;
    },
    
    deleteFile: (filePath) => {
        return new Promise((resolve, reject) => {
            if (!filePath) {
                resolve(true);
                return;
            }
            
            const filename = filePath.replace('/uploads/', '');
            const fullPath = path.join(uploadsDir, filename);
            
            fs.unlink(fullPath, (err) => {
                if (err) {
                    console.error('Error deleting file:', err.message);
                    resolve(false);
                } else {
                    console.log('File deleted successfully:', filename);
                    resolve(true);
                }
            });
        });
    }
};

function parseCourses(coursesData) {
    if (!coursesData) return [];
    
    try {
        if (Array.isArray(coursesData)) {
            return coursesData;
        }
        
        if (typeof coursesData === 'string') {
            let cleanData = coursesData.trim();
            
            if (cleanData.startsWith('"') && cleanData.endsWith('"')) {
                cleanData = cleanData.slice(1, -1);
            }
            
            try {
                const parsed = JSON.parse(cleanData);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch (jsonError) {
                if (cleanData.includes(',')) {
                    return cleanData.split(',').map(item => item.trim()).filter(item => item);
                } else if (cleanData) {
                    return [cleanData];
                }
            }
        }
        
        return [];
    } catch (error) {
        console.error('Error parsing courses:', error);
        return [];
    }
}

// =============================
// API ROUTES
// =============================

app.get("/health", (req, res) => {
    db.getConnection((err, connection) => {
        const dbStatus = err ? 'disconnected' : 'connected';
        if (connection) connection.release();
        
        res.json({ 
            status: "OK", 
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            database: dbStatus,
            usingRailway: !!(process.env.MYSQLHOST || process.env.RAILWAY_ENVIRONMENT)
        });
    });
});

app.get("/", (req, res) => {
    res.json({ 
        message: "BUCOHub API is running",
        environment: process.env.NODE_ENV || 'development',
        port: PORT,
        database_schema: "enhanced",
        usingRailway: !!(process.env.MYSQLHOST || process.env.RAILWAY_ENVIRONMENT),
        endpoints: {
            health: "/health",
            studentRegistration: "/api/register",
            adminLogin: "/api/admins/login",
            studentLogin: "/api/students/login",
            courses: "/api/courses",
            fileUploads: "/uploads/"
        }
    });
});

// Get all courses
app.get("/api/courses", (req, res) => {
    const sql = "SELECT * FROM courses WHERE is_active = TRUE ORDER BY name";
    
    db.query(sql, (err, result) => {
        if (err) {
            console.error('Courses fetch error:', err);
            return res.status(500).json({ error: "Database error" });
        }
        
        res.json({
            courses: result,
            total: result.length
        });
    });
});

// Student registration
app.post("/api/register", upload.single('profilePicture'), (req, res) => {
    // Implement student registration logic
    res.status(501).json({ error: "Student registration not implemented yet" });
});

// Admin login
app.post("/api/admins/login", (req, res) => {
    // Implement admin login logic
    res.status(501).json({ error: "Admin login not implemented yet" });
});

// Student login  
app.post("/api/students/login", (req, res) => {
    // Implement student login logic
    res.status(501).json({ error: "Student login not implemented yet" });
});

// Get all students
app.get("/api/students", authenticateAdmin, (req, res) => {
    const sql = "SELECT id, firstName, lastName, email, phone, age, education, created_at FROM registrations WHERE is_active = TRUE";
    
    db.query(sql, (err, result) => {
        if (err) {
            console.error('Students fetch error:', err);
            return res.status(500).json({ error: "Database error" });
        }
        
        res.json({
            students: result,
            total: result.length
        });
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Too many files. Maximum is 1 file.' });
        }
    }
    
    if (error.message.includes('Invalid file type')) {
        return res.status(400).json({ error: error.message });
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Server shutting down...');
    db.end();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Server shutting down...');
    db.end();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🚄 Railway Environment: ${process.env.RAILWAY_ENVIRONMENT || 'No'}`);
    console.log(`📁 File uploads served from: /uploads/`);
    console.log(`💾 Upload directory: ${path.resolve(uploadsDir)}`);
    console.log(`✅ Health check available at: /health`);
});
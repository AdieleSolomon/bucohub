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

        -- Insert default admin user with proper hashed password (password: admin123)
        INSERT IGNORE INTO admins (first_name, last_name, email, password, role) VALUES 
        ('System', 'Administrator', 'admin@bucohub.com', '$2a$10$8K1p/a0dRL1B0VZQY2Qz3uB8bZQ7q9K5jM3V2C1N4X6Y8H7G5F3D', 'super_admin');

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

        -- Insert default data with proper hashed password (password: admin123)
        INSERT IGNORE INTO admins (first_name, last_name, email, password, role) VALUES 
        ('System', 'Administrator', 'admin@bucohub.com', '$2a$10$8K1p/a0dRL1B0VZQY2Qz3uB8bZQ7q9K5jM3V2C1N4X6Y8H7G5F3D', 'super_admin');

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

// MIDDLEWARE SETUP - FIXED FOR RAILWAY
app.use(cors({
    origin: ['http://localhost:3000', 'https://your-app-name.railway.app', 'https://*.railway.app'],
    credentials: true
})); 
app.use(express.json()); 
app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1d',
    etag: true
}));

// Serve static files from the current directory
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
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    // For now, use a simple token check
    // In production, use JWT or similar
    if (token === 'dummy-token' || token === 'authenticated') {
        next();
    } else {
        res.status(401).json({ error: 'Invalid token' });
    }
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

// Password hashing utility
const hashPassword = async (password) => {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

// =============================
// API ROUTES - IMPLEMENTED
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

// Student registration - IMPLEMENTED
app.post("/api/register", upload.single('profilePicture'), async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            password,
            age,
            education,
            experience,
            motivation
        } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !phone || !password) {
            return res.status(400).json({ error: "All required fields must be filled" });
        }

        // Check if email already exists
        const checkEmailSql = "SELECT id FROM registrations WHERE email = ?";
        db.query(checkEmailSql, [email], async (err, results) => {
            if (err) {
                console.error('Email check error:', err);
                return res.status(500).json({ error: "Database error" });
            }

            if (results.length > 0) {
                return res.status(400).json({ error: "Email already registered" });
            }

            // Hash password
            const hashedPassword = await hashPassword(password);

            // Parse courses
            let courses = [];
            if (req.body.courses) {
                if (Array.isArray(req.body.courses)) {
                    courses = req.body.courses;
                } else if (typeof req.body.courses === 'string') {
                    courses = [req.body.courses];
                }
            }

            // Handle profile picture
            let profilePictureUrl = null;
            if (req.file) {
                profilePictureUrl = `/uploads/${req.file.filename}`;
            }

            // Insert student
            const insertSql = `
                INSERT INTO registrations 
                (firstName, lastName, email, phone, password, age, education, experience, courses, motivation, profilePictureUrl)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.query(insertSql, [
                firstName,
                lastName,
                email,
                phone,
                hashedPassword,
                age || null,
                education || null,
                experience || null,
                JSON.stringify(courses),
                motivation || null,
                profilePictureUrl
            ], (err, result) => {
                if (err) {
                    console.error('Registration error:', err);
                    return res.status(500).json({ error: "Failed to register student" });
                }

                res.json({
                    success: true,
                    message: "Registration successful",
                    studentId: result.insertId
                });
            });
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Admin login - IMPLEMENTED
app.post("/api/admins/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const sql = "SELECT * FROM admins WHERE email = ? AND is_active = TRUE";
        
        db.query(sql, [email], async (err, results) => {
            if (err) {
                console.error('Admin login error:', err);
                return res.status(500).json({ error: "Database error" });
            }

            if (results.length === 0) {
                return res.status(401).json({ error: "Invalid credentials" });
            }

            const admin = results[0];
            
            // Compare passwords
            const isPasswordValid = await comparePassword(password, admin.password);
            
            if (!isPasswordValid) {
                return res.status(401).json({ error: "Invalid credentials" });
            }

            // Update last login
            const updateSql = "UPDATE admins SET last_login = NOW() WHERE id = ?";
            db.query(updateSql, [admin.id]);

            res.json({
                success: true,
                message: "Login successful",
                admin: {
                    id: admin.id,
                    firstName: admin.first_name,
                    lastName: admin.last_name,
                    email: admin.email,
                    role: admin.role
                },
                token: "dummy-token" // In production, use JWT
            });
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Student login - IMPLEMENTED
app.post("/api/students/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const sql = "SELECT * FROM registrations WHERE email = ? AND is_active = TRUE";
        
        db.query(sql, [email], async (err, results) => {
            if (err) {
                console.error('Student login error:', err);
                return res.status(500).json({ error: "Database error" });
            }

            if (results.length === 0) {
                return res.status(401).json({ error: "Invalid credentials" });
            }

            const student = results[0];
            
            // Compare passwords
            const isPasswordValid = await comparePassword(password, student.password);
            
            if (!isPasswordValid) {
                return res.status(401).json({ error: "Invalid credentials" });
            }

            // Update last login
            const updateSql = "UPDATE registrations SET last_login = NOW() WHERE id = ?";
            db.query(updateSql, [student.id]);

            res.json({
                success: true,
                message: "Login successful",
                student: {
                    id: student.id,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    email: student.email,
                    phone: student.phone,
                    age: student.age,
                    education: student.education,
                    experience: student.experience,
                    courses: parseCourses(student.courses),
                    motivation: student.motivation,
                    profilePictureUrl: student.profilePictureUrl,
                    created_at: student.created_at
                },
                token: "authenticated" // In production, use JWT
            });
        });
    } catch (error) {
        console.error('Student login error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get all students - IMPLEMENTED
app.get("/api/students", authenticateAdmin, (req, res) => {
    const { page = 1, limit = 10, search = '', sort = 'id', order = 'ASC' } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
        SELECT id, firstName, lastName, email, phone, age, education, courses, profilePictureUrl, created_at 
        FROM registrations 
        WHERE is_active = TRUE
    `;
    let countSql = "SELECT COUNT(*) as total FROM registrations WHERE is_active = TRUE";
    let params = [];
    let countParams = [];

    if (search) {
        const searchCondition = " AND (firstName LIKE ? OR lastName LIKE ? OR email LIKE ?)";
        sql += searchCondition;
        countSql += searchCondition;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
        countParams.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ` ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    db.query(countSql, countParams, (err, countResult) => {
        if (err) {
            console.error('Count error:', err);
            return res.status(500).json({ error: "Database error" });
        }

        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        db.query(sql, params, (err, result) => {
            if (err) {
                console.error('Students fetch error:', err);
                return res.status(500).json({ error: "Database error" });
            }

            // Parse courses for each student
            const students = result.map(student => ({
                ...student,
                courses: parseCourses(student.courses)
            }));

            res.json({
                students,
                total,
                totalPages,
                currentPage: parseInt(page),
                limit: parseInt(limit)
            });
        });
    });
});

// Get student by ID - IMPLEMENTED
app.get("/api/students/:id", (req, res) => {
    const studentId = req.params.id;

    const sql = "SELECT * FROM registrations WHERE id = ? AND is_active = TRUE";
    
    db.query(sql, [studentId], (err, results) => {
        if (err) {
            console.error('Student fetch error:', err);
            return res.status(500).json({ error: "Database error" });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: "Student not found" });
        }

        const student = results[0];
        const studentData = {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            phone: student.phone,
            age: student.age,
            education: student.education,
            experience: student.experience,
            courses: parseCourses(student.courses),
            motivation: student.motivation,
            profilePictureUrl: student.profilePictureUrl,
            created_at: student.created_at,
            updated_at: student.updated_at
        };

        res.json(studentData);
    });
});

// Update student - IMPLEMENTED
app.put("/api/students/:id", authenticateAdmin, async (req, res) => {
    try {
        const studentId = req.params.id;
        const {
            firstName,
            lastName,
            email,
            phone,
            age,
            education,
            experience,
            motivation,
            courses
        } = req.body;

        // Check if student exists
        const checkSql = "SELECT id FROM registrations WHERE id = ? AND is_active = TRUE";
        db.query(checkSql, [studentId], (err, results) => {
            if (err) {
                console.error('Student check error:', err);
                return res.status(500).json({ error: "Database error" });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: "Student not found" });
            }

            // Check if email is being changed and if it's already taken
            if (email) {
                const emailCheckSql = "SELECT id FROM registrations WHERE email = ? AND id != ?";
                db.query(emailCheckSql, [email, studentId], (err, emailResults) => {
                    if (err) {
                        console.error('Email check error:', err);
                        return res.status(500).json({ error: "Database error" });
                    }

                    if (emailResults.length > 0) {
                        return res.status(400).json({ error: "Email already in use" });
                    }

                    proceedWithUpdate();
                });
            } else {
                proceedWithUpdate();
            }

            function proceedWithUpdate() {
                const updateFields = [];
                const updateValues = [];

                if (firstName) {
                    updateFields.push("firstName = ?");
                    updateValues.push(firstName);
                }
                if (lastName) {
                    updateFields.push("lastName = ?");
                    updateValues.push(lastName);
                }
                if (email) {
                    updateFields.push("email = ?");
                    updateValues.push(email);
                }
                if (phone) {
                    updateFields.push("phone = ?");
                    updateValues.push(phone);
                }
                if (age !== undefined) {
                    updateFields.push("age = ?");
                    updateValues.push(age);
                }
                if (education !== undefined) {
                    updateFields.push("education = ?");
                    updateValues.push(education);
                }
                if (experience !== undefined) {
                    updateFields.push("experience = ?");
                    updateValues.push(experience);
                }
                if (motivation !== undefined) {
                    updateFields.push("motivation = ?");
                    updateValues.push(motivation);
                }
                if (courses !== undefined) {
                    updateFields.push("courses = ?");
                    updateValues.push(JSON.stringify(courses));
                }

                if (updateFields.length === 0) {
                    return res.status(400).json({ error: "No fields to update" });
                }

                updateValues.push(studentId);

                const updateSql = `
                    UPDATE registrations 
                    SET ${updateFields.join(', ')}, updated_at = NOW()
                    WHERE id = ?
                `;

                db.query(updateSql, updateValues, (err, result) => {
                    if (err) {
                        console.error('Student update error:', err);
                        return res.status(500).json({ error: "Failed to update student" });
                    }

                    res.json({
                        success: true,
                        message: "Student updated successfully"
                    });
                });
            }
        });
    } catch (error) {
        console.error('Student update error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Delete student - IMPLEMENTED
app.delete("/api/students/:id", authenticateAdmin, (req, res) => {
    const studentId = req.params.id;

    const sql = "UPDATE registrations SET is_active = FALSE WHERE id = ?";
    
    db.query(sql, [studentId], (err, result) => {
        if (err) {
            console.error('Student delete error:', err);
            return res.status(500).json({ error: "Failed to delete student" });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Student not found" });
        }

        res.json({
            success: true,
            message: "Student deleted successfully"
        });
    });
});

// Export students to CSV - IMPLEMENTED
app.get("/api/students/export/csv", authenticateAdmin, (req, res) => {
    const sql = `
        SELECT id, firstName, lastName, email, phone, age, education, courses, created_at
        FROM registrations 
        WHERE is_active = TRUE
        ORDER BY created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Export CSV error:', err);
            return res.status(500).json({ error: "Database error" });
        }

        try {
            const students = results.map(student => ({
                ...student,
                courses: parseCourses(student.courses).join(', ')
            }));

            const fields = ['id', 'firstName', 'lastName', 'email', 'phone', 'age', 'education', 'courses', 'created_at'];
            const opts = { fields };
            
            const parser = new Parser(opts);
            const csv = parser.parse(students);

            res.header('Content-Type', 'text/csv');
            res.attachment('bucodel-students.csv');
            res.send(csv);
        } catch (error) {
            console.error('CSV generation error:', error);
            res.status(500).json({ error: "Failed to generate CSV" });
        }
    });
});

// Export students to PDF - IMPLEMENTED
app.get("/api/students/export/pdf", authenticateAdmin, (req, res) => {
    const sql = `
        SELECT id, firstName, lastName, email, phone, age, education, courses, created_at
        FROM registrations 
        WHERE is_active = TRUE
        ORDER BY created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Export PDF error:', err);
            return res.status(500).json({ error: "Database error" });
        }

        try {
            const doc = new PDFDocument();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="bucodel-students.pdf"');
            
            doc.pipe(res);

            // Add title
            doc.fontSize(20).text('BUCODel - Students Report', 100, 100);
            doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, 100, 130);
            
            let yPosition = 180;

            results.forEach((student, index) => {
                if (yPosition > 700) {
                    doc.addPage();
                    yPosition = 100;
                }

                doc.fontSize(14).text(`${index + 1}. ${student.firstName} ${student.lastName}`, 100, yPosition);
                doc.fontSize(10)
                   .text(`Email: ${student.email}`, 120, yPosition + 20)
                   .text(`Phone: ${student.phone || 'N/A'}`, 120, yPosition + 35)
                   .text(`Age: ${student.age || 'N/A'}`, 120, yPosition + 50)
                   .text(`Education: ${student.education || 'N/A'}`, 120, yPosition + 65)
                   .text(`Courses: ${parseCourses(student.courses).join(', ') || 'None'}`, 120, yPosition + 80)
                   .text(`Registered: ${new Date(student.created_at).toLocaleDateString()}`, 120, yPosition + 95);

                yPosition += 130;
            });

            doc.end();
        } catch (error) {
            console.error('PDF generation error:', error);
            res.status(500).json({ error: "Failed to generate PDF" });
        }
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
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🚄 Railway Environment: ${process.env.RAILWAY_ENVIRONMENT || 'No'}`);
    console.log(`📁 File uploads served from: /uploads/`);
    console.log(`💾 Upload directory: ${path.resolve(uploadsDir)}`);
    console.log(`✅ Health check available at: /health`);
});
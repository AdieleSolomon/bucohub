require('dotenv').config();
import express, { json } from "express";
import cors from "cors";
import { createConnection } from "mysql2"; 
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import { Parser } from "@json2csv/plainjs";
import PDFDocument from "pdfkit";

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

// =============================
// DATABASE CONNECTION WITH FALLBACKS
// =============================

const dbConfig = {
    host: process.env.MYSQLHOST || process.env.DB_HOST || "localhost",
    user: process.env.MYSQLUSER || process.env.DB_USER || "root",   
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || "",  
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || "bucohub",
    port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
    multipleStatements: true // Allow multiple SQL statements
};

console.log('Database Configuration:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    port: dbConfig.port
});

const db = createConnection(dbConfig);

// =============================
// DATABASE INITIALIZATION
// =============================

const initializeDatabase = () => {
    const setupSQL = `
        -- Create database if not exists
        CREATE DATABASE IF NOT EXISTS \`bucohub\`;
        USE \`bucohub\`;

        -- Create admins table
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

        -- Create registrations table (students)
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

        -- Create password_resets table
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

        -- Create courses table (for better course management)
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

        -- Create student_courses junction table (for many-to-many relationship)
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

        -- Create audit_log table for tracking admin actions
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

        -- Insert default admin user (password: admin123)
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

        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_registrations_phone ON registrations(phone);
        CREATE INDEX IF NOT EXISTS idx_registrations_active ON registrations(is_active);
        CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(is_active);
        CREATE INDEX IF NOT EXISTS idx_student_courses_progress ON student_courses(progress_percentage);
        CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
    `;

    db.query(setupSQL, (err, results) => {
        if (err) {
            console.error('❌ Database initialization failed:', err.message);
        } else {
            console.log('✅ Database initialized successfully with enhanced schema');
            
            // Create views and stored procedures
            createDatabaseViewsAndProcedures();
        }
    });
};

const createDatabaseViewsAndProcedures = () => {
    const viewsAndProceduresSQL = `
        -- Create or replace view for student summary
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

        -- Create or replace view for course enrollment statistics
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

// Database connection with initialization
db.connect(err => {
    if (err) {
        console.error("❌ Database connection failed:", err.message);
        console.error("Connection details:", {
            host: dbConfig.host,
            user: dbConfig.user,
            database: dbConfig.database,
            port: dbConfig.port
        });
        
        // Don't exit in production, just log the error
        if (process.env.NODE_ENV === 'production') {
            console.log("🔄 Continuing without database connection...");
        } else {
            process.exit(1);
        }
    } else {
        console.log("✅ Connected to MySQL database:", dbConfig.database);
        
        // Initialize database with enhanced schema
        initializeDatabase();
        
        // Test database operations
        db.query('SELECT 1 + 1 AS solution', (error, results) => {
            if (error) {
                console.error("❌ Database test query failed:", error.message);
            } else {
                console.log("✅ Database test query successful:", results[0].solution);
            }
        });
    }
});

// =============================
// ENHANCED FILE UPLOAD CONFIGURATION
// =============================

// Define uploads directory
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Uploads directory created:', uploadsDir);
}

// Enhanced Multer configuration with better file handling
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Create a more organized filename structure
        const fileExt = path.extname(file.originalname).toLowerCase();
        const fileName = path.basename(file.originalname, fileExt);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeFileName = fileName.replace(/[^a-zA-Z0-9]/g, '-');
        
        cb(null, `profile-${safeFileName}-${uniqueSuffix}${fileExt}`);
    }
});

// Enhanced file filter with better error handling
const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type. Only ${allowedMimes.join(', ')} are allowed.`), false);
    }
};

// Create multiple upload configurations
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1 // Only one file
    },
    fileFilter: fileFilter
});

// For multiple file uploads (if needed in future)
const multiUpload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 5 // Maximum 5 files
    },
    fileFilter: fileFilter
});

// =============================
// MIDDLEWARE SETUP
// =============================

app.use(cors()); 
app.use(json()); 

// Serve uploaded files statically with cache control
app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1d', // Cache for 1 day
    etag: true
}));

// =============================
// UTILITY FUNCTIONS
// =============================

// Authentication middleware
const authenticateAdmin = (req, res, next) => {
    next();
};

const authorizeRole = (allowedRoles) => {
    return (req, res, next) => {
        next();
    };
};

// Enhanced file upload utility functions
const FileUtils = {
    // Validate file before processing
    validateFile: (file) => {
        if (!file) return { valid: false, error: 'No file provided' };
        
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        
        if (file.size > maxSize) {
            return { valid: false, error: 'File size exceeds 5MB limit' };
        }
        
        if (!allowedTypes.includes(file.mimetype)) {
            return { valid: false, error: 'Invalid file type' };
        }
        
        return { valid: true };
    },
    
    // Generate file URL
    generateFileUrl: (filename) => {
        if (!filename) return null;
        return `/uploads/${filename}`;
    },
    
    // Delete file from filesystem
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
                    resolve(false); // Don't reject, just log error
                } else {
                    console.log('File deleted successfully:', filename);
                    resolve(true);
                }
            });
        });
    },
    
    // Clean up orphaned files (optional maintenance function)
    cleanupOrphanedFiles: async () => {
        try {
            const files = fs.readdirSync(uploadsDir);
            const dbFiles = await new Promise((resolve, reject) => {
                db.query('SELECT profilePictureUrl FROM registrations WHERE profilePictureUrl IS NOT NULL', (err, results) => {
                    if (err) reject(err);
                    else resolve(results.map(row => row.profilePictureUrl.replace('/uploads/', '')));
                });
            });
            
            const orphanedFiles = files.filter(file => 
                file !== '.gitkeep' && !dbFiles.includes(file)
            );
            
            orphanedFiles.forEach(file => {
                fs.unlinkSync(path.join(uploadsDir, file));
                console.log('Cleaned up orphaned file:', file);
            });
            
            return orphanedFiles.length;
        } catch (error) {
            console.error('Error cleaning up orphaned files:', error);
            return 0;
        }
    }
};

// Helper function to parse courses data
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
// ENHANCED ROUTES WITH NEW SCHEMA
// =============================

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ 
        status: "OK", 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: db.state === 'authenticated' ? 'connected' : 'disconnected'
    });
});

// Default route
app.get("/", (req, res) => {
    res.json({ 
        message: "BUCODel API is running",
        environment: process.env.NODE_ENV || 'development',
        port: PORT,
        database_schema: "enhanced",
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

// NEW: Get all courses
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

// NEW: Get course enrollment stats
app.get("/api/courses/stats", authenticateAdmin, (req, res) => {
    const sql = "SELECT * FROM course_enrollment_stats";
    
    db.query(sql, (err, result) => {
        if (err) {
            console.error('Course stats error:', err);
            return res.status(500).json({ error: "Database error" });
        }
        
        res.json({
            courseStats: result
        });
    });
});

// NEW: Get student summary
app.get("/api/students/summary", authenticateAdmin, (req, res) => {
    const sql = "SELECT * FROM student_summary ORDER BY created_at DESC";
    
    db.query(sql, (err, result) => {
        if (err) {
            console.error('Student summary error:', err);
            return res.status(500).json({ error: "Database error" });
        }
        
        res.json({
            students: result,
            total: result.length
        });
    });
});

// File upload test endpoint
app.post("/api/upload-test", upload.single('testFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        
        const fileInfo = {
            originalName: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
            url: FileUtils.generateFileUrl(req.file.filename),
            path: req.file.path
        };
        
        console.log('File upload test successful:', fileInfo);
        
        res.json({
            success: true,
            message: "File uploaded successfully",
            file: fileInfo
        });
    } catch (error) {
        console.error('Upload test error:', error);
        res.status(500).json({ error: "File upload failed" });
    }
});

// ENHANCED STUDENT REGISTRATION WITH BETTER FILE HANDLING
app.post("/api/register", upload.single('profilePicture'), async (req, res) => {
    let { firstName, lastName, email, phone, password,
        age, education, experience, courses, motivation } = req.body;

    console.log('=== REGISTRATION REQUEST ===');
    console.log('File received:', req.file ? {
        originalname: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
    } : 'No file');
    
    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !password) {
        // Clean up uploaded file if validation fails
        if (req.file) {
            await FileUtils.deleteFile(req.file.path);
        }
        return res.status(400).json({ error: "Required fields missing" });
    }
    
    // Validate file if present
    if (req.file) {
        const fileValidation = FileUtils.validateFile(req.file);
        if (!fileValidation.valid) {
            await FileUtils.deleteFile(req.file.path);
            return res.status(400).json({ error: fileValidation.error });
        }
    }
    
    age = parseInt(age, 10) || null;
    
    // Handle courses - ensure it's always an array
    let coursesToStore = [];
    if (courses) {
        if (Array.isArray(courses)) {
            coursesToStore = courses;
        } else if (typeof courses === 'string') {
            coursesToStore = [courses];
        }
    }
    
    // Generate file URL using utility function
    const profilePictureUrl = req.file ? FileUtils.generateFileUrl(req.file.filename) : null;
    
    console.log('Profile picture URL to store:', profilePictureUrl);
    
    try {
        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        const sql = `
            INSERT INTO registrations 
            (firstName, lastName, email, phone, password,
            age, education, experience, courses, motivation, profilePictureUrl, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        db.query(
            sql,
            [firstName, lastName, email, phone, hashedPassword,
            age, education, experience, JSON.stringify(coursesToStore), motivation, profilePictureUrl],
            async (err, result) => {
                if (err) {
                    console.error("SQL Error:", err.sqlMessage);
                    
                    // Clean up uploaded file if database operation fails
                    if (req.file) {
                        await FileUtils.deleteFile(req.file.path);
                    }
                    
                    if (err.code === "ER_DUP_ENTRY") {
                        return res.status(409).json({ error: "Email already registered" });
                    }
                    return res.status(500).json({ error: err.sqlMessage });
                }

                console.log('Registration successful, ID:', result.insertId);
                console.log('Profile picture stored at:', profilePictureUrl);

                res.json({
                    message: "Registration successful",
                    studentId: result.insertId,
                    data: {
                        firstName,
                        lastName,
                        email,
                        phone,
                        courses: coursesToStore,
                        profilePictureUrl
                    }
                });
            }
        );
    } catch (error) {
        // Clean up uploaded file if any error occurs
        if (req.file) {
            await FileUtils.deleteFile(req.file.path);
        }
        
        console.error("Error processing registration:", error);
        return res.status(500).json({ error: "Error processing registration" });
    }
});

// STUDENT LOGIN ENDPOINT - UPDATED WITH LAST_LOGIN
app.post("/api/students/login", async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ 
            success: false,
            error: "Email and password are required" 
        });
    }

    const sql = "SELECT * FROM registrations WHERE email = ? AND is_active = TRUE";
    
    db.query(sql, [email], async (err, result) => {
        if (err) {
            return res.status(500).json({ 
                success: false,
                error: "Database error" 
            });
        } 
        
        if (result.length === 0) {
            return res.status(401).json({ 
                success: false,
                error: "Invalid email or password" 
            });
        }
        
        const student = result[0];
        
        try {
            const isPasswordValid = await bcrypt.compare(password, student.password);
            
            if (!isPasswordValid) {
                return res.status(401).json({ 
                    success: false,
                    error: "Invalid email or password" 
                });
            }
            
            // Update last login
            db.query("UPDATE registrations SET last_login = NOW() WHERE id = ?", [student.id]);
            
            // Return student data without password
            const { password: _, ...studentData } = student;
            
            res.json({
                success: true, 
                message: "Login successful",
                student: studentData,
                token: "student-auth-token"
            });
        } catch (error) {
            console.error("Error comparing passwords:", error);
            return res.status(500).json({ 
                success: false,
                error: "Authentication error" 
            });
        }
    });
});

// =============================
// STUDENT MANAGEMENT ENDPOINTS
// =============================

// Get all students with pagination and search
app.get("/api/students", authenticateAdmin, (req, res) => {
    const { page = 1, limit = 10, search = '', sort = 'id', order = 'ASC' } = req.query;
    const offset = (page - 1) * limit;
    
    let sql = `
        SELECT id, firstName, lastName, email, phone, age, education, experience, 
            courses, motivation, profilePictureUrl, is_active, last_login, created_at, updated_at
        FROM registrations 
        WHERE 1=1
    `;
    let countSql = `SELECT COUNT(*) as total FROM registrations WHERE 1=1`;
    let params = [];
    let countParams = [];
    
    // Add search filter
    if (search) {
        const searchTerm = `%${search}%`;
        sql += ` AND (firstName LIKE ? OR lastName LIKE ? OR email LIKE ?)`;
        countSql += ` AND (firstName LIKE ? OR lastName LIKE ? OR email LIKE ?)`;
        params.push(searchTerm, searchTerm, searchTerm);
        countParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Add sorting
    const allowedSortFields = ['id', 'firstName', 'lastName', 'email', 'age', 'created_at', 'last_login'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'id';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    sql += ` ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    console.log('Fetching students with query:', { page, limit, search, sort, order, offset });
    
    // Get total count
    db.query(countSql, countParams, (countErr, countResult) => {
        if (countErr) {
            console.error('Count query error:', countErr);
            return res.status(500).json({ error: "Database error" });
        }
        
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);
        
        // Get student data
        db.query(sql, params, (err, result) => {
            if (err) {
                console.error('Student query error:', err);
                return res.status(500).json({ error: "Database error" });
            }
            
            console.log(`Found ${result.length} students out of ${total} total`);
            
            res.json({
                students: result,
                total,
                totalPages,
                currentPage: parseInt(page),
                limit: parseInt(limit)
            });
        });
    });
});

// Get single student by ID
app.get("/api/students/:id", authenticateAdmin, (req, res) => {
    const { id } = req.params;
    
    const sql = `
        SELECT id, firstName, lastName, email, phone, age, education, experience, 
            courses, motivation, profilePictureUrl, is_active, last_login, created_at, updated_at
        FROM registrations 
        WHERE id = ?
    `;
    
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Student details error:', err);
            return res.status(500).json({ error: "Database error" });
        }
        
        if (result.length === 0) {
            return res.status(404).json({ error: "Student not found" });
        }
        
        res.json(result[0]);
    });
});

// Export students to CSV
app.get("/api/students/export/csv", authenticateAdmin, (req, res) => {
    const sql = `
        SELECT id, firstName, lastName, email, phone, age, education, experience, 
            courses, motivation, is_active, last_login, created_at
        FROM registrations 
        ORDER BY created_at DESC
    `;
    
    db.query(sql, (err, result) => {
        if (err) {
            console.error('CSV export error:', err);
            return res.status(500).json({ error: "Database error" });
        }
        
        // Simple CSV generation
        const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Age', 'Education', 'Experience', 'Courses', 'Motivation', 'Status', 'Last Login', 'Registration Date'];
        const csvData = result.map(student => [
            student.id,
            `"${student.firstName}"`,
            `"${student.lastName}"`,
            `"${student.email}"`,
            `"${student.phone || ''}"`,
            student.age || '',
            `"${student.education || ''}"`,
            `"${student.experience || ''}"`,
            `"${Array.isArray(student.courses) ? student.courses.join(', ') : student.courses}"`,
            `"${(student.motivation || '').replace(/"/g, '""')}"`,
            student.is_active ? 'Active' : 'Inactive',
            student.last_login ? new Date(student.last_login).toLocaleString() : 'Never',
            student.created_at ? new Date(student.created_at).toLocaleDateString() : ''
        ]);
        
        const csvContent = [headers, ...csvData]
            .map(row => row.join(','))
            .join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=bucodel-students.csv');
        res.send(csvContent);
    });
});

// Export students to PDF
app.get("/api/students/export/pdf", authenticateAdmin, (req, res) => {
    const sql = `
        SELECT id, firstName, lastName, email, phone, age, education, experience, 
            courses, motivation, is_active, last_login, created_at
        FROM registrations 
        ORDER BY created_at DESC
        LIMIT 100
    `;
    
    db.query(sql, (err, result) => {
        if (err) {
            console.error('PDF export error:', err);
            return res.status(500).json({ error: "Database error" });
        }
        
        // Simple PDF generation using pdfkit
        try {
            const doc = new PDFDocument();
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=bucodel-students.pdf');
            
            doc.pipe(res);
            
            // Add title
            doc.fontSize(20).text('BUCODel Students Report', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
            doc.text(`Total Students: ${result.length}`, { align: 'center' });
            doc.moveDown();
            
            // Add table headers
            const headers = ['ID', 'Name', 'Email', 'Phone', 'Status', 'Courses'];
            let yPosition = doc.y;
            
            headers.forEach((header, i) => {
                doc.text(header, 50 + (i * 80), yPosition, { width: 80, align: 'left' });
            });
            
            doc.moveTo(50, yPosition + 15).lineTo(530, yPosition + 15).stroke();
            yPosition += 25;
            
            // Add student data
            result.forEach((student, index) => {
                if (yPosition > 700) { // New page if needed
                    doc.addPage();
                    yPosition = 50;
                }
                
                const courses = Array.isArray(student.courses) ? 
                    student.courses.slice(0, 2).join(', ') : 
                    (student.courses || 'No courses');
                
                const rowData = [
                    student.id.toString(),
                    `${student.firstName} ${student.lastName}`.substring(0, 12),
                    student.email.substring(0, 15),
                    student.phone || 'N/A',
                    student.is_active ? 'Active' : 'Inactive',
                    courses.substring(0, 20)
                ];
                
                rowData.forEach((data, i) => {
                    doc.text(data, 50 + (i * 80), yPosition, { width: 80, align: 'left' });
                });
                
                yPosition += 20;
            });
            
            doc.end();
        } catch (error) {
            console.error('PDF generation error:', error);
            res.status(500).json({ error: "PDF generation failed" });
        }
    });
});

// ENHANCED STUDENT UPDATE WITH FILE HANDLING
app.put("/api/students/:id", authenticateAdmin, upload.single('profilePicture'), async (req, res) => {
    const { id } = req.params;
    let updates = req.body;
    
    try {
        let oldProfilePicture = null;
        
        // Get current student data to handle file cleanup
        db.query("SELECT profilePictureUrl FROM registrations WHERE id = ?", [id], async (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (result.length === 0) {
                return res.status(404).json({ error: "Student not found" });
            }
            
            oldProfilePicture = result[0].profilePictureUrl;
            
            // Handle new file upload
            if (req.file) {
                const fileValidation = FileUtils.validateFile(req.file);
                if (!fileValidation.valid) {
                    await FileUtils.deleteFile(req.file.path);
                    return res.status(400).json({ error: fileValidation.error });
                }
                
                updates.profilePictureUrl = FileUtils.generateFileUrl(req.file.filename);
                
                // Delete old profile picture if it exists
                if (oldProfilePicture) {
                    await FileUtils.deleteFile(oldProfilePicture);
                }
            }
            
            // Handle courses update
            if (updates.courses) {
                updates.courses = JSON.stringify(parseCourses(updates.courses));
            }
            
            updates.updated_at = new Date();
            
            db.query("UPDATE registrations SET ? WHERE id = ?", [updates, id], 
                async (updateErr, updateResult) => {
                    if (updateErr) {
                        // Clean up new file if update fails
                        if (req.file) {
                            await FileUtils.deleteFile(req.file.path);
                        }
                        return res.status(500).json({ error: updateErr.message });
                    }
                    
                    res.json({ 
                        message: "Student updated successfully",
                        profilePictureUrl: updates.profilePictureUrl
                    });
                }
            );
        });
    } catch (error) {
        // Clean up new file if any error occurs
        if (req.file) {
            await FileUtils.deleteFile(req.file.path);
        }
        console.error("Error updating student:", error);
        return res.status(500).json({ error: "Error updating student" });
    }
});

// ENHANCED STUDENT DELETE WITH PROPER FILE CLEANUP
app.delete("/api/students/:id", authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Get student data first
        db.query("SELECT profilePictureUrl FROM registrations WHERE id = ?", [id], async (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (result.length === 0) {
                return res.status(404).json({ error: "Student not found" });
            }
            
            const profilePictureUrl = result[0].profilePictureUrl;
            
            // Delete profile picture file if exists
            if (profilePictureUrl) {
                await FileUtils.deleteFile(profilePictureUrl);
            }
            
            // Delete student record
            db.query("DELETE FROM registrations WHERE id = ?", [id],
                (deleteErr, deleteResult) => {
                    if (deleteErr) return res.status(500).json({ error: deleteErr.message });
                    res.json({ message: "Student deleted successfully" });
                }
            );
        });
    } catch (error) {
        console.error("Error deleting student:", error);
        return res.status(500).json({ error: "Error deleting student" });
    }
});

// File management endpoints
app.get("/api/files/cleanup", authenticateAdmin, async (req, res) => {
    try {
        const cleanedCount = await FileUtils.cleanupOrphanedFiles();
        res.json({
            message: "File cleanup completed",
            orphanedFilesRemoved: cleanedCount
        });
    } catch (error) {
        console.error("File cleanup error:", error);
        res.status(500).json({ error: "File cleanup failed" });
    }
});

// Get file information
app.get("/api/files/info", authenticateAdmin, (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir).filter(file => file !== '.gitkeep');
        const fileInfo = files.map(file => {
            const filePath = path.join(uploadsDir, file);
            const stats = fs.statSync(filePath);
            return {
                filename: file,
                size: stats.size,
                created: stats.birthtime,
                url: `/uploads/${file}`
            };
        });
        
        res.json({
            totalFiles: fileInfo.length,
            totalSize: fileInfo.reduce((sum, file) => sum + file.size, 0),
            files: fileInfo
        });
    } catch (error) {
        console.error("Error getting file info:", error);
        res.status(500).json({ error: "Failed to get file information" });
    }
});

// ADD THIS TO YOUR server.js FILE - ADMIN REGISTRATION ENDPOINT
app.post("/api/admins/register", async (req, res) => {
    const { first_name, last_name, email, password, role = 'admin' } = req.body;

    console.log('=== ADMIN REGISTRATION REQUEST ===');
    console.log('Data received:', { first_name, last_name, email, role });

    // Validate required fields
    if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({ 
            success: false,
            error: "All fields are required: first_name, last_name, email, password" 
        });
    }

    try {
        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        const sql = `
            INSERT INTO admins 
            (first_name, last_name, email, password, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        `;

        db.query(
            sql,
            [first_name, last_name, email, hashedPassword, role],
            (err, result) => {
                if (err) {
                    console.error("SQL Error:", err.sqlMessage);
                    
                    if (err.code === "ER_DUP_ENTRY") {
                        return res.status(409).json({ 
                            success: false,
                            error: "Email already registered" 
                        });
                    }
                    return res.status(500).json({ 
                        success: false,
                        error: err.sqlMessage 
                    });
                }

                console.log('Admin registration successful, ID:', result.insertId);

                res.json({
                    success: true,
                    message: "Admin registered successfully",
                    adminId: result.insertId,
                    data: {
                        first_name,
                        last_name,
                        email,
                        role
                    }
                });
            }
        );
    } catch (error) {
        console.error("Error processing admin registration:", error);
        return res.status(500).json({ 
            success: false,
            error: "Error processing admin registration" 
        });
    }
});

// FIXED ADMIN LOGIN ENDPOINT WITH LAST_LOGIN UPDATE
app.post("/api/admins/login", async (req, res) => {
    const { email, password } = req.body;
    
    console.log('=== ADMIN LOGIN ATTEMPT ===');
    console.log('Email:', email);
    console.log('Password provided:', password ? '***' : 'missing');
    
    if (!email || !password) {
        return res.status(400).json({ 
            success: false,
            error: "Email and password are required" 
        });
    }

    const sql = "SELECT * FROM admins WHERE email = ? AND is_active = TRUE";
    
    db.query(sql, [email], async (err, result) => {
        if (err) {
            console.error("Database error:", err.message);
            return res.status(500).json({ 
                success: false,
                error: "Database error" 
            });
        } 
        
        console.log('Admin found in database:', result.length);
        
        if (result.length === 0) {
            console.log('No admin found with email:', email);
            return res.status(401).json({ 
                success: false,
                error: "Invalid email or password" 
            });
        }
        
        const admin = result[0];
        console.log('Admin data:', {
            id: admin.id,
            email: admin.email,
            first_name: admin.first_name,
            last_name: admin.last_name,
            role: admin.role,
            password_hash: admin.password.substring(0, 20) + '...'
        });
        
        try {
            console.log('Comparing passwords...');
            const isPasswordValid = await bcrypt.compare(password, admin.password);
            console.log('Password comparison result:', isPasswordValid);
            
            if (!isPasswordValid) {
                console.log('Password is invalid');
                return res.status(401).json({ 
                    success: false,
                    error: "Invalid email or password" 
                });
            }
            
            // Update last login
            db.query("UPDATE admins SET last_login = NOW() WHERE id = ?", [admin.id]);
            
            console.log('Login successful for admin:', admin.email);
            
            // Return admin data without password
            const { password: _, ...adminData } = admin;
            
            res.json({
                success: true, 
                message: "Login successful",
                admin: adminData,
                token: "admin-auth-token"
            });
        } catch (error) {
            console.error("Error comparing passwords:", error);
            return res.status(500).json({ 
                success: false,
                error: "Authentication error" 
            });
        }
    });
});

// Error handling middleware for multer
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
    console.log(`📁 File uploads served from: /uploads/`);
    console.log(`💾 Upload directory: ${path.resolve(uploadsDir)}`);
    console.log(`✅ Health check available at: /health`);
    console.log(`📊 Enhanced database schema loaded`);
});
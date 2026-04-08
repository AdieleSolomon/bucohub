import express, { json } from "express";
import cors from "cors";
import { createPool } from "mysql2";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import Joi from 'joi';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5500; 

// =============================
// ENVIRONMENT CONFIGURATION
// =============================

const isDevelopment = process.env.NODE_ENV !== 'production';

if (isDevelopment) {
    console.log('🔧 Running in DEVELOPMENT mode');
} else {
    console.log('🚀 Running in PRODUCTION mode');
}

// =============================
// ENVIRONMENT VALIDATION
// =============================

const requiredEnvVars = ['JWT_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    console.error('💡 Please set these variables in your .env file');
    process.exit(1);
}

// =============================
// SECURITY MIDDLEWARE
// =============================

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// Add express.json() middleware FIRST
app.use(json());

// =============================
// FIXED CORS CONFIGURATION
// =============================
app.use(cors({
    origin: [
        'http://localhost:3000', 
        'http://localhost:3001', 
        'http://127.0.0.1:5500',
        'http://127.0.0.1:3000',
        'http://localhost:5500', // Add this for your HTML file
        'http://127.0.0.1:5501', // Common alternative port
        'file://' // Allow file protocol for local HTML files
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// =============================
// RATE LIMITING
// =============================

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login attempts per windowMs
    message: {
        success: false,
        error: 'Too many login attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting
app.use('/api/*/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/', apiLimiter);

// =============================
// LOGGING CONFIGURATION
// =============================

// Create logs directory if it doesn't exist
const logsDir = './logs';
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Configure morgan for HTTP request logging
app.use(morgan('combined', {
    stream: fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' })
}));

// Development logging to console
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}

// =============================
// VALIDATION SCHEMAS
// =============================

const validationSchemas = {
    studentRegistration: Joi.object({
        firstName: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required()
        .messages({
            'string.pattern.base': 'First name can only contain letters and spaces',
            'string.min': 'First name must be at least 2 characters long',
            'string.max': 'First name cannot exceed 50 characters'
        }),
        lastName: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required()
        .messages({
            'string.pattern.base': 'Last name can only contain letters and spaces'
        }),
        email: Joi.string().email().required(),
        phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]{10,}$/).required()
        .messages({
            'string.pattern.base': 'Please provide a valid phone number'
        }),
        password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required()
        .messages({
            'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number',
            'string.min': 'Password must be at least 8 characters long'
        }),
        age: Joi.number().integer().min(16).max(100).optional(),
        education: Joi.string().max(255).optional(),
        experience: Joi.string().max(500).optional(),
        courses: Joi.alternatives().try(
        Joi.string(),
        Joi.array().items(Joi.string())
        ).optional(),
        motivation: Joi.string().max(1000).optional()
    }),

    adminRegistration: Joi.object({
        first_name: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required(),
        last_name: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required(),
        role: Joi.string().valid('admin', 'superadmin').default('admin')
    }),

    teacherRegistration: Joi.object({
        first_name: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required(),
        last_name: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required(),
        subject: Joi.string().min(2).max(100).required()
    }),

    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required()
    }),

    studentUpdate: Joi.object({
        firstName: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).optional(),
        lastName: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).optional(),
        email: Joi.string().email().optional(),
        phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]{10,}$/).optional(),
        age: Joi.number().integer().min(16).max(100).optional(),
        education: Joi.string().max(255).optional(),
        experience: Joi.string().max(500).optional(),
        courses: Joi.alternatives().try(
        Joi.string(),
        Joi.array().items(Joi.string())
        ).optional(),
        motivation: Joi.string().max(1000).optional()
    }),

    // PASSWORD RESET SCHEMAS
    forgotPassword: Joi.object({
        email: Joi.string().email().required(),
        role: Joi.string().valid('student', 'admin', 'teacher').optional()
    }),

    resetPassword: Joi.object({
        email: Joi.string().email().required(),
        resetCode: Joi.string().min(4).max(10).required(),
        newPassword: Joi.string().min(6).required(),
        confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required(),
        role: Joi.string().valid('student', 'admin', 'teacher').optional()
    }),

    resendResetCode: Joi.object({
        email: Joi.string().email().required(),
        role: Joi.string().valid('student', 'admin', 'teacher').optional()
    })
};

// Validation middleware
const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }
        next();
    };
};

// =============================
// ENHANCED FILE UPLOAD CONFIGURATION
// =============================

// Define uploads directory
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Uploads directory created:', uploadsDir);
}

// Enhanced Multer configuration with better file handling
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

// Enhanced file filter with better error handling
const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type. Only ${allowedMimes.join(', ')} are allowed.`), false);
    }
};

// Create upload configuration
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1 // Only one file
    },
    fileFilter: fileFilter
});

// Serve static files from uploads directory
app.use('/uploads', express.static(uploadsDir));

// =============================
// ENHANCED DATABASE CONNECTION WITH BETTER ERROR HANDLING
// =============================

const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "bucohub",
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    waitForConnections: true,
    queueLimit: 0,
    reconnect: true,
    // Add these for better stability
    charset: 'utf8mb4',
    timezone: '+00:00',
    multipleStatements: false,
    connectTimeout: 60000,
    // Handle disconnections better
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

const db = createPool(dbConfig);

// Enhanced connection handler with better error management
let connectionRetries = 0;
const MAX_RETRIES = 3;

const handleDatabaseConnection = () => {
    db.getConnection((err, connection) => {
        if (err) {
            console.error('Database connection failed:', err.message);
            
            if (connectionRetries < MAX_RETRIES) {
                connectionRetries++;
                console.log(`Retrying connection in 5 seconds... (Attempt ${connectionRetries}/${MAX_RETRIES})`);
                setTimeout(handleDatabaseConnection, 5000);
            } else {
                console.error('Max connection retries reached. Please check your database configuration.');
                console.log('Server will continue running but database operations will fail.');
                // Don't exit process, just log error
            }
        } else {
            console.log("✅ Connected to MySQL database (bucohub)");
            connection.release();
            connectionRetries = 0; // Reset retry counter on successful connection
            verifyTables();
        }
    });
};

// Start database connection
handleDatabaseConnection();

// Handle pool errors without crashing
db.on('error', (err) => {
    console.error('Database pool error:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('Database connection was closed. Reconnecting...');
    } else if (err.code === 'ER_CON_COUNT_ERROR') {
        console.log('Database has too many connections.');
    } else if (err.code === 'ECONNREFUSED') {
        console.log('Database connection was refused.');
    }
});

const verifyTables = () => {
    const requiredTables = ['registrations', 'admins', 'teachers', 'password_reset_tokens'];
    
    requiredTables.forEach(table => {
        db.query(`SHOW TABLES LIKE '${table}'`, (err, result) => {
            if (err) {
                console.error(`Error checking table ${table}:`, err.message);
            } else if (result.length === 0) {
                console.warn(`⚠️  Table '${table}' does not exist. Please run database migrations.`);
                if (table === 'password_reset_tokens') {
                    createPasswordResetTokensTable();
                }
            } else {
                console.log(`✅ Table '${table}' exists`);
            }
        });
    });
};

// Create password reset tokens table if it doesn't exist
const createPasswordResetTokensTable = () => {
    const createTableSQL = `
        CREATE TABLE password_reset_tokens (
            id INT PRIMARY KEY AUTO_INCREMENT,
            email VARCHAR(255) NOT NULL,
            reset_code VARCHAR(10) NOT NULL,
            token VARCHAR(500) NOT NULL,
            user_role ENUM('student', 'admin', 'teacher') NOT NULL,
            expires_at DATETIME NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_token (token),
            INDEX idx_expires (expires_at)
        )
    `;
    
    db.query(createTableSQL, (err, result) => {
        if (err) {
            console.error('Error creating password_reset_tokens table:', err.message);
        } else {
            console.log('✅ Created password_reset_tokens table');
        }
    });
};

// =============================
// EMAIL CONFIGURATION - MILESTONE 9
// =============================

const emailConfig = {
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'babcockbucodel@gmail.com',
        pass: process.env.EMAIL_PASS || 'rxkh ccvt mlre xrxs'
    }
};

// Test email configuration on server start
const emailTransporter = nodemailer.createTransport(emailConfig);

// Verify email configuration
emailTransporter.verify((error, success) => {
    if (error) {
        console.log('❌ Email configuration error:', error.message);
        console.log('💡 To enable email notifications:');
        console.log('   1. Set EMAIL_USER and EMAIL_PASS environment variables');
        console.log('   2. For Gmail: Enable 2FA and use App Password');
        console.log('   3. Create a .env file with your credentials');
    } else {
        console.log('✅ Email server is ready to send messages');
    }
});

// =============================
// JWT / AUTH UTILITIES
// =============================

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-for-development';

// Authentication middleware (verify JWT)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: "Access token required" });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, email, role, iat, exp }
        next();
    } catch (error) {
        console.error('JWT verification error:', error.message);
        return res.status(403).json({
            success: false,
            error: "Invalid or expired token"
        });
    }
};

// Role-based authorization
const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({
                success: false,
                error: `Access denied. ${role} role required.`
            });
        }
        next();
    };
};

// Allow admin OR the owner (self) to access resource
const requireRoleOrSelf = (role) => {
    return (req, res, next) => {
        const requestedId = req.params.id ? String(req.params.id) : null;
        if (!req.user) {
            return res.status(403).json({ success: false, error: "Insufficient permissions" });
        }

        // Admins allowed
        if (req.user.role === 'admin' || req.user.role === 'superadmin') {
            return next();
        }

        // If the required role is `'student'` allow if the user is the same id
        if (req.user.role === role && requestedId && String(req.user.id) === String(requestedId)) {
            return next();
        }

        return res.status(403).json({ success: false, error: "Insufficient permissions" });
    };
};

// Token generator
const generateToken = (userData) => {
    return jwt.sign(
        {
            id: userData.id,
            email: userData.email,
            role: userData.role
        },
        JWT_SECRET,
        { expiresIn: '24h' } // Token expires in 24 hours
    );
};

// =============================
// UTILITY FUNCTIONS
// =============================

const FileUtils = {
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

    generateFileUrl: (filename) => {
        if (!filename) return null;
        const safeFilename = path.basename(filename); // Prevent directory traversal
        return `/uploads/${safeFilename}`;
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

// Password Reset Utilities
const PasswordResetUtils = {
    generateResetCode: () => {
        return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
    },

    cleanExpiredTokens: () => {
        const sql = 'DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used = TRUE';
        db.query(sql, (err) => {
            if (err) {
                console.error('Error cleaning expired tokens:', err.message);
            }
        });
    },

    storeResetToken: (email, resetCode, token, userRole) => {
        return new Promise((resolve, reject) => {
            // Clean expired tokens first
            PasswordResetUtils.cleanExpiredTokens();

            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
            
            const sql = `
                INSERT INTO password_reset_tokens (email, reset_code, token, user_role, expires_at)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            db.query(sql, [email, resetCode, token, userRole, expiresAt], (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    },

    validateResetToken: (email, resetCode) => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM password_reset_tokens 
                WHERE email = ? AND reset_code = ? AND used = FALSE AND expires_at > NOW()
                ORDER BY created_at DESC 
                LIMIT 1
            `;
            
            db.query(sql, [email, resetCode], (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result.length > 0 ? result[0] : null);
                }
            });
        });
    },

    markTokenAsUsed: (tokenId) => {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE password_reset_tokens SET used = TRUE WHERE id = ?';
            db.query(sql, [tokenId], (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }
};

// Email utility functions
const EmailUtils = {
    sendWelcomeEmail: async (studentEmail, studentName) => {
        // Check if email is properly configured
        if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'babcockbucodel@gmail.com' ||
            !process.env.EMAIL_PASS || process.env.EMAIL_PASS === 'rxkh ccvt mlre xrxs') {
            console.warn('📧 Email not configured - skipping welcome email');
            return { success: false, error: 'Email not configured' };
        }

        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: studentEmail,
                subject: 'Welcome to BUCODel Technological Hub!',
                html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2d1b3d; text-align: center;">Welcome to BUCODel!</h2>
                <div style="background: linear-gradient(135deg, #4a2c5a 0%, #3d1a4f 100%); padding: 20px; border-radius: 10px; color: white;">
                    <h3 style="color: #ffd700;">Hello ${studentName},</h3>
                    <p>Welcome to BUCODel Technological Hub! We're excited to have you join our community.</p>
                    <p>Your registration has been successfully processed.</p>
                    <p style="color: #ffd700; font-weight: bold;">Best regards,<br>The BUCODel Team</p>
                </div>
                </div>
                `
            };

            const info = await emailTransporter.sendMail(mailOptions);
            console.log('✅ Welcome email sent to:', studentEmail);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Error sending welcome email:', error);
            return { success: false, error: error.message };
        }
    },

    sendPasswordResetEmail: async (email, resetCode, userName = 'User') => {
        if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'babcockbucodel@gmail.com') {
            console.warn('📧 Email not configured - skipping password reset email');
            return { success: false, error: 'Email not configured' };
        }

        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Password Reset Code - BUCODel',
                html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2d1b3d; text-align: center;">Password Reset</h2>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #4a2c5a;">
                    <h3 style="color: #4a2c5a;">Hello ${userName},</h3>
                    <p>You requested a password reset for your BUCODel account.</p>
                    <p>Use the following reset code to create a new password:</p>
                    <div style="text-align: center; margin: 20px 0;">
                        <div style="display: inline-block; background: #4a2c5a; color: white; padding: 15px 30px; font-size: 24px; font-weight: bold; letter-spacing: 5px; border-radius: 8px;">
                            ${resetCode}
                        </div>
                    </div>
                    <p>This code will expire in 1 hour.</p>
                    <p>If you didn't request this reset, please ignore this email.</p>
                    <p style="color: #666; font-size: 12px; margin-top: 20px;">
                        Security Tip: Never share this code with anyone.
                    </p>
                </div>
                </div>
                `
            };

            const info = await emailTransporter.sendMail(mailOptions);
            console.log('✅ Password reset email sent to:', email);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Error sending password reset email:', error);
            return { success: false, error: error.message };
        }
    }
};

// =============================
// HEALTH CHECK AND MONITORING
// =============================

app.get("/health", (req, res) => {
    const healthCheck = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    };

    res.json(healthCheck);
});

app.get("/health/detailed", authenticateToken, requireRole('admin'), (req, res) => {
    // Check database connection
    db.query('SELECT 1 as db_status', (err, result) => {
        const dbStatus = err ? 'ERROR' : 'OK';
        
        const detailedHealth = {
            status: dbStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            database: dbStatus,
            email: process.env.EMAIL_USER ? 'CONFIGURED' : 'NOT_CONFIGURED',
            environment: process.env.NODE_ENV || 'development'
        };

        res.json(detailedHealth);
    });
});

// =============================
// ROUTES
// =============================

// Default route
app.get("/", (req, res) => {
    res.json({
        message: "BUCODel API is running",
        version: "1.0.0",
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            health: "/health",
            studentRegistration: "/api/register",
            adminLogin: "/api/admins/login",
            teacherLogin: "/api/teachers/login",
            studentLogin: "/api/students/login",
            getStudents: "/api/students",
            fileUploads: "/uploads/",
            documentation: "https://github.com/your-repo/docs"
        },
        timestamp: new Date().toISOString()
    });
});

// ENHANCED STUDENT REGISTRATION WITH VALIDATION
app.post("/api/register", upload.single('profilePicture'), validateRequest(validationSchemas.studentRegistration), async (req, res) => {
    let { firstName, lastName, email, phone, password,
        age, education, experience, courses, motivation } = req.body;

    console.log('=== REGISTRATION REQUEST ===');
    console.log('File received:', req.file ? {
        originalname: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
    } : 'No file');

    // Validate required fields (redundant but safe)
    if (!firstName || !lastName || !email || !phone || !password) {
        if (req.file) {
            await FileUtils.deleteFile(req.file.path);
        }
        return res.status(400).json({ success: false, error: "Required fields missing" });
    }

    // Validate file if present
    if (req.file) {
        const fileValidation = FileUtils.validateFile(req.file);
        if (!fileValidation.valid) {
            await FileUtils.deleteFile(req.file.path);
            return res.status(400).json({ success: false, error: fileValidation.error });
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
                        return res.status(409).json({ success: false, error: "Email already registered" });
                    }
                    return res.status(500).json({ success: false, error: err.sqlMessage });
                }

                console.log('Registration successful, ID:', result.insertId);

                // Send welcome email - MILESTONE 9
                try {
                    const emailResult = await EmailUtils.sendWelcomeEmail(email, `${firstName} ${lastName}`);
                    if (emailResult.success) {
                        console.log('Welcome email sent successfully to:', email);
                    } else {
                        console.warn('Failed to send welcome email:', emailResult.error);
                    }
                } catch (emailError) {
                    console.warn('Error sending welcome email (non-critical):', emailError);
                }

                res.status(201).json({
                    success: true,
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
        return res.status(500).json({ success: false, error: "Error processing registration" });
    }
});

// STUDENT LOGIN ENDPOINT - with validation
app.post("/api/students/login", validateRequest(validationSchemas.login), async (req, res) => {
    const { email, password } = req.body;

    console.log('=== STUDENT LOGIN ATTEMPT ===');
    console.log('Email:', email);

    const sql = "SELECT * FROM registrations WHERE email = ?";

    db.query(sql, [email], async (err, result) => {
        if (err) {
            console.error("Database error:", err.message);
            return res.status(500).json({
                success: false,
                error: "Database error"
            });
        }

        console.log('Student found in database:', result.length);

        if (result.length === 0) {
            console.log('No student found with email:', email);
            return res.status(401).json({
                success: false,
                error: "Invalid email or password"
            });
        }

        const student = result[0];

        try {
            console.log('Comparing passwords...');
            const isPasswordValid = await bcrypt.compare(password, student.password);
            console.log('Password comparison result:', isPasswordValid);

            if (!isPasswordValid) {
                console.log('Password is invalid');
                return res.status(401).json({
                    success: false,
                    error: "Invalid email or password"
                });
            }

            console.log('Login successful for student:', student.email);

            // Return student data without password
            const { password: _, ...studentData } = student;

            // Generate JWT
            const token = generateToken({
                id: student.id,
                email: student.email,
                role: 'student'
            });

            res.json({
                success: true,
                message: "Login successful",
                student: studentData,
                token
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
// PASSWORD RESET FUNCTIONALITY - FIXED AND ENHANCED
// =============================

// Forgot Password - Request reset code
app.post("/api/auth/forgot-password", validateRequest(validationSchemas.forgotPassword), async (req, res) => {
    const { email, role = 'student' } = req.body;

    console.log('=== PASSWORD RESET REQUEST ===');
    console.log('Email:', email, 'Role:', role);

    try {
        // Determine which table to query based on role
        let tableName;
        let nameField = 'firstName';
        
        switch (role) {
            case 'student':
                tableName = 'registrations';
                nameField = 'firstName';
                break;
            case 'admin':
                tableName = 'admins';
                nameField = 'first_name';
                break;
            case 'teacher':
                tableName = 'teachers';
                nameField = 'first_name';
                break;
            default:
                return res.status(400).json({ 
                    success: false, 
                    error: "Invalid role specified" 
                });
        }

        // Check if user exists
        const sql = `SELECT id, email, ${nameField} FROM ${tableName} WHERE email = ?`;
        
        db.query(sql, [email], async (err, result) => {
            if (err) {
                console.error('Database error checking user:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: "Database error" 
                });
            }

            if (result.length === 0) {
                // Don't reveal whether email exists for security
                console.log('No user found with email:', email);
                return res.json({
                    success: true,
                    message: "If the email exists, a reset code has been sent"
                });
            }

            const user = result[0];
            const userName = user[nameField] || 'User';

            // Generate reset code and token
            const resetCode = PasswordResetUtils.generateResetCode();
            const resetToken = jwt.sign(
                { 
                    email: user.email, 
                    role: role,
                    purpose: 'password_reset',
                    code: resetCode
                },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            try {
                // Store reset token in database
                await PasswordResetUtils.storeResetToken(email, resetCode, resetToken, role);

                // Send reset email
                const emailResult = await EmailUtils.sendPasswordResetEmail(email, resetCode, userName);

                if (emailResult.success) {
                    console.log('Password reset code sent to:', email);
                    res.json({
                        success: true,
                        message: "Password reset code has been sent to your email",
                        // In development, you might want to return the code for testing
                        ...(process.env.NODE_ENV === 'development' && { resetCode })
                    });
                } else {
                    console.error('Failed to send reset email:', emailResult.error);
                    res.status(500).json({
                        success: false,
                        error: "Failed to send reset email. Please try again."
                    });
                }
            } catch (storeError) {
                console.error('Error storing reset token:', storeError);
                res.status(500).json({
                    success: false,
                    error: "Error processing reset request"
                });
            }
        });
    } catch (error) {
        console.error("Password reset request error:", error);
        res.status(500).json({
            success: false,
            error: "Error processing password reset request"
        });
    }
});

// Reset Password with code
app.post("/api/auth/reset-password", validateRequest(validationSchemas.resetPassword), async (req, res) => {
    const { email, resetCode, newPassword, confirmPassword, role = 'student' } = req.body;

    console.log('=== PASSWORD RESET CONFIRMATION ===');
    console.log('Email:', email, 'Role:', role);

    try {
        // Validate passwords match
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                error: "Passwords do not match"
            });
        }

        // Validate reset code
        const tokenData = await PasswordResetUtils.validateResetToken(email, resetCode);
        
        if (!tokenData) {
            return res.status(400).json({
                success: false,
                error: "Invalid or expired reset code"
            });
        }

        // Verify the token is valid
        try {
            const decoded = jwt.verify(tokenData.token, JWT_SECRET);
            if (decoded.purpose !== 'password_reset' || decoded.email !== email) {
                throw new Error('Invalid token');
            }
        } catch (tokenError) {
            return res.status(400).json({
                success: false,
                error: "Invalid reset token"
            });
        }

        // Determine which table to update based on role
        let tableName;
        switch (role) {
            case 'student':
                tableName = 'registrations';
                break;
            case 'admin':
                tableName = 'admins';
                break;
            case 'teacher':
                tableName = 'teachers';
                break;
            default:
                return res.status(400).json({ 
                    success: false, 
                    error: "Invalid role specified" 
                });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password in database
        const updateSql = `UPDATE ${tableName} SET password = ?, updated_at = NOW() WHERE email = ?`;
        
        db.query(updateSql, [hashedPassword, email], async (err, result) => {
            if (err) {
                console.error("Error updating password:", err);
                return res.status(500).json({ 
                    success: false, 
                    error: "Error updating password" 
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: "User not found"
                });
            }

            // Mark token as used
            await PasswordResetUtils.markTokenAsUsed(tokenData.id);

            console.log('Password reset successful for:', email);
            res.json({
                success: true,
                message: "Password has been reset successfully"
            });
        });
    } catch (error) {
        console.error("Password reset error:", error);
        res.status(500).json({
            success: false,
            error: "Error resetting password"
        });
    }
});

// Resend reset code
app.post("/api/auth/resend-reset-code", validateRequest(validationSchemas.resendResetCode), async (req, res) => {
    const { email, role = 'student' } = req.body;

    console.log('=== RESEND RESET CODE ===');
    console.log('Email:', email, 'Role:', role);

    try {
        // Determine which table to query based on role
        let tableName;
        let nameField = 'firstName';
        
        switch (role) {
            case 'student':
                tableName = 'registrations';
                nameField = 'firstName';
                break;
            case 'admin':
                tableName = 'admins';
                nameField = 'first_name';
                break;
            case 'teacher':
                tableName = 'teachers';
                nameField = 'first_name';
                break;
            default:
                return res.status(400).json({ 
                    success: false, 
                    error: "Invalid role specified" 
                });
        }

        // Check if user exists
        const sql = `SELECT id, email, ${nameField} FROM ${tableName} WHERE email = ?`;
        
        db.query(sql, [email], async (err, result) => {
            if (err) {
                console.error('Database error checking user:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: "Database error" 
                });
            }

            if (result.length === 0) {
                // Don't reveal whether email exists for security
                return res.json({
                    success: true,
                    message: "If the email exists, a reset code has been sent"
                });
            }

            const user = result[0];
            const userName = user[nameField] || 'User';

            // Generate new reset code and token
            const resetCode = PasswordResetUtils.generateResetCode();
            const resetToken = jwt.sign(
                { 
                    email: user.email, 
                    role: role,
                    purpose: 'password_reset',
                    code: resetCode
                },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            try {
                // Store new reset token in database
                await PasswordResetUtils.storeResetToken(email, resetCode, resetToken, role);

                // Send reset email
                const emailResult = await EmailUtils.sendPasswordResetEmail(email, resetCode, userName);

                if (emailResult.success) {
                    console.log('Reset code resent to:', email);
                    res.json({
                        success: true,
                        message: "Reset code has been resent to your email",
                        // In development, you might want to return the code for testing
                        ...(process.env.NODE_ENV === 'development' && { resetCode })
                    });
                } else {
                    console.error('Failed to send reset email:', emailResult.error);
                    res.status(500).json({
                        success: false,
                        error: "Failed to send reset email. Please try again."
                    });
                }
            } catch (storeError) {
                console.error('Error storing reset token:', storeError);
                res.status(500).json({
                    success: false,
                    error: "Error processing reset request"
                });
            }
        });
    } catch (error) {
        console.error("Resend reset code error:", error);
        res.status(500).json({
            success: false,
            error: "Error processing reset request"
        });
    }
});

// =============================
// STUDENT MANAGEMENT ENDPOINTS - protected by JWT + roles
// =============================

// Get all students with pagination, search, and sorting - admin OR teacher
app.get("/api/students", authenticateToken, (req, res) => {
    // Check if user is admin OR teacher
    if (req.user.role !== 'admin' && req.user.role !== 'teacher' && req.user.role !== 'superadmin') {
        return res.status(403).json({
            success: false,
            error: "Access denied. Admin or Teacher role required."
        });
    }

    const { page = 1, limit = 10, search = '', sort = 'id', order = 'ASC' } = req.query;
    const offset = (page - 1) * limit;

    // Use parameterized queries for sorting
    const allowedSortFields = ['id', 'firstName', 'lastName', 'email', 'age', 'created_at', 'updated_at'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'id';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let sql = `
        SELECT id, firstName, lastName, email, phone, age, education, experience, 
            courses, motivation, profilePictureUrl, created_at, updated_at
        FROM registrations 
        WHERE 1=1
    `;
    let countSql = `SELECT COUNT(*) as total FROM registrations WHERE 1=1`;
    let params = [];
    let countParams = [];

    // Add search filter - MILESTONE 1
    if (search) {
        const searchTerm = `%${search}%`;
        sql += ` AND (firstName LIKE ? OR lastName LIKE ? OR email LIKE ?)`;
        countSql += ` AND (firstName LIKE ? OR lastName LIKE ? OR email LIKE ?)`;
        params.push(searchTerm, searchTerm, searchTerm);
        countParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Use parameterized sorting
    sql += ` ORDER BY ?? ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(sortField, parseInt(limit), offset);

    console.log('Fetching students with query:', { page, limit, search, sort, order, offset });

    // Get total count
    db.query(countSql, countParams, (countErr, countResult) => {
        if (countErr) {
            console.error('Count query error:', countErr);
            return res.status(500).json({ success: false, error: "Database error" });
        }

        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        // Get student data
        db.query(sql, params, (err, result) => {
            if (err) {
                console.error('Student query error:', err);
                return res.status(500).json({ success: false, error: "Database error" });
            }

            console.log(`Found ${result.length} students out of ${total} total`);

            res.json({
                success: true,
                students: result,
                total,
                totalPages,
                currentPage: parseInt(page),
                limit: parseInt(limit)
            });
        });
    });
});

// Get single student by ID - admin, teacher, or the student themselves
app.get("/api/students/:id", authenticateToken, (req, res) => {
    const { id } = req.params;

    // Check permissions: admin, teacher, or student accessing own data
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const isTeacher = req.user.role === 'teacher';
    const isSelf = req.user.role === 'student' && String(req.user.id) === String(id);

    if (!isAdmin && !isTeacher && !isSelf) {
        return res.status(403).json({
            success: false,
            error: "Access denied. Insufficient permissions."
        });
    }

    const sql = `
        SELECT id, firstName, lastName, email, phone, age, education, experience, 
            courses, motivation, profilePictureUrl, created_at, updated_at
        FROM registrations 
        WHERE id = ?
    `;

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Student details error:', err);
            return res.status(500).json({ success: false, error: "Database error" });
        }

        if (result.length === 0) {
            return res.status(404).json({ success: false, error: "Student not found" });
        }

        res.json({
            success: true,
            student: result[0]
        });
    });
});

// Export students to CSV - admin only
app.get("/api/students/export/csv", authenticateToken, requireRole('admin'), (req, res) => {
    const sql = `
        SELECT id, firstName, lastName, email, phone, age, education, experience, 
            courses, motivation, created_at, updated_at
        FROM registrations 
        ORDER BY created_at DESC
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error('CSV export error:', err);
            return res.status(500).json({ success: false, error: "Database error" });
        }

        // Simple CSV generation
        const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Age', 'Education', 'Experience', 'Courses', 'Motivation', 'Registration Date', 'Last Updated'];
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
            student.created_at ? new Date(student.created_at).toLocaleDateString() : '',
            student.updated_at ? new Date(student.updated_at).toLocaleDateString() : ''
        ]);

        const csvContent = [headers, ...csvData]
            .map(row => row.join(','))
            .join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=bucodel-students.csv');
        res.send(csvContent);
    });
});

// Export students to PDF - admin only
app.get("/api/students/export/pdf", authenticateToken, requireRole('admin'), (req, res) => {
    const sql = `
        SELECT id, firstName, lastName, email, phone, age, education, experience, 
            courses, motivation, created_at, updated_at
        FROM registrations 
        ORDER BY created_at DESC
        LIMIT 100
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error('PDF export error:', err);
            return res.status(500).json({ success: false, error: "Database error" });
        }

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
            const headers = ['ID', 'Name', 'Email', 'Phone', 'Courses', 'Registered'];
            let yPosition = doc.y;

            headers.forEach((header, i) => {
                doc.text(header, 50 + (i * 90), yPosition, { width: 80, align: 'left' });
            });

            doc.moveTo(50, yPosition + 15).lineTo(550, yPosition + 15).stroke();
            yPosition += 25;

            // Add student data
            result.forEach((student, index) => {
                if (yPosition > 700) {
                    doc.addPage();
                    yPosition = 50;
                }

                const courses = Array.isArray(student.courses) ?
                    student.courses.slice(0, 2).join(', ') :
                    (student.courses || 'No courses');

                const registeredDate = student.created_at ?
                    new Date(student.created_at).toLocaleDateString() : 'N/A';

                const rowData = [
                    student.id.toString(),
                    `${student.firstName} ${student.lastName}`.substring(0, 12),
                    student.email.substring(0, 18),
                    student.phone || 'N/A',
                    courses.substring(0, 20),
                    registeredDate
                ];

                rowData.forEach((data, i) => {
                    doc.text(data, 50 + (i * 90), yPosition, { width: 80, align: 'left' });
                });

                yPosition += 20;
            });

            doc.end();
        } catch (error) {
            console.error('PDF generation error:', error);
            res.status(500).json({ success: false, error: "PDF generation failed" });
        }
    });
});

// ENHANCED STUDENT UPDATE WITH FILE HANDLING - admin only
app.put("/api/students/:id", authenticateToken, requireRole('admin'), upload.single('profilePicture'), validateRequest(validationSchemas.studentUpdate), async (req, res) => {
    const { id } = req.params;
    let updates = req.body;

    try {
        let oldProfilePicture = null;

        // Get current student data to handle file cleanup
        db.query("SELECT profilePictureUrl FROM registrations WHERE id = ?", [id], async (err, result) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            if (result.length === 0) {
                return res.status(404).json({ success: false, error: "Student not found" });
            }

            oldProfilePicture = result[0].profilePictureUrl;

            // Handle new file upload - MILESTONE 5
            if (req.file) {
                const fileValidation = FileUtils.validateFile(req.file);
                if (!fileValidation.valid) {
                    await FileUtils.deleteFile(req.file.path);
                    return res.status(400).json({ success: false, error: fileValidation.error });
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

            // Update timestamp - MILESTONE 8
            updates.updated_at = new Date();

            db.query("UPDATE registrations SET ? WHERE id = ?", [updates, id],
                async (updateErr, updateResult) => {
                    if (updateErr) {
                        // Clean up new file if update fails
                        if (req.file) {
                            await FileUtils.deleteFile(req.file.path);
                        }
                        return res.status(500).json({ success: false, error: updateErr.message });
                    }

                    res.json({
                        success: true,
                        message: "Student updated successfully",
                        profilePictureUrl: updates.profilePictureUrl,
                        updated_at: updates.updated_at
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
        return res.status(500).json({ success: false, error: "Error updating student" });
    }
});

// ENHANCED STUDENT DELETE WITH PROPER FILE CLEANUP - admin only
app.delete("/api/students/:id", authenticateToken, requireRole('admin'), async (req, res) => {
    const { id } = req.params;

    try {
        // Get student data first
        db.query("SELECT profilePictureUrl FROM registrations WHERE id = ?", [id], async (err, result) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            if (result.length === 0) {
                return res.status(404).json({ success: false, error: "Student not found" });
            }

            const profilePictureUrl = result[0].profilePictureUrl;

            // Delete profile picture file if exists
            if (profilePictureUrl) {
                await FileUtils.deleteFile(profilePictureUrl);
            }

            // Delete student record
            db.query("DELETE FROM registrations WHERE id = ?", [id],
                (deleteErr, deleteResult) => {
                    if (deleteErr) return res.status(500).json({ success: false, error: deleteErr.message });
                    res.json({ success: true, message: "Student deleted successfully" });
                }
            );
        });
    } catch (error) {
        console.error("Error deleting student:", error);
        return res.status(500).json({ success: false, error: "Error deleting student" });
    }
});

// ADMIN REGISTRATION ENDPOINT - with validation
app.post("/api/admins/register", validateRequest(validationSchemas.adminRegistration), async (req, res) => {
    const { first_name, last_name, email, password, role = 'admin' } = req.body;

    console.log('=== ADMIN REGISTRATION REQUEST ===');
    console.log('Data received:', { first_name, last_name, email, role });

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

                res.status(201).json({
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

// ADMIN LOGIN ENDPOINT - with validation
app.post("/api/admins/login", validateRequest(validationSchemas.login), async (req, res) => {
    const { email, password } = req.body;

    console.log('=== ADMIN LOGIN ATTEMPT ===');
    console.log('Email:', email);

    const sql = "SELECT * FROM admins WHERE email = ?";

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

            console.log('Login successful for admin:', admin.email);

            // Return admin data without password
            const { password: _, ...adminData } = admin;

            // Generate JWT
            const token = generateToken({
                id: admin.id,
                email: admin.email,
                role: admin.role || 'admin'
            });

            res.json({
                success: true,
                message: "Login successful",
                admin: adminData,
                token
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

// TEACHER REGISTRATION ENDPOINT - with validation
app.post("/api/teachers/register", validateRequest(validationSchemas.teacherRegistration), async (req, res) => {
    const { first_name, last_name, email, password, subject } = req.body;

    console.log('=== TEACHER REGISTRATION REQUEST ===');
    console.log('Data received:', { first_name, last_name, email, subject });

    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const sql = `
            INSERT INTO teachers 
            (first_name, last_name, email, password, subject, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'teacher', NOW(), NOW())
        `;

        db.query(
            sql,
            [first_name, last_name, email, hashedPassword, subject],
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

                console.log('Teacher registration successful, ID:', result.insertId);

                res.status(201).json({
                    success: true,
                    message: "Teacher registered successfully",
                    teacherId: result.insertId,
                    data: {
                        first_name,
                        last_name,
                        email,
                        subject,
                        role: 'teacher'
                    }
                });
            }
        );
    } catch (error) {
        console.error("Error processing teacher registration:", error);
        return res.status(500).json({
            success: false,
            error: "Error processing teacher registration"
        });
    }
});

// TEACHER LOGIN ENDPOINT - with validation
app.post("/api/teachers/login", validateRequest(validationSchemas.login), async (req, res) => {
    const { email, password } = req.body;

    console.log('=== TEACHER LOGIN ATTEMPT ===');
    console.log('Email:', email);

    const sql = "SELECT * FROM teachers WHERE email = ?";

    db.query(sql, [email], async (err, result) => {
        if (err) {
            console.error("Database error:", err.message);
            return res.status(500).json({
                success: false,
                error: "Database error"
            });
        }

        console.log('Teacher found in database:', result.length);

        if (result.length === 0) {
            console.log('No teacher found with email:', email);
            return res.status(401).json({
                success: false,
                error: "Invalid email or password"
            });
        }

        const teacher = result[0];

        try {
            console.log('Comparing passwords...');
            const isPasswordValid = await bcrypt.compare(password, teacher.password);
            console.log('Password comparison result:', isPasswordValid);

            if (!isPasswordValid) {
                console.log('Password is invalid');
                return res.status(401).json({
                    success: false,
                    error: "Invalid email or password"
                });
            }

            console.log('Login successful for teacher:', teacher.email);

            // Return teacher data without password
            const { password: _, ...teacherData } = teacher;

            // Generate JWT
            const token = generateToken({
                id: teacher.id,
                email: teacher.email,
                role: 'teacher'
            });

            res.json({
                success: true,
                message: "Login successful",
                teacher: teacherData,
                token
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
// EMAIL TEST ENDPOINT - MILESTONE 9
// =============================
app.post("/api/test-email", validateRequest(Joi.object({
    email: Joi.string().email().required(),
    name: Joi.string().optional()
})), async (req, res) => {
    const { email, name } = req.body;

    try {
        const result = await EmailUtils.sendWelcomeEmail(email, name || "Student");

        if (result.success) {
            res.json({
                success: true,
                message: "Test email sent successfully",
                messageId: result.messageId
            });
        } else {
            res.status(500).json({
                success: false,
                error: "Failed to send test email",
                details: result.error
            });
        }
    } catch (error) {
        console.error("Error sending test email:", error);
        res.status(500).json({
            success: false,
            error: "Error sending test email",
            details: error.message
        });
    }
});

// =============================
// ERROR HANDLING MIDDLEWARE
// =============================

// Multer error handling
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: 'File too large. Maximum size is 5MB.' });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ success: false, error: 'Too many files. Maximum is 1 file.' });
        }
    }

    if (error.message && error.message.includes('Invalid file type')) {
        return res.status(400).json({ success: false, error: error.message });
    }

    console.error('Unhandled error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.originalUrl} not found`
    });
});

// =============================
// PROCESS EVENT HANDLERS FOR STABILITY
// =============================

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(error.name, error.message);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// =============================
// SERVER STARTUP WITH ERROR HANDLING
// =============================

const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 File uploads served from: /uploads/`);
    console.log(`💾 Upload directory: ${path.resolve(uploadsDir)}`);
    console.log(`📧 Email notifications: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
    console.log(`🔐 JWT configured: ${process.env.JWT_SECRET ? 'Yes' : 'Using default secret'}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Logs directory: ${path.resolve(logsDir)}`);
    console.log(`🔑 Password reset endpoints are now active!`);
});

// Handle server errors
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        console.log('💡 Try:');
        console.log('   - Using a different port');
        console.log('   - Killing the process using port', PORT);
        console.log('   - Waiting a few seconds and trying again');
    } else {
        console.error('Server error:', error);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
    server.close(() => {
        console.log('💥 Process terminated!');
    });
});

process.on('SIGINT', () => {
    console.log('👋 SIGINT RECEIVED. Shutting down gracefully');
    server.close(() => {
        console.log('💥 Process terminated!');
    });
});
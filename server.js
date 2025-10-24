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
const PORT = 3000;

// =============================
// ENHANCED FILE UPLOAD CONFIGURATION
// =============================

// Define uploads directory
const uploadsDir = './uploads';
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

// Database connection
const db = createConnection({
    host: "localhost",
    user: "root",   
    password: "",  
    database: "bucohub",
    port: 3306
});

db.connect(err => {
    if (err) {
        console.error("Database connection failed:", err.message);
        process.exit(1);
    }
    console.log("Connected to MySQL database (bucohub)");
});

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
// ROUTES
// =============================

// Default route
app.get("/", (req, res) => {
    res.json({ 
        message: "BUCODel API is running",
        endpoints: {
            studentRegistration: "/api/register",
            adminLogin: "/api/admins/login",
            studentLogin: "/api/students/login",
            fileUploads: "/uploads/"
        }
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

// STUDENT LOGIN ENDPOINT - MOVED OUTSIDE REGISTRATION ROUTE
app.post("/api/students/login", async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ 
            success: false,
            error: "Email and password are required" 
        });
    }

    const sql = "SELECT * FROM registrations WHERE email = ?";
    
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
            courses, motivation, profilePictureUrl, created_at, updated_at
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
    const allowedSortFields = ['id', 'firstName', 'lastName', 'email', 'age', 'created_at'];
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
            courses, motivation, profilePictureUrl, created_at, updated_at
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
            courses, motivation, created_at
        FROM registrations 
        ORDER BY created_at DESC
    `;
    
    db.query(sql, (err, result) => {
        if (err) {
            console.error('CSV export error:', err);
            return res.status(500).json({ error: "Database error" });
        }
        
        // Simple CSV generation
        const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Age', 'Education', 'Experience', 'Courses', 'Motivation', 'Registration Date'];
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
            courses, motivation, created_at
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
            const headers = ['ID', 'Name', 'Email', 'Phone', 'Courses'];
            let yPosition = doc.y;
            
            headers.forEach((header, i) => {
                doc.text(header, 50 + (i * 100), yPosition, { width: 90, align: 'left' });
            });
            
            doc.moveTo(50, yPosition + 15).lineTo(550, yPosition + 15).stroke();
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
                    `${student.firstName} ${student.lastName}`.substring(0, 15),
                    student.email.substring(0, 20),
                    student.phone || 'N/A',
                    courses.substring(0, 25)
                ];
                
                rowData.forEach((data, i) => {
                    doc.text(data, 50 + (i * 100), yPosition, { width: 90, align: 'left' });
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

// FIXED ADMIN LOGIN ENDPOINT
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

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 File uploads served from: /uploads/`);
    console.log(`💾 Upload directory: ${path.resolve(uploadsDir)}`);
});
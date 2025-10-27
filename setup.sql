-- Create database
CREATE DATABASE IF NOT EXISTS bucohub;
USE bucohub;

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
INSERT INTO admins (first_name, last_name, email, password, role) VALUES 
('System', 'Administrator', 'admin@bucohub.com', '$2a$10$8K1p/a0dRL1B0VZQY2Qz3uYQYQYQYQYQYQYQYQYQYQYQYQYQYQYQ', 'super_admin');

-- Insert sample courses
INSERT INTO courses (name, description, duration_weeks, price) VALUES 
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
CREATE INDEX idx_registrations_phone ON registrations(phone);
CREATE INDEX idx_registrations_active ON registrations(is_active);
CREATE INDEX idx_admins_active ON admins(is_active);
CREATE INDEX idx_student_courses_progress ON student_courses(progress_percentage);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);


-- Create view for student summary
CREATE VIEW student_summary AS
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

-- Create view for course enrollment statistics
CREATE VIEW course_enrollment_stats AS
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

-- Create stored procedure for student registration
DELIMITER //
CREATE PROCEDURE RegisterStudent(
    IN p_firstName VARCHAR(100),
    IN p_lastName VARCHAR(100),
    IN p_email VARCHAR(255),
    IN p_phone VARCHAR(20),
    IN p_password VARCHAR(255),
    IN p_age INT,
    IN p_education VARCHAR(255),
    IN p_experience TEXT,
    IN p_courses JSON,
    IN p_motivation TEXT,
    IN p_profilePictureUrl VARCHAR(500)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- Insert student
    INSERT INTO registrations (
        firstName, lastName, email, phone, password,
        age, education, experience, courses, motivation, profilePictureUrl
    ) VALUES (
        p_firstName, p_lastName, p_email, p_phone, p_password,
        p_age, p_education, p_experience, p_courses, p_motivation, p_profilePictureUrl
    );
    
    COMMIT;
END //
DELIMITER ;
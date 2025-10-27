-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Oct 26, 2025 at 11:38 AM
-- Server version: 8.4.3
-- PHP Version: 8.3.26

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `bucohub`
--

DELIMITER $$
--
-- Procedures
--
DROP PROCEDURE IF EXISTS `RegisterStudent`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `RegisterStudent` (IN `p_firstName` VARCHAR(100), IN `p_lastName` VARCHAR(100), IN `p_email` VARCHAR(255), IN `p_phone` VARCHAR(20), IN `p_password` VARCHAR(255), IN `p_age` INT, IN `p_education` VARCHAR(255), IN `p_experience` TEXT, IN `p_courses` JSON, IN `p_motivation` TEXT, IN `p_profilePictureUrl` VARCHAR(500))   BEGIN
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
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `admins`
--

DROP TABLE IF EXISTS `admins`;
CREATE TABLE IF NOT EXISTS `admins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('super_admin','admin','moderator') DEFAULT 'admin',
  `is_active` tinyint(1) DEFAULT '1',
  `last_login` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_admins_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `admins`
--

INSERT INTO `admins` (`id`, `first_name`, `last_name`, `email`, `password`, `role`, `is_active`, `last_login`, `created_at`, `updated_at`) VALUES
(1, 'System', 'Administrator', 'admin@bucohub.com', '$2a$10$8K1p/a0dRL1B0VZQY2Qz3uYQYQYQYQYQYQYQYQYQYQYQYQYQYQYQ', 'super_admin', 1, NULL, '2025-10-23 11:47:57', '2025-10-23 11:47:57'),
(2, 'SOLOMON', 'ADIELE', 'solomonadiele1@gmail.com', '$2a$10$ah7OludqWYY2nyYYsoXY5u1OhSBh7RkQBGjM40tnRrfv9fmzmFecS', 'admin', 1, NULL, '2025-10-23 12:57:39', '2025-10-23 12:57:39');

-- --------------------------------------------------------

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_id` int DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `table_name` varchar(100) DEFAULT NULL,
  `record_id` int DEFAULT NULL,
  `old_values` json DEFAULT NULL,
  `new_values` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin_date` (`admin_id`,`created_at`),
  KEY `idx_action` (`action`),
  KEY `idx_audit_log_created` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
CREATE TABLE IF NOT EXISTS `courses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `duration_weeks` int DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `courses`
--

INSERT INTO `courses` (`id`, `name`, `description`, `duration_weeks`, `price`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'UI/UX Design', 'Learn user interface and user experience design principles', 12, 299.99, 1, '2025-10-23 11:47:57', '2025-10-23 11:47:57'),
(2, 'Front-end Development', 'Master HTML, CSS, JavaScript and modern frameworks', 16, 399.99, 1, '2025-10-23 11:47:57', '2025-10-23 11:47:57'),
(3, 'Back-end Development', 'Learn server-side programming with Node.js and databases', 20, 449.99, 1, '2025-10-23 11:47:57', '2025-10-23 11:47:57'),
(4, 'Full Stack Development', 'Complete web development from front-end to back-end', 24, 599.99, 1, '2025-10-23 11:47:57', '2025-10-23 11:47:57'),
(5, 'Data Science', 'Data analysis, machine learning and visualization', 20, 499.99, 1, '2025-10-23 11:47:57', '2025-10-23 11:47:57'),
(6, 'Digital Marketing', 'SEO, social media marketing, and analytics', 12, 349.99, 1, '2025-10-23 11:47:57', '2025-10-23 11:47:57'),
(7, 'Mobile App Development', 'Build iOS and Android applications', 18, 449.99, 1, '2025-10-23 11:47:57', '2025-10-23 11:47:57'),
(8, 'Artificial Intelligence', 'Machine learning and AI fundamentals', 22, 549.99, 1, '2025-10-23 11:47:57', '2025-10-23 11:47:57'),
(9, 'Cybersecurity', 'Network security and ethical hacking', 16, 499.99, 1, '2025-10-23 11:47:57', '2025-10-23 11:47:57'),
(10, 'UI/UX Design', 'Learn user interface and user experience design principles', 12, 299.99, 1, '2025-10-24 13:32:38', '2025-10-24 13:32:38'),
(11, 'Front-end Development', 'Master HTML, CSS, JavaScript and modern frameworks', 16, 399.99, 1, '2025-10-24 13:32:38', '2025-10-24 13:32:38'),
(12, 'Back-end Development', 'Learn server-side programming with Node.js and databases', 20, 449.99, 1, '2025-10-24 13:32:38', '2025-10-24 13:32:38'),
(13, 'Full Stack Development', 'Complete web development from front-end to back-end', 24, 599.99, 1, '2025-10-24 13:32:38', '2025-10-24 13:32:38'),
(14, 'Data Science', 'Data analysis, machine learning and visualization', 20, 499.99, 1, '2025-10-24 13:32:38', '2025-10-24 13:32:38'),
(15, 'Digital Marketing', 'SEO, social media marketing, and analytics', 12, 349.99, 1, '2025-10-24 13:32:38', '2025-10-24 13:32:38'),
(16, 'Mobile App Development', 'Build iOS and Android applications', 18, 449.99, 1, '2025-10-24 13:32:38', '2025-10-24 13:32:38'),
(17, 'Artificial Intelligence', 'Machine learning and AI fundamentals', 22, 549.99, 1, '2025-10-24 13:32:38', '2025-10-24 13:32:38'),
(18, 'Cybersecurity', 'Network security and ethical hacking', 16, 499.99, 1, '2025-10-24 13:32:38', '2025-10-24 13:32:38'),
(19, 'UI/UX Design', 'Learn user interface and user experience design principles', 12, 299.99, 1, '2025-10-24 13:32:46', '2025-10-24 13:32:46'),
(20, 'Front-end Development', 'Master HTML, CSS, JavaScript and modern frameworks', 16, 399.99, 1, '2025-10-24 13:32:46', '2025-10-24 13:32:46'),
(21, 'Back-end Development', 'Learn server-side programming with Node.js and databases', 20, 449.99, 1, '2025-10-24 13:32:46', '2025-10-24 13:32:46'),
(22, 'Full Stack Development', 'Complete web development from front-end to back-end', 24, 599.99, 1, '2025-10-24 13:32:46', '2025-10-24 13:32:46'),
(23, 'Data Science', 'Data analysis, machine learning and visualization', 20, 499.99, 1, '2025-10-24 13:32:46', '2025-10-24 13:32:46'),
(24, 'Digital Marketing', 'SEO, social media marketing, and analytics', 12, 349.99, 1, '2025-10-24 13:32:46', '2025-10-24 13:32:46'),
(25, 'Mobile App Development', 'Build iOS and Android applications', 18, 449.99, 1, '2025-10-24 13:32:46', '2025-10-24 13:32:46'),
(26, 'Artificial Intelligence', 'Machine learning and AI fundamentals', 22, 549.99, 1, '2025-10-24 13:32:46', '2025-10-24 13:32:46'),
(27, 'Cybersecurity', 'Network security and ethical hacking', 16, 499.99, 1, '2025-10-24 13:32:46', '2025-10-24 13:32:46'),
(28, 'UI/UX Design', 'Learn user interface and user experience design principles', 12, 299.99, 1, '2025-10-24 13:47:12', '2025-10-24 13:47:12'),
(29, 'Front-end Development', 'Master HTML, CSS, JavaScript and modern frameworks', 16, 399.99, 1, '2025-10-24 13:47:12', '2025-10-24 13:47:12'),
(30, 'Back-end Development', 'Learn server-side programming with Node.js and databases', 20, 449.99, 1, '2025-10-24 13:47:12', '2025-10-24 13:47:12'),
(31, 'Full Stack Development', 'Complete web development from front-end to back-end', 24, 599.99, 1, '2025-10-24 13:47:12', '2025-10-24 13:47:12'),
(32, 'Data Science', 'Data analysis, machine learning and visualization', 20, 499.99, 1, '2025-10-24 13:47:12', '2025-10-24 13:47:12'),
(33, 'Digital Marketing', 'SEO, social media marketing, and analytics', 12, 349.99, 1, '2025-10-24 13:47:12', '2025-10-24 13:47:12'),
(34, 'Mobile App Development', 'Build iOS and Android applications', 18, 449.99, 1, '2025-10-24 13:47:12', '2025-10-24 13:47:12'),
(35, 'Artificial Intelligence', 'Machine learning and AI fundamentals', 22, 549.99, 1, '2025-10-24 13:47:12', '2025-10-24 13:47:12'),
(36, 'Cybersecurity', 'Network security and ethical hacking', 16, 499.99, 1, '2025-10-24 13:47:12', '2025-10-24 13:47:12'),
(37, 'UI/UX Design', 'Learn user interface and user experience design principles', 12, 299.99, 1, '2025-10-24 14:06:28', '2025-10-24 14:06:28'),
(38, 'Front-end Development', 'Master HTML, CSS, JavaScript and modern frameworks', 16, 399.99, 1, '2025-10-24 14:06:28', '2025-10-24 14:06:28'),
(39, 'Back-end Development', 'Learn server-side programming with Node.js and databases', 20, 449.99, 1, '2025-10-24 14:06:28', '2025-10-24 14:06:28'),
(40, 'Full Stack Development', 'Complete web development from front-end to back-end', 24, 599.99, 1, '2025-10-24 14:06:28', '2025-10-24 14:06:28'),
(41, 'Data Science', 'Data analysis, machine learning and visualization', 20, 499.99, 1, '2025-10-24 14:06:28', '2025-10-24 14:06:28'),
(42, 'Digital Marketing', 'SEO, social media marketing, and analytics', 12, 349.99, 1, '2025-10-24 14:06:28', '2025-10-24 14:06:28'),
(43, 'Mobile App Development', 'Build iOS and Android applications', 18, 449.99, 1, '2025-10-24 14:06:28', '2025-10-24 14:06:28'),
(44, 'Artificial Intelligence', 'Machine learning and AI fundamentals', 22, 549.99, 1, '2025-10-24 14:06:28', '2025-10-24 14:06:28'),
(45, 'Cybersecurity', 'Network security and ethical hacking', 16, 499.99, 1, '2025-10-24 14:06:28', '2025-10-24 14:06:28'),
(46, 'UI/UX Design', 'Learn user interface and user experience design principles', 12, 299.99, 1, '2025-10-24 14:35:44', '2025-10-24 14:35:44'),
(47, 'Front-end Development', 'Master HTML, CSS, JavaScript and modern frameworks', 16, 399.99, 1, '2025-10-24 14:35:44', '2025-10-24 14:35:44'),
(48, 'Back-end Development', 'Learn server-side programming with Node.js and databases', 20, 449.99, 1, '2025-10-24 14:35:44', '2025-10-24 14:35:44'),
(49, 'Full Stack Development', 'Complete web development from front-end to back-end', 24, 599.99, 1, '2025-10-24 14:35:44', '2025-10-24 14:35:44'),
(50, 'Data Science', 'Data analysis, machine learning and visualization', 20, 499.99, 1, '2025-10-24 14:35:44', '2025-10-24 14:35:44'),
(51, 'Digital Marketing', 'SEO, social media marketing, and analytics', 12, 349.99, 1, '2025-10-24 14:35:44', '2025-10-24 14:35:44'),
(52, 'Mobile App Development', 'Build iOS and Android applications', 18, 449.99, 1, '2025-10-24 14:35:44', '2025-10-24 14:35:44'),
(53, 'Artificial Intelligence', 'Machine learning and AI fundamentals', 22, 549.99, 1, '2025-10-24 14:35:44', '2025-10-24 14:35:44'),
(54, 'Cybersecurity', 'Network security and ethical hacking', 16, 499.99, 1, '2025-10-24 14:35:44', '2025-10-24 14:35:44'),
(55, 'UI/UX Design', 'Learn user interface and user experience design principles', 12, 299.99, 1, '2025-10-24 14:45:32', '2025-10-24 14:45:32'),
(56, 'Front-end Development', 'Master HTML, CSS, JavaScript and modern frameworks', 16, 399.99, 1, '2025-10-24 14:45:32', '2025-10-24 14:45:32'),
(57, 'Back-end Development', 'Learn server-side programming with Node.js and databases', 20, 449.99, 1, '2025-10-24 14:45:32', '2025-10-24 14:45:32'),
(58, 'Full Stack Development', 'Complete web development from front-end to back-end', 24, 599.99, 1, '2025-10-24 14:45:32', '2025-10-24 14:45:32'),
(59, 'Data Science', 'Data analysis, machine learning and visualization', 20, 499.99, 1, '2025-10-24 14:45:32', '2025-10-24 14:45:32'),
(60, 'Digital Marketing', 'SEO, social media marketing, and analytics', 12, 349.99, 1, '2025-10-24 14:45:32', '2025-10-24 14:45:32'),
(61, 'Mobile App Development', 'Build iOS and Android applications', 18, 449.99, 1, '2025-10-24 14:45:32', '2025-10-24 14:45:32'),
(62, 'Artificial Intelligence', 'Machine learning and AI fundamentals', 22, 549.99, 1, '2025-10-24 14:45:32', '2025-10-24 14:45:32'),
(63, 'Cybersecurity', 'Network security and ethical hacking', 16, 499.99, 1, '2025-10-24 14:45:32', '2025-10-24 14:45:32');

-- --------------------------------------------------------

--
-- Stand-in structure for view `course_enrollment_stats`
-- (See below for the actual view)
--
DROP VIEW IF EXISTS `course_enrollment_stats`;
CREATE TABLE IF NOT EXISTS `course_enrollment_stats` (
`id` int
,`name` varchar(255)
,`duration_weeks` int
,`total_enrollments` bigint
,`avg_progress` decimal(14,4)
,`completed_count` decimal(23,0)
);

-- --------------------------------------------------------

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_token` (`email`,`token`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `registrations`
--

DROP TABLE IF EXISTS `registrations`;
CREATE TABLE IF NOT EXISTS `registrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `firstName` varchar(100) NOT NULL,
  `lastName` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `age` int DEFAULT NULL,
  `education` varchar(255) DEFAULT NULL,
  `experience` text,
  `courses` json DEFAULT NULL,
  `motivation` text,
  `profilePictureUrl` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `email_verified` tinyint(1) DEFAULT '0',
  `last_login` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_email` (`email`),
  KEY `idx_name` (`firstName`,`lastName`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_registrations_phone` (`phone`),
  KEY `idx_registrations_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `registrations`
--

INSERT INTO `registrations` (`id`, `firstName`, `lastName`, `email`, `phone`, `password`, `age`, `education`, `experience`, `courses`, `motivation`, `profilePictureUrl`, `is_active`, `email_verified`, `last_login`, `created_at`, `updated_at`) VALUES
(1, 'ADIELE', 'SOLOMON', 'chimereucheyaadiele1@gmail.com', '08069383370', '$2a$10$MvPcwZO1nI9SLNOo4xMPEepL6RdfJ5.6hntVjMbY792iNJZiPCzy6', 28, 'Bachelor\'s Degree', 'HR Management System, Teacher, Full-stack Developer', '[\"Web Development\", \"Mobile App Development\", \"Data Science\"]', 'to be productive in life.', '/uploads/profile-1U4A1885-JPG-1761224625127-528835114.jpg', 1, 0, NULL, '2025-10-23 13:03:45', '2025-10-23 13:03:45'),
(2, 'SOLOMON', 'ADIELE', 'solomonadiele1@gmail.com', '08069383370', '$2a$10$LtiYcnMkYazV9mNQ.SW9Y.raKwjfOyVogDRLVrl/ZtdIeMFrkB61y', 26, 'Bachelor\'s Degree', 'HR Management System, Teacher, Full-stack Developer', '[\"Web Development\", \"Mobile App Development\"]', 'To acquire more knowledge', '/uploads/profile-1U4A1781-JPG-1761226177590-882381210.jpg', 1, 0, NULL, '2025-10-23 13:29:37', '2025-10-23 13:29:37'),
(3, 'OGECHI', 'CHRISTOPHER', 'ogechichrist33@gmail.com', '090988736363', '$2a$10$Mr57Xu./d65Gc86ssnWA2uOwoLwahi8dG1WpFGboRL8Rp0A7fi2B6', 38, 'SSCE', 'Computer operator', '[\"Mobile App Development\", \"UI/UX Design\"]', 'to improve in technology', NULL, 1, 0, NULL, '2025-10-23 13:32:08', '2025-10-23 15:58:30'),
(4, 'TIMOTTHY', 'WISDOM', 'timotthywisdom44@gmail.com', '08083737373', '$2a$10$qs8xwlIzq0iutdzblMw5.ODVr/DHgaMG/kYnl5tZYbPmUG3kxAK2m', 32, 'Bachelor\'s Degree', 'Preacher', '[\"UI/UX Design\", \"Web Development\"]', 'sasaj', '/uploads/profile-1U4A1754-JPG-1761241169959-652150601.jpg', 1, 0, NULL, '2025-10-23 17:39:30', '2025-10-23 17:39:30'),
(5, 'ADIELEE', 'SOLOMON', 'cchimereucheyaadiele1@gmail.com', '08069383370', '$2a$10$F5n.sQetXRPBYDbAv.Urf.oKehyxhrmWUnvflU8GzSYLdJpJqZ4tm', 26, 'Bachelor\'s Degree', 'HR Management System, Teacher, Full-stack Developer', '[\"Web Development\"]', 'sdmmdls;l', '/uploads/profile-1U4A1754-JPG-1761244878097-132342625.jpg', 1, 0, NULL, '2025-10-23 18:41:18', '2025-10-23 18:41:18');

-- --------------------------------------------------------

--
-- Table structure for table `student_courses`
--

DROP TABLE IF EXISTS `student_courses`;
CREATE TABLE IF NOT EXISTS `student_courses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `course_id` int NOT NULL,
  `enrollment_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `progress_percentage` int DEFAULT '0',
  `status` enum('enrolled','in_progress','completed','dropped') DEFAULT 'enrolled',
  `completed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_student_course` (`student_id`,`course_id`),
  KEY `idx_student_status` (`student_id`,`status`),
  KEY `idx_course_status` (`course_id`,`status`),
  KEY `idx_student_courses_progress` (`progress_percentage`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Stand-in structure for view `student_summary`
-- (See below for the actual view)
--
DROP VIEW IF EXISTS `student_summary`;
CREATE TABLE IF NOT EXISTS `student_summary` (
`id` int
,`full_name` varchar(201)
,`email` varchar(255)
,`phone` varchar(20)
,`age` int
,`education` varchar(255)
,`enrolled_courses` bigint
,`avg_progress` decimal(14,4)
,`created_at` timestamp
);

-- --------------------------------------------------------

--
-- Structure for view `course_enrollment_stats`
--
DROP TABLE IF EXISTS `course_enrollment_stats`;

DROP VIEW IF EXISTS `course_enrollment_stats`;
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `course_enrollment_stats`  AS SELECT `c`.`id` AS `id`, `c`.`name` AS `name`, `c`.`duration_weeks` AS `duration_weeks`, count(`sc`.`id`) AS `total_enrollments`, avg(`sc`.`progress_percentage`) AS `avg_progress`, sum((case when (`sc`.`status` = 'completed') then 1 else 0 end)) AS `completed_count` FROM (`courses` `c` left join `student_courses` `sc` on((`c`.`id` = `sc`.`course_id`))) WHERE (`c`.`is_active` = true) GROUP BY `c`.`id` ;

-- --------------------------------------------------------

--
-- Structure for view `student_summary`
--
DROP TABLE IF EXISTS `student_summary`;

DROP VIEW IF EXISTS `student_summary`;
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `student_summary`  AS SELECT `r`.`id` AS `id`, concat(`r`.`firstName`,' ',`r`.`lastName`) AS `full_name`, `r`.`email` AS `email`, `r`.`phone` AS `phone`, `r`.`age` AS `age`, `r`.`education` AS `education`, count(`sc`.`id`) AS `enrolled_courses`, avg(`sc`.`progress_percentage`) AS `avg_progress`, `r`.`created_at` AS `created_at` FROM (`registrations` `r` left join `student_courses` `sc` on(((`r`.`id` = `sc`.`student_id`) and (`sc`.`status` <> 'dropped')))) WHERE (`r`.`is_active` = true) GROUP BY `r`.`id` ;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `student_courses`
--
ALTER TABLE `student_courses`
  ADD CONSTRAINT `student_courses_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `registrations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `student_courses_ibfk_2` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

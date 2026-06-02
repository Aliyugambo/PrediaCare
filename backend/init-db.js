const mysql = require('mysql2/promise');
require('dotenv').config();

async function initializeDatabase() {
  try {
    // Connect to MySQL without specifying database
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      user: process.env.MYSQL_USER || 'carenix_user',
      password: process.env.MYSQL_PASSWORD || 'StrongPassword123!',
      database: process.env.MYSQL_DATABASE || 'carenix_clinic',
      port: process.env.MYSQL_PORT || 3306,
      multipleStatements: true
    });

    console.log('Connected to MySQL');

    // Create database
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${process.env.MYSQL_DATABASE || 'carenix_clinic'}\``
    );
    console.log('Database created or already exists');

    // Select database
    // await connection.execute(`USE ${process.env.MYSQL_DATABASE || 'carenix_clinic'}`);

    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('patient', 'doctor', 'staff', 'admin', 'customer_care', 'diagnostic', 'pharmacist') NOT NULL DEFAULT 'patient',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Users table created or already exists');
    
    // Ensure admin role exists in ENUM (for older installations)
    try {
      await connection.execute(`ALTER TABLE users MODIFY COLUMN role ENUM('patient', 'doctor', 'staff', 'admin', 'customer_care', 'diagnostic', 'pharmacist') NOT NULL DEFAULT 'patient'`);
      console.log('Updated users table to include admin role');
    } catch (e) {
      // Column might already have the correct type
    }
    
    // Ensure is_active column exists (for older installations)
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM users LIKE 'is_active'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER role");
        console.log('Added is_active column to users table');
      }
    } catch (e) {
      // Column might already exist
    }
    
    // Ensure phone column exists (for older installations)
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM users LIKE 'phone'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE users ADD COLUMN phone VARCHAR(20) AFTER email");
        console.log('Added phone column to users table');
      }
    } catch (e) {
      // Column might already exist
    }

    // Ensure address column exists (for older installations)
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM users LIKE 'address'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE users ADD COLUMN address TEXT AFTER phone");
        console.log('Added address column to users table');
      }
    } catch (e) {
      // Column might already exist
    }

    // Create sessions table for express-session
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(128) COLLATE utf8mb4_bin PRIMARY KEY,
        expires INT UNSIGNED NOT NULL,
        data MEDIUMTEXT COLLATE utf8mb4_bin,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Sessions table created or already exists');

    // Create doctors table (doctor profiles)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS doctors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        specialization VARCHAR(255) NOT NULL,
        qualification VARCHAR(255),
        experience_years INT DEFAULT 0,
        consultation_fee DECIMAL(10, 2) DEFAULT 0.00,
        available_days VARCHAR(100) DEFAULT 'Mon,Tue,Wed,Thu,Fri',
        available_time_start TIME DEFAULT '07:00:00',
        available_time_end TIME DEFAULT '22:00:00',
        bio TEXT,
        profile_image VARCHAR(255),
        location VARCHAR(255) DEFAULT 'Main Clinic',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Doctors table created or already exists');
    // ensure existing installations have the location column (compatible with older MySQL)
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM doctors LIKE 'location'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE doctors ADD COLUMN location VARCHAR(255) DEFAULT 'Main Clinic'");
      }
    } catch (e) {
      // ignore - best effort compatibility
    }
    console.log('Ensured doctors.location column exists');

    // Create appointments table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        status ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show') DEFAULT 'scheduled',
        reason VARCHAR(500),
        notes TEXT,
        location VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
      )
    `);
    console.log('Appointments table created or already exists');
    // ensure older DBs have location column (compatible with older MySQL)
    try {
      const [colsAppt] = await connection.execute("SHOW COLUMNS FROM appointments LIKE 'location'");
      if (!colsAppt || colsAppt.length === 0) {
        await connection.execute("ALTER TABLE appointments ADD COLUMN location VARCHAR(255) DEFAULT NULL");
      }
    } catch (e) {
      // ignore - best effort compatibility
    }
    console.log('Ensured appointments.location column exists');

    // ensure appointments has duration column
    try {
      const [colsDuration] = await connection.execute("SHOW COLUMNS FROM appointments LIKE 'duration'");
      if (!colsDuration || colsDuration.length === 0) {
        await connection.execute("ALTER TABLE appointments ADD COLUMN duration INT DEFAULT 30");
      }
    } catch (e) {
      // ignore - best effort compatibility
    }
    console.log('Ensured appointments.duration column exists');

    // Create messages table (patient-doctor messaging)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        subject VARCHAR(255),
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        appointment_id INT DEFAULT NULL,
        category VARCHAR(50) DEFAULT 'General',
        parent_message_id INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
        FOREIGN KEY (parent_message_id) REFERENCES messages(id) ON DELETE SET NULL
      )
    `);
    console.log('Messages table created or already exists');

    // Add appointment_id and category columns if they don't exist
    try {
      await connection.execute(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS appointment_id INT DEFAULT NULL`);
      await connection.execute(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'General'`);
      await connection.execute(`ALTER TABLE messages ADD CONSTRAINT fk_messages_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL`);
    } catch (e) {
      // Column might already exist or foreign key constraint might already exist
    }

    // Create results table (test results)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        appointment_id INT DEFAULT NULL,
        test_name VARCHAR(255) NOT NULL,
        test_type VARCHAR(100),
        result_data TEXT,
        report_file VARCHAR(255),
        status ENUM('pending', 'completed', 'reviewed') DEFAULT 'completed',
        notes TEXT,
        result_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
      )
    `);
    console.log('Results table created or already exists');

    // Ensure results table has file_name column (for older installations)
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM results LIKE 'file_name'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE results ADD COLUMN file_name VARCHAR(255) AFTER report_file");
        console.log('Added file_name column to results table');
      }
    } catch (e) {
      // Column might already exist
    }

    // Create medications table (prescriptions)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS medications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        appointment_id INT DEFAULT NULL,
        medication_name VARCHAR(255) NOT NULL,
        dosage VARCHAR(100) NOT NULL,
        frequency VARCHAR(100) NOT NULL,
        duration VARCHAR(100),
        instructions TEXT,
        refills_remaining INT DEFAULT 0,
        status ENUM('active', 'completed', 'stopped') DEFAULT 'active',
        prescribed_date DATE NOT NULL,
        expiry_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
      )
    `);
    console.log('Medications table created or already exists');

    // Create health_summaries table (patient health records)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS health_summaries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        appointment_id INT DEFAULT NULL,
        summary_type ENUM('checkup', 'diagnosis', 'treatment_plan', 'follow_up', 'general') NOT NULL,
        chief_complaint TEXT,
        vital_signs TEXT,
        diagnosis TEXT,
        treatment_plan TEXT,
        recommendations TEXT,
        next_visit_date DATE,
        attachments VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
      )
    `);
    console.log('Health summaries table created or already exists');

    // Create examinations table (doctor's examination records during consultation)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS examinations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        appointment_id INT,
        examination_date DATE NOT NULL,
        vital_signs JSON,
        chief_complaint TEXT,
        examination_notes TEXT,
        findings TEXT,
        diagnosis TEXT,
        treatment_plan TEXT,
        status ENUM('pending', 'completed', 'reviewed') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
      )
    `);
    console.log('Examinations table created or already exists');

    // Create admissions table (patient admitted after examination)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        examination_id INT,
        doctor_id INT NOT NULL,
        room_number VARCHAR(50),
        bed_number VARCHAR(50),
        admission_type ENUM('emergency', 'scheduled', 'transfer') DEFAULT 'scheduled',
        reason_for_admission TEXT,
        admitting_diagnosis TEXT,
        status ENUM('admitted', 'discharged', 'transferred') DEFAULT 'admitted',
        admission_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        discharge_date DATETIME NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE SET NULL,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
      )
    `);
    console.log('Admissions table created or already exists');

    // Create round_checks table (doctor continuous round-check notes)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS round_checks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        admission_id INT,
        examination_id INT,
        checked_by INT NOT NULL,
        check_type ENUM('doctor', 'nurse', 'consultant') DEFAULT 'doctor',
        notes TEXT,
        vital_signs JSON,
        follow_up_notes JSON,
        next_plan TEXT,
        status ENUM('ongoing', 'resolved', 'escalated') DEFAULT 'ongoing',
        check_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE SET NULL,
        FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE SET NULL,
        FOREIGN KEY (checked_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Round checks table created or already exists');

    // Ensure follow_up_notes column exists on older installs
    try {
      const [colsF] = await connection.execute("SHOW COLUMNS FROM round_checks LIKE 'follow_up_notes'");
      if (!colsF || colsF.length === 0) {
        await connection.execute("ALTER TABLE round_checks ADD COLUMN follow_up_notes JSON DEFAULT NULL AFTER vital_signs");
        console.log('Added follow_up_notes column to round_checks');
      }
    } catch (e) {
      console.log('follow_up_notes column check:', e.message);
    }

    // Ensure sessions table exists for express-mysql-session
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS sessions (
          session_id VARCHAR(128) PRIMARY KEY,
          expires DATETIME NOT NULL,
          data TEXT
        )
      `);
      console.log('Sessions table created or already exists');
    } catch (e) {
      console.log('Sessions table setup:', e.message);
    }

    // Create reports table (doctor-uploaded medical reports/documents)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        appointment_id INT,
        report_type VARCHAR(100) NOT NULL,
        report_title VARCHAR(255) NOT NULL,
        report_description TEXT,
        file_path VARCHAR(255),
        file_name VARCHAR(255),
        file_type VARCHAR(50),
        file_size INT,
        is_test_referral BOOLEAN DEFAULT false,
        test_referred_to VARCHAR(100),
        urgency ENUM('routine', 'urgent', 'stat') DEFAULT 'routine',
        visibility ENUM('patient', 'staff', 'admin', 'all') DEFAULT 'all',
        status ENUM('draft', 'submitted', 'reviewed', 'acted_upon') DEFAULT 'submitted',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
      )
    `);
    console.log('Reports table created or already exists');

    // Create test_referrals table (track test orders from doctors)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS test_referrals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        appointment_id INT,
        report_id INT,
        test_name VARCHAR(255) NOT NULL,
        test_type VARCHAR(100),
        reason_for_test TEXT,
        urgency ENUM('routine', 'urgent', 'stat') DEFAULT 'routine',
        status ENUM('pending', 'scheduled', 'in_progress', 'completed', 'reviewed') DEFAULT 'pending',
        assigned_to_staff_id INT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_to_staff_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Test referrals table created or already exists');

    // Create pharmacy_medicines table (pharmacy inventory)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pharmacy_medicines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        medicine_name VARCHAR(255) NOT NULL,
        generic_name VARCHAR(255),
        category VARCHAR(100) NOT NULL,
        dosage_form VARCHAR(100),
        strength VARCHAR(100),
        unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        stock_quantity INT NOT NULL DEFAULT 0,
        reorder_level INT DEFAULT 10,
        supplier VARCHAR(255),
        batch_number VARCHAR(100),
        manufacturing_date DATE,
        expiry_date DATE,
        description TEXT,
        side_effects TEXT,
        storage_conditions VARCHAR(255),
        status ENUM('active', 'inactive', 'discontinued') DEFAULT 'active',
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Pharmacy medicines table created or already exists');

    // Ensure pharmacy_medicines has status column
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM pharmacy_medicines LIKE 'status'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE pharmacy_medicines ADD COLUMN status ENUM('active', 'inactive', 'discontinued') DEFAULT 'active'");
      }
    } catch (e) {
      console.log('Error checking status column:', e.message);
    }

    // Create pharmacy_sales table (medicine dispensing records)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pharmacy_sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        medicine_id INT NOT NULL,
        patient_id INT,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(20),
        quantity INT NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        total_price DECIMAL(10, 2) NOT NULL,
        sold_by INT,
        notes TEXT,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (medicine_id) REFERENCES pharmacy_medicines(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (sold_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Pharmacy sales table created or already exists');

    // Ensure pharmacy_sales has customer_name and customer_phone columns
    try {
      const [cols1] = await connection.execute("SHOW COLUMNS FROM pharmacy_sales LIKE 'customer_name'");
      if (!cols1 || cols1.length === 0) {
        await connection.execute("ALTER TABLE pharmacy_sales ADD COLUMN customer_name VARCHAR(255) AFTER patient_id");
      }
    } catch (e) {}
    try {
      const [cols2] = await connection.execute("SHOW COLUMNS FROM pharmacy_sales LIKE 'customer_phone'");
      if (!cols2 || cols2.length === 0) {
        await connection.execute("ALTER TABLE pharmacy_sales ADD COLUMN customer_phone VARCHAR(20) AFTER customer_name");
      }
    } catch (e) {}

    // Walk-in patients table (registered by customer care staff)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS walkin_patients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        date_of_birth DATE,
        gender ENUM('male', 'female', 'other'),
        phone VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        test_type VARCHAR(100),
        test_name VARCHAR(255),
        referred_by_doctor BOOLEAN DEFAULT false,
        doctor_id INT,
        test_referral_id INT,
        status ENUM('registered', 'sample_collected', 'testing', 'completed', 'cancelled') DEFAULT 'registered',
        registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_date TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL,
        FOREIGN KEY (test_referral_id) REFERENCES test_referrals(id) ON DELETE SET NULL
      )
    `);
    console.log('Walk-in patients table created or already exists');

    // Create billing_services table (services that can be billed)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS billing_services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        service_name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Billing services table created or already exists');

    // Create billing_invoices table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS billing_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(50) NOT NULL UNIQUE,
        patient_id INT NOT NULL,
        invoice_date DATE NOT NULL,
        due_date DATE NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        tax_amount DECIMAL(10, 2) DEFAULT 0.00,
        total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        amount_paid DECIMAL(10, 2) DEFAULT 0.00,
        status ENUM('pending', 'paid', 'overdue', 'cancelled', 'partially_paid') DEFAULT 'pending',
        payment_method VARCHAR(50),
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Billing invoices table created or already exists');

    // Ensure doctor_id column exists in billing_invoices
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM billing_invoices LIKE 'doctor_id'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE billing_invoices ADD COLUMN doctor_id INT DEFAULT NULL AFTER patient_id");
        await connection.execute("ALTER TABLE billing_invoices ADD CONSTRAINT fk_billing_invoices_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL");
        console.log('Added doctor_id column to billing_invoices table');
      }
    } catch (e) {
      // Column might already exist
    }

    // Create billing_invoice_items table (line items)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS billing_invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        service_id INT,
        service_name VARCHAR(255) NOT NULL,
        description TEXT,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL,
        total_price DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES billing_services(id) ON DELETE SET NULL
      )
    `);
    console.log('Billing invoice items table created or already exists');

    // Create billing_payments table (payment history)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS billing_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50),
        transaction_reference VARCHAR(100),
        notes TEXT,
        received_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Billing payments table created or already exists');

// SEED REAL HOSPITAL SERVICES (NGN)
// Truncate related tables first (FK safe order)
await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
await connection.execute('TRUNCATE TABLE billing_invoice_items');
await connection.execute('TRUNCATE TABLE billing_invoices');
await connection.execute('TRUNCATE TABLE billing_payments');
await connection.execute('TRUNCATE TABLE billing_services');
await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

// Load fs/path requires at top for seeding (FIX: Hoist requires before use)
const fs = require('fs');
const path = require('path');
const seedSqlPath = path.join(__dirname, 'seeds', 'billing-services.sql');

if (fs.existsSync(seedSqlPath)) {
  const seedSql = fs.readFileSync(seedSqlPath, 'utf8');
  await connection.query(seedSql);
  console.log('✅ Hospital billing services seeded (NGN - ~80 services: Beds, Theater, Labs, etc.)');
  
  // Verify
  const [count] = await connection.execute('SELECT COUNT(*) as count FROM billing_services');
  console.log(`📊 Total services: ${count[0].count}`);
} else {
  console.warn(`⚠️  Seed file not found at ${seedSqlPath}`);
  console.warn(`Run manually: mysql ${process.env.MYSQL_DATABASE || 'defaultdb'} -h ${process.env.MYSQL_HOST || 'localhost'} -P ${process.env.MYSQL_PORT || 3306} -u ${process.env.MYSQL_USER || 'avnadmin'} -p < ${seedSqlPath}`);
}

    // Create sample users and data (optional - for testing)
    const [userCount] = await connection.execute('SELECT COUNT(*) as count FROM users');
    if (userCount[0].count === 0) {
      const bcrypt = require('bcryptjs');
      
      // Hash sample passwords
      const patientPassword = await bcrypt.hash('patient123', 10);
      const doctorPassword = await bcrypt.hash('doctor123', 10);
      const staffPassword = await bcrypt.hash('staff123', 10);
      const adminPassword = await bcrypt.hash('admin123', 10);

      // Insert sample users
      const [patientResult] = await connection.execute(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['John Patient', 'patient@example.com', patientPassword, 'patient']
      );
      console.log('Sample patient created (patient@example.com / patient123)');
      
      // Create an admin account for initial setup
      try {
        await connection.execute(
          'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
          ['System Admin', 'admin@example.com', adminPassword, 'admin']
        );
        console.log('Sample admin created (admin@example.com / admin123)');
      } catch (adminErr) {
        console.error('Error creating admin:', adminErr.message);
      }
      
      const patientId = patientResult.insertId;

      const [doctorResult] = await connection.execute(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['Dr. Sarah Doctor', 'doctor@example.com', doctorPassword, 'doctor']
      );
      const doctorUserId = doctorResult.insertId;
      console.log('Sample doctor user created (doctor@example.com / doctor123)');

      // Create doctor profile
      await connection.execute(
        'INSERT INTO doctors (user_id, specialization, qualification, experience_years, consultation_fee, bio) VALUES (?, ?, ?, ?, ?, ?)',
        [doctorUserId, 'General Medicine', 'MD, MBBS', 10, 150.00, 'Experienced general physician with over 10 years of practice in family medicine and preventive healthcare.']
      );
      console.log('Doctor profile created');

      await connection.execute(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['Dr. Michael Chen', 'dr.chen@example.com', doctorPassword, 'doctor']
      );
      const drChenResult = await connection.execute(
        'SELECT id FROM users WHERE email = ?',
        ['dr.chen@example.com']
      );
      const drChenUserId = drChenResult[0][0].id;
      await connection.execute(
        'INSERT INTO doctors (user_id, specialization, qualification, experience_years, consultation_fee, bio) VALUES (?, ?, ?, ?, ?, ?)',
        [drChenUserId, 'Cardiology', 'MD, DM Cardiology', 15, 250.00, 'Specialist in cardiovascular diseases with expertise in interventional cardiology.']
      );
      console.log('Dr. Michael Chen profile created');

      await connection.execute(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['Dr. Emily Brown', 'dr.brown@example.com', doctorPassword, 'doctor']
      );
      const drBrownResult = await connection.execute(
        'SELECT id FROM users WHERE email = ?',
        ['dr.brown@example.com']
      );
      const drBrownUserId = drBrownResult[0][0].id;
      await connection.execute(
        'INSERT INTO doctors (user_id, specialization, qualification, experience_years, consultation_fee, bio) VALUES (?, ?, ?, ?, ?, ?)',
        [drBrownUserId, 'Dermatology', 'MD, DDVL', 8, 200.00, 'Skin care specialist with focus on cosmetic dermatology and skin diseases treatment.']
      );
      console.log('Dr. Emily Brown profile created');

      await connection.execute(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['Admin Staff', 'staff@example.com', staffPassword, 'staff']
      );
      console.log('Sample staff created (staff@example.com / staff123)');

      // Add sample appointments
      const [doctors] = await connection.execute('SELECT id FROM doctors');
      if (doctors.length > 0) {
        await connection.execute(
          'INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status, reason) VALUES (?, ?, ?, ?, ?, ?)',
          [patientId, doctors[0].id, '2024-12-20', '10:00:00', 'scheduled', 'Regular health checkup']
        );
        await connection.execute(
          'INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status, reason) VALUES (?, ?, ?, ?, ?, ?)',
          [patientId, doctors[1].id, '2024-12-22', '14:00:00', 'confirmed', 'Heart health consultation']
        );
        console.log('Sample appointments created');
      }

      // Add sample messages - patient to doctor (for doctor inbox)
      await connection.execute(
        'INSERT INTO messages (sender_id, receiver_id, subject, message, is_read, category) VALUES (?, ?, ?, ?, ?, ?)',
        [patientId, doctorUserId, 'Follow-up Question', 'Hi Doctor, I wanted to ask about my medication dosage. Should I take it before or after meals?', false, 'General']
      );
      // Also add a sample message from doctor to patient (for patient inbox)
      await connection.execute(
        'INSERT INTO messages (sender_id, receiver_id, subject, message, is_read) VALUES (?, ?, ?, ?, ?)',
        [doctorUserId, patientId, 'Appointment Reminder', 'This is a reminder for your upcoming appointment tomorrow at 10:00 AM.', TRUE]
      );
      console.log('Sample messages created');

      // Add sample results
      if (doctors.length > 0) {
        await connection.execute(
          'INSERT INTO results (patient_id, doctor_id, test_name, test_type, result_data, status, result_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [patientId, doctors[0].id, 'Complete Blood Count (CBC)', 'Blood Test', 'Hemoglobin: 14.5 g/dL, WBC: 8000/µL, Platelets: 250000/µL', 'completed', '2024-12-15']
        );
        await connection.execute(
          'INSERT INTO results (patient_id, doctor_id, test_name, test_type, result_data, status, result_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [patientId, doctors[1].id, 'Lipid Profile', 'Blood Test', 'Total Cholesterol: 180 mg/dL, LDL: 100 mg/dL, HDL: 55 mg/dL', 'completed', '2024-12-10']
        );
        console.log('Sample results created');
      }

      // Add sample medications
      if (doctors.length > 0) {
        await connection.execute(
          'INSERT INTO medications (patient_id, doctor_id, medication_name, dosage, frequency, duration, instructions, status, prescribed_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [patientId, doctors[0].id, 'Aspirin 100mg', '1 tablet', 'Once daily', '30 days', 'Take after breakfast with water', 'active', '2024-12-15']
        );
        await connection.execute(
          'INSERT INTO medications (patient_id, doctor_id, medication_name, dosage, frequency, duration, instructions, status, prescribed_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [patientId, doctors[1].id, 'Atorvastatin 20mg', '1 tablet', 'Once at bedtime', '90 days', 'Take at night, avoid grapefruit', 'active', '2024-12-10']
        );
        console.log('Sample medications created');
      }

      // Add sample health summary
      if (doctors.length > 0) {
        await connection.execute(
          'INSERT INTO health_summaries (patient_id, doctor_id, summary_type, chief_complaint, vital_signs, diagnosis, recommendations, next_visit_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [patientId, doctors[0].id, 'checkup', 'Routine annual checkup', 'BP: 120/80 mmHg, Pulse: 72 bpm, Temp: 98.6°F', 'Generally healthy, all vital signs normal', 'Continue current diet and exercise routine. Return for next checkup in 1 year.', '2025-12-15']
        );
        console.log('Sample health summary created');
      }
    }

    await connection.end();
    console.log('\nDatabase initialization completed successfully!');
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  }
}

initializeDatabase();


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
        role ENUM('patient', 'doctor', 'staff', 'admin', 'customer_care', 'diagnostic', 'pharmacist', 'nurse', 'bloodbank') NOT NULL DEFAULT 'patient',
        is_active BOOLEAN DEFAULT TRUE,
        patient_status ENUM('active', 'admitted', 'discharged', 'outpost') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Users table created or already exists');
    
    // Ensure admin role exists in ENUM (for older installations)
    try {
      await connection.execute(`ALTER TABLE users MODIFY COLUMN role ENUM('patient', 'doctor', 'staff', 'admin', 'customer_care', 'diagnostic', 'pharmacist', 'nurse', 'bloodbank') NOT NULL DEFAULT 'patient'`);
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
    
    // Ensure patient_status column exists (for older installations)
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM users LIKE 'patient_status'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE users ADD COLUMN patient_status ENUM('active', 'admitted', 'discharged', 'outpost') DEFAULT 'active' AFTER is_active");
        console.log('Added patient_status column to users table');
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

    // Ensure appointments has vitals_data column (for staff-recorded vitals before doctor examination)
    try {
      const [colsVitals] = await connection.execute("SHOW COLUMNS FROM appointments LIKE 'vitals_data'");
      if (!colsVitals || colsVitals.length === 0) {
        await connection.execute("ALTER TABLE appointments ADD COLUMN vitals_data JSON DEFAULT NULL AFTER notes");
      }
    } catch (e) {
      // Column might already exist
    }
    console.log('Ensured appointments.vitals_data column exists');

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
         unit_price DECIMAL(10,2) DEFAULT 0.00,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
         FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
       )
     `);
     console.log('Medications table created or already exists');

     // Ensure medications has unit_price column
     try {
       const [cols] = await connection.execute("SHOW COLUMNS FROM medications LIKE 'unit_price'");
       if (!cols || cols.length === 0) {
         await connection.execute("ALTER TABLE medications ADD COLUMN unit_price DECIMAL(10,2) DEFAULT 0.00 AFTER expiry_date");
         console.log('Added unit_price column to medications table');
       }
     } catch (e) {
       console.log('Error checking unit_price column:', e.message);
     }

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
        discharge_data JSON DEFAULT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE SET NULL,
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
      )
    `);
    console.log('Admissions table created or already exists');

    // Ensure discharge_data column exists on older installs
    try {
      const [colsD] = await connection.execute("SHOW COLUMNS FROM admissions LIKE 'discharge_data'");
      if (!colsD || colsD.length === 0) {
        await connection.execute("ALTER TABLE admissions ADD COLUMN discharge_data JSON DEFAULT NULL AFTER discharge_date");
        console.log('Added discharge_data column to admissions table');
      }
    } catch (e) {
      console.log('discharge_data column check:', e.message);
    }

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
        fluid_balance JSON,
        drug_chat JSON,
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

    // Ensure fluid_balance column exists on older installs
    try {
      const [colsFB] = await connection.execute("SHOW COLUMNS FROM round_checks LIKE 'fluid_balance'");
      if (!colsFB || colsFB.length === 0) {
        await connection.execute("ALTER TABLE round_checks ADD COLUMN fluid_balance JSON DEFAULT NULL AFTER vital_signs");
        console.log('Added fluid_balance column to round_checks');
      }
    } catch (e) {
      console.log('fluid_balance column check:', e.message);
    }

    // Ensure drug_chat column exists on older installs
    try {
      const [colsDC] = await connection.execute("SHOW COLUMNS FROM round_checks LIKE 'drug_chat'");
      if (!colsDC || colsDC.length === 0) {
        await connection.execute("ALTER TABLE round_checks ADD COLUMN drug_chat JSON DEFAULT NULL AFTER fluid_balance");
        console.log('Added drug_chat column to round_checks');
      }
    } catch (e) {
      console.log('drug_chat column check:', e.message);
    }

    // Ensure round_checks status ENUM includes 'discharged'
    try {
      const [colsStatus] = await connection.execute("SHOW COLUMNS FROM round_checks LIKE 'status'");
      if (colsStatus && colsStatus.length > 0) {
        await connection.execute("ALTER TABLE round_checks MODIFY COLUMN status ENUM('ongoing', 'resolved', 'escalated', 'discharged') DEFAULT 'ongoing'");
        console.log('Updated round_checks status ENUM to include discharged');
      }
    } catch (e) {
      console.log('round_checks status ENUM update:', e.message);
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

    // Create discharge_medications table (pharmacy queue for discharged patient medications)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS discharge_medications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admission_id INT NOT NULL,
        patient_id INT NOT NULL,
        patient_name VARCHAR(255) NOT NULL,
        medicine_name VARCHAR(255) NOT NULL,
        dosage VARCHAR(255),
        frequency VARCHAR(255),
        amount VARCHAR(255),
        end_date DATE,
        notes TEXT,
        status ENUM('pending', 'dispensed', 'cancelled', 'not_available') DEFAULT 'pending',
        dispensed_by INT,
        dispensed_at DATETIME,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (dispensed_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Discharge medications table created or already exists');

    // Ensure discharge_medications has not_available status
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM discharge_medications LIKE 'status'");
      if (cols && cols.length > 0) {
        await connection.execute("ALTER TABLE discharge_medications MODIFY COLUMN status ENUM('pending', 'dispensed', 'cancelled', 'not_available') DEFAULT 'pending'");
        console.log('Updated discharge_medications status to include not_available');
      }
    } catch (e) {
      console.log('Error updating discharge_medications status:', e.message);
    }

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

    // ==================== BLOOD BANK ====================
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS blood_bank_inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        blood_group VARCHAR(5) NOT NULL,
        component ENUM('Whole Blood', 'Packed RBC', 'Platelets', 'Plasma', 'Cryoprecipitate') NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_type VARCHAR(50) DEFAULT 'unit',
        donor_id INT,
        donor_name VARCHAR(255),
        collection_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        status ENUM('available', 'reserved', 'issued', 'expired', 'discarded') DEFAULT 'available',
        storage_location VARCHAR(255),
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Blood bank inventory table created or already exists');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS blood_donors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        date_of_birth DATE,
        gender ENUM('male', 'female', 'other'),
        blood_group VARCHAR(5) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        emergency_contact VARCHAR(20),
        medical_conditions TEXT,
        last_donation_date DATE,
        total_donations INT DEFAULT 0,
        status ENUM('active', 'inactive', 'blacklisted') DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Blood donors table created or already exists');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS blood_issues (
        id INT AUTO_INCREMENT PRIMARY KEY,
        blood_unit_id INT NOT NULL,
        patient_id INT,
        patient_name VARCHAR(255),
        recipient_name VARCHAR(255),
        recipient_type ENUM('patient', 'external') DEFAULT 'patient',
        issue_reason TEXT,
        issued_by INT,
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status ENUM('issued', 'transfused', 'returned', 'cancelled') DEFAULT 'issued',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (blood_unit_id) REFERENCES blood_bank_inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Blood issues table created or already exists');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS blood_transfusions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        blood_issue_id INT NOT NULL,
        blood_unit_id INT NOT NULL,
        patient_id INT,
        patient_name VARCHAR(255),
        transfusion_date DATETIME NOT NULL,
        administered_by INT,
        volume_issued INT,
        reaction TEXT,
        status ENUM('completed', 'reaction', 'incomplete') DEFAULT 'completed',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (blood_issue_id) REFERENCES blood_issues(id) ON DELETE CASCADE,
        FOREIGN KEY (blood_unit_id) REFERENCES blood_bank_inventory(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (administered_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Blood transfusions table created or already exists');

    // Ensure blood_issues table has additional columns
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM blood_issues LIKE 'blood_type'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE blood_issues ADD COLUMN blood_type VARCHAR(10) AFTER recipient_type");
        console.log('Added blood_type column to blood_issues table');
      }
    } catch (e) {
      console.log('Error checking blood_type column:', e.message);
    }
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM blood_issues LIKE 'units'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE blood_issues ADD COLUMN units INT DEFAULT 1");
        console.log('Added units column to blood_issues table');
      }
    } catch (e) {
      console.log('Error checking units column:', e.message);
    }
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM blood_issues LIKE 'department'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE blood_issues ADD COLUMN department VARCHAR(100)");
        console.log('Added department column to blood_issues table');
      }
    } catch (e) {
      console.log('Error checking department column:', e.message);
    }
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM blood_issues LIKE 'doctor_id'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE blood_issues ADD COLUMN doctor_id INT");
        console.log('Added doctor_id column to blood_issues table');
      }
    } catch (e) {
      console.log('Error checking doctor_id column:', e.message);
    }
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM blood_issues LIKE 'issue_date'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE blood_issues ADD COLUMN issue_date DATE");
        console.log('Added issue_date column to blood_issues table');
      }
    } catch (e) {
      console.log('Error checking issue_date column:', e.message);
    }
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM blood_issues LIKE 'emergency'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE blood_issues ADD COLUMN emergency BOOLEAN DEFAULT FALSE");
        console.log('Added emergency column to blood_issues table');
      }
    } catch (e) {
      console.log('Error checking emergency column:', e.message);
    }

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
        medication_id INT,
        discharge_medication_id INT,
        service_name VARCHAR(255) NOT NULL,
        description TEXT,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL,
        total_price DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES billing_services(id) ON DELETE SET NULL,
        FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE SET NULL,
        FOREIGN KEY (discharge_medication_id) REFERENCES discharge_medications(id) ON DELETE SET NULL
      )
    `);
    console.log('Billing invoice items table created or already exists');

    // Ensure billing_invoice_items has medication_id column
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM billing_invoice_items LIKE 'medication_id'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE billing_invoice_items ADD COLUMN medication_id INT DEFAULT NULL AFTER service_id");
        await connection.execute("ALTER TABLE billing_invoice_items ADD CONSTRAINT fk_billing_invoice_items_medication FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE SET NULL");
        console.log('Added medication_id column to billing_invoice_items table');
      }
    } catch (e) {
      console.log('Error checking medication_id column:', e.message);
    }

    // Ensure billing_invoice_items has discharge_medication_id column
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM billing_invoice_items LIKE 'discharge_medication_id'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE billing_invoice_items ADD COLUMN discharge_medication_id INT DEFAULT NULL AFTER medication_id");
        await connection.execute("ALTER TABLE billing_invoice_items ADD CONSTRAINT fk_billing_invoice_items_discharge_medication FOREIGN KEY (discharge_medication_id) REFERENCES discharge_medications(id) ON DELETE SET NULL");
        console.log('Added discharge_medication_id column to billing_invoice_items table');
      }
    } catch (e) {
      console.log('Error checking discharge_medication_id column:', e.message);
    }

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

    // Create newsletter_subscribers table (for health newspaper subscriptions)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);
    console.log('Newsletter subscribers table created or already exists');

    // Create health_news table (pool of health articles for weekly newsletters)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS health_news (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        summary TEXT,
        content TEXT,
        category VARCHAR(100),
        author VARCHAR(255) DEFAULT 'PrediaCare Medical Team',
        status ENUM('published', 'draft') DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Health news table created or already exists');

    // Seed health news articles if empty
    const [newsCount] = await connection.execute('SELECT COUNT(*) as count FROM health_news');
    if (newsCount[0].count === 0) {
      const sampleNews = [
        {
          title: '5 Essential Habits for Heart Health',
          summary: 'Discover the five daily habits that can significantly reduce your risk of heart disease.',
          content: 'Heart disease remains the leading cause of death worldwide. However, simple daily habits can make a tremendous difference in protecting your cardiovascular health. Here are five evidence-based habits: 1) Regular physical activity - aim for at least 150 minutes of moderate exercise per week. 2) A balanced diet rich in fruits, vegetables, and whole grains. 3) Avoiding smoking and limiting alcohol consumption. 4) Adequate sleep (7-9 hours per night). 5) Regular health check-ups to monitor blood pressure and cholesterol levels. Incorporating these habits into your routine can reduce your risk of heart disease by up to 80%.',
          category: 'cardiology',
          author: 'Dr. Sarah Doctor'
        },
        {
          title: 'Understanding Diabetes: Types, Symptoms, and Management',
          summary: 'Learn about the different types of diabetes, their symptoms, and effective management strategies.',
          content: 'Diabetes is a chronic metabolic condition characterized by high blood sugar levels. There are three main types: Type 1 (autoimmune, insulin-dependent), Type 2 (insulin resistance), and gestational diabetes (during pregnancy). Common symptoms include frequent urination, excessive thirst, fatigue, and blurred vision. Management strategies include regular blood sugar monitoring, a balanced diet low in refined sugars, regular exercise, and appropriate medication or insulin therapy. Early detection and proper management can prevent complications such as heart disease, kidney failure, and vision loss.',
          category: 'endocrinology',
          author: 'Dr. Michael Chen'
        },
        {
          title: 'Preventive Care: Why Regular Check-ups Matter',
          summary: 'Regular health screenings and check-ups are key to early disease detection and prevention.',
          content: 'Preventive healthcare is the cornerstone of maintaining good health. Regular check-ups allow healthcare providers to detect potential health issues before they become serious problems. Recommended screenings vary by age and risk factors but may include blood pressure checks, cholesterol tests, cancer screenings, immunizations, and vision/hearing tests. The benefits of preventive care include early disease detection, better treatment outcomes, reduced healthcare costs, and increased awareness of your health status. Make it a habit to visit your healthcare provider regularly, even when you feel healthy.',
          category: 'prevention',
          author: 'Dr. Emily Brown'
        },
        {
          title: 'Nutrition Tips: Building a Balanced Meal Plate',
          content: 'A well-balanced meal is essential for good nutrition. The key is to fill your plate with a variety of nutrient-dense foods from all food groups. Start by filling half your plate with colorful vegetables and fruits, which provide essential vitamins, minerals, and fiber. The other half should include lean proteins (such as fish, poultry, beans, or nuts) and whole grains (like brown rice, quinoa, or whole wheat). Healthy fats, such as those found in avocados, olive oil, and nuts, should be included in moderation. Limit added sugars, sodium, and processed foods for optimal health and to maintain a healthy weight.',
          category: 'nutrition',
          author: 'PrediaCare Medical Team'
        }
      ];

      for (const article of sampleNews) {
        await connection.execute(
          'INSERT INTO health_news (title, summary, content, category, author) VALUES (?, ?, ?, ?, ?)',
          [article.title, article.summary, article.content, article.category, article.author]
        );
      }
      console.log('✅ Health news articles seeded (4 articles)');
    }

    // SEED REAL HOSPITAL SERVICES (NGN)
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
          [patientId, doctors[0].id, 'checkup', 'Routine annual checkup', 'BP: 120/80 mmHg, Pulse: 72 bpm, Temp: 37.0°C', 'Generally healthy, all vital signs normal', 'Continue current diet and exercise routine. Return for next checkup in 1 year.', '2025-12-15']
        );
        console.log('Sample health summary created');
      }
    }

    // ==================== INVENTORY ====================
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS inventory_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id INT DEFAULT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES inventory_categories(id) ON DELETE SET NULL
      )
    `);
    console.log('Inventory categories table created or already exists');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS inventory_suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'Medical Supplies',
        description TEXT,
        contact_person VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        location VARCHAR(255),
        website VARCHAR(255),
        payment_terms VARCHAR(100) DEFAULT 'Net 30',
        avg_lead_time INT DEFAULT 0,
        min_order_value DECIMAL(10,2) DEFAULT 0.00,
        rating INT DEFAULT 3,
        is_preferred BOOLEAN DEFAULT FALSE,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Inventory suppliers table created or already exists');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_name VARCHAR(255) NOT NULL,
        item_id VARCHAR(100) UNIQUE,
        category_id INT,
        subcategory_id INT,
        description TEXT,
        unit_of_measure VARCHAR(50),
        unit_quantity DECIMAL(10,2),
        storage_location VARCHAR(255),
        manufacturer VARCHAR(255),
        brand VARCHAR(255),
        model_version VARCHAR(255),
        expiry_tracking ENUM('yes', 'no') DEFAULT 'no',
        expiry_date DATE DEFAULT NULL,
        requires_refrigeration BOOLEAN DEFAULT FALSE,
        controlled_substance BOOLEAN DEFAULT FALSE,
        hazardous_material BOOLEAN DEFAULT FALSE,
        sterile BOOLEAN DEFAULT FALSE,
        notes TEXT,
        stock_quantity INT DEFAULT 0,
        min_stock_level INT DEFAULT 0,
        max_stock_level INT DEFAULT 0,
        reorder_point INT DEFAULT 0,
        reorder_quantity INT DEFAULT 0,
        unit_cost DECIMAL(10,2) DEFAULT 0.00,
        unit_price DECIMAL(10,2) DEFAULT 0.00,
        primary_supplier_id INT,
        supplier_item_code VARCHAR(100),
        supplier_price DECIMAL(10,2) DEFAULT 0.00,
        lead_time_days INT DEFAULT 0,
        min_order_quantity DECIMAL(10,2) DEFAULT 0,
        alternative_suppliers JSON,
        status ENUM('active', 'inactive', 'discontinued') DEFAULT 'active',
        enable_low_stock_alerts BOOLEAN DEFAULT TRUE,
        enable_expiry_alerts BOOLEAN DEFAULT TRUE,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE SET NULL,
        FOREIGN KEY (subcategory_id) REFERENCES inventory_categories(id) ON DELETE SET NULL,
        FOREIGN KEY (primary_supplier_id) REFERENCES inventory_suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Inventory items table created or already exists');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS inventory_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_id INT NOT NULL,
        supplier_id INT,
        quantity DECIMAL(10,2) NOT NULL,
        unit_price DECIMAL(10,2) DEFAULT 0.00,
        total_amount DECIMAL(12,2) DEFAULT 0.00,
        status ENUM('pending', 'ordered', 'received', 'cancelled') DEFAULT 'pending',
        expected_delivery DATE,
        received_date DATE,
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES inventory_suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Inventory orders table created or already exists');

    // Ensure inventory tables have required columns for older installations
    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'item_id'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN item_id VARCHAR(100) UNIQUE AFTER item_name");
        console.log('Added item_id column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items item_id column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'category_id'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN category_id INT AFTER item_id");
        await connection.execute("ALTER TABLE inventory_items ADD CONSTRAINT fk_inventory_items_category FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE SET NULL");
        console.log('Added category_id column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items category_id column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'subcategory_id'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN subcategory_id INT AFTER category_id");
        await connection.execute("ALTER TABLE inventory_items ADD CONSTRAINT fk_inventory_items_subcategory FOREIGN KEY (subcategory_id) REFERENCES inventory_categories(id) ON DELETE SET NULL");
        console.log('Added subcategory_id column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items subcategory_id column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'unit_of_measure'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN unit_of_measure VARCHAR(50) AFTER description");
        console.log('Added unit_of_measure column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items unit_of_measure column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'expiry_tracking'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN expiry_tracking ENUM('yes', 'no') DEFAULT 'no' AFTER model_version");
        console.log('Added expiry_tracking column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items expiry_tracking column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'expiry_date'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN expiry_date DATE DEFAULT NULL AFTER expiry_tracking");
        console.log('Added expiry_date column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items expiry_date column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'requires_refrigeration'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN requires_refrigeration BOOLEAN DEFAULT FALSE AFTER expiry_tracking");
        console.log('Added requires_refrigeration column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items requires_refrigeration column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'controlled_substance'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN controlled_substance BOOLEAN DEFAULT FALSE AFTER requires_refrigeration");
        console.log('Added controlled_substance column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items controlled_substance column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'hazardous_material'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN hazardous_material BOOLEAN DEFAULT FALSE AFTER controlled_substance");
        console.log('Added hazardous_material column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items hazardous_material column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'sterile'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN sterile BOOLEAN DEFAULT FALSE AFTER hazardous_material");
        console.log('Added sterile column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items sterile column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'stock_quantity'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN stock_quantity INT DEFAULT 0 AFTER notes");
        console.log('Added stock_quantity column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items stock_quantity column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'min_stock_level'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN min_stock_level INT DEFAULT 0 AFTER stock_quantity");
        console.log('Added min_stock_level column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items min_stock_level column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'max_stock_level'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN max_stock_level INT DEFAULT 0 AFTER min_stock_level");
        console.log('Added max_stock_level column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items max_stock_level column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'reorder_point'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN reorder_point INT DEFAULT 0 AFTER max_stock_level");
        console.log('Added reorder_point column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items reorder_point column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'reorder_quantity'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN reorder_quantity INT DEFAULT 0 AFTER reorder_point");
        console.log('Added reorder_quantity column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items reorder_quantity column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'unit_cost'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN unit_cost DECIMAL(10,2) DEFAULT 0.00 AFTER reorder_quantity");
        console.log('Added unit_cost column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items unit_cost column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'unit_price'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN unit_price DECIMAL(10,2) DEFAULT 0.00 AFTER unit_cost");
        console.log('Added unit_price column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items unit_price column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'primary_supplier_id'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN primary_supplier_id INT AFTER unit_price");
        await connection.execute("ALTER TABLE inventory_items ADD CONSTRAINT fk_inventory_items_supplier FOREIGN KEY (primary_supplier_id) REFERENCES inventory_suppliers(id) ON DELETE SET NULL");
        console.log('Added primary_supplier_id column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items primary_supplier_id column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'supplier_item_code'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN supplier_item_code VARCHAR(100) AFTER primary_supplier_id");
        console.log('Added supplier_item_code column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items supplier_item_code column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'supplier_price'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN supplier_price DECIMAL(10,2) DEFAULT 0.00 AFTER supplier_item_code");
        console.log('Added supplier_price column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items supplier_price column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'lead_time_days'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN lead_time_days INT DEFAULT 0 AFTER supplier_price");
        console.log('Added lead_time_days column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items lead_time_days column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'min_order_quantity'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN min_order_quantity DECIMAL(10,2) DEFAULT 0 AFTER lead_time_days");
        console.log('Added min_order_quantity column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items min_order_quantity column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'alternative_suppliers'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN alternative_suppliers JSON AFTER min_order_quantity");
        console.log('Added alternative_suppliers column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items alternative_suppliers column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'enable_low_stock_alerts'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN enable_low_stock_alerts BOOLEAN DEFAULT TRUE AFTER status");
        console.log('Added enable_low_stock_alerts column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items enable_low_stock_alerts column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'enable_expiry_alerts'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN enable_expiry_alerts BOOLEAN DEFAULT TRUE AFTER enable_low_stock_alerts");
        console.log('Added enable_expiry_alerts column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items enable_expiry_alerts column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_items LIKE 'created_by'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_items ADD COLUMN created_by INT AFTER enable_expiry_alerts");
        await connection.execute("ALTER TABLE inventory_items ADD CONSTRAINT fk_inventory_items_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL");
        console.log('Added created_by column to inventory_items table');
      }
    } catch (e) {
      console.log('inventory_items created_by column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_orders LIKE 'total_amount'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_orders ADD COLUMN total_amount DECIMAL(12,2) DEFAULT 0.00 AFTER unit_price");
        console.log('Added total_amount column to inventory_orders table');
      }
    } catch (e) {
      console.log('inventory_orders total_amount column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_orders LIKE 'received_date'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_orders ADD COLUMN received_date DATE AFTER expected_delivery");
        console.log('Added received_date column to inventory_orders table');
      }
    } catch (e) {
      console.log('inventory_orders received_date column check:', e.message);
    }

    try {
      const [cols] = await connection.execute("SHOW COLUMNS FROM inventory_orders LIKE 'created_by'");
      if (!cols || cols.length === 0) {
        await connection.execute("ALTER TABLE inventory_orders ADD COLUMN created_by INT AFTER notes");
        await connection.execute("ALTER TABLE inventory_orders ADD CONSTRAINT fk_inventory_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL");
        console.log('Added created_by column to inventory_orders table');
      }
    } catch (e) {
      console.log('inventory_orders created_by column check:', e.message);
    }

    await connection.end();
    console.log('\nDatabase initialization completed successfully!');
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  }
}

initializeDatabase();


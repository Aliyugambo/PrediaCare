/**
 * Diagnostic Staff Routes
 * Handles test result uploads and notifications
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');
const { sendTestResultNotificationToPatient } = require('../config/email');

// GET pending tests (both doctor referrals and walk-ins)
router.get('/pending-tests', checkPermission(PERMISSIONS.VIEW_PENDING_TESTS), async (req, res) => {
  try {
    const { test_type, search } = req.query;
    
    const connection = await pool.getConnection();
    
    // Get doctor referrals
    let referralQuery = `
      SELECT 
        tr.id,
        tr.test_name,
        tr.test_type,
        tr.reason_for_test,
        tr.urgency,
        tr.status,
        tr.created_at,
        'doctor_referral' as source_type,
        u.name as patient_name,
        u.email as patient_email,
        u.phone as patient_phone,
        doctor.name as doctor_name
      FROM test_referrals tr
      LEFT JOIN users u ON tr.patient_id = u.id
      LEFT JOIN doctors d ON tr.doctor_id = d.id
      LEFT JOIN users doctor ON d.user_id = doctor.id
      WHERE tr.status IN ('pending', 'scheduled', 'in_progress')
    `;
    
    const referralParams = [];
    
    if (test_type) {
      referralQuery += ' AND tr.test_type = ?';
      referralParams.push(test_type);
    }
    
    if (search) {
      referralQuery += ' AND (u.name LIKE ? OR tr.test_name LIKE ?)';
      referralParams.push('%' + search + '%', '%' + search + '%');
    }
    
    referralQuery += ' ORDER BY tr.created_at DESC';
    
    const [referrals] = await connection.execute(referralQuery, referralParams);
    
    // Get walk-in patients pending tests
    let walkinQuery = `
      SELECT 
        wp.id,
        wp.test_name,
        wp.test_type,
        wp.status,
        wp.registration_date as created_at,
        'walkin' as source_type,
        wp.first_name,
        wp.last_name,
        wp.email,
        wp.phone,
        wp.address
      FROM walkin_patients wp
      WHERE wp.status IN ('registered', 'sample_collected', 'testing')
    `;
    
    const walkinParams = [];
    
    if (test_type) {
      walkinQuery += ' AND wp.test_type = ?';
      walkinParams.push(test_type);
    }
    
    if (search) {
      walkinQuery += ' AND (wp.first_name LIKE ? OR wp.last_name LIKE ? OR wp.test_name LIKE ?)';
      walkinParams.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
    }
    
    walkinQuery += ' ORDER BY wp.registration_date DESC';
    
    const [walkins] = await connection.execute(walkinQuery, walkinParams);
    
    connection.release();
    
    res.json({
      success: true,
      doctorReferrals: referrals,
      walkinPatients: walkins
    });
  } catch (error) {
    console.error('Error fetching pending tests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending tests'
    });
  }
});

// POST upload diagnostic result for doctor referral
router.post('/results/doctor-referral', checkPermission(PERMISSIONS.UPLOAD_DIAGNOSTIC_RESULTS), async (req, res) => {
  try {
    const {
      referral_id,
      result_data,
      result_date,
      notes,
      file_path,
      file_name,
      file_type
    } = req.body;
    
    if (!referral_id || !result_data) {
      return res.status(400).json({
        success: false,
        message: 'Referral ID and result data are required'
      });
    }
    
    const connection = await pool.getConnection();
    
    // Get referral details for the report
    const [referrals] = await connection.execute(`
      SELECT tr.*, u.name as patient_name, u.email as patient_email, d.user_id as doctor_user_id
      FROM test_referrals tr
      LEFT JOIN users u ON tr.patient_id = u.id
      LEFT JOIN doctors d ON tr.doctor_id = d.id
      WHERE tr.id = ?
    `, [referral_id]);
    
    if (referrals.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Test referral not found'
      });
    }
    
    const referral = referrals[0];
    
    // Update test referral status
    await connection.execute(`
      UPDATE test_referrals SET status = 'completed', updated_at = NOW() WHERE id = ?
    `, [referral_id]);
    
    // Create result record
    const [result] = await connection.execute(`
      INSERT INTO results 
      (patient_id, doctor_id, test_name, test_type, result_data, result_date, notes, file_path, file_name, file_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `, [
      referral.patient_id,
      referral.doctor_id,
      referral.test_name,
      referral.test_type,
      result_data,
      result_date || new Date().toISOString().split('T')[0],
      notes || null,
      file_path || null,
      file_name || null,
      file_type || null
    ]);
    
    // Create report for patient to view (visible to all: doctor, patient, staff, admin)
    await connection.execute(`
      INSERT INTO reports 
      (patient_id, doctor_id, report_type, report_title, report_description, file_path, file_name, visibility, status)
      VALUES (?, ?, 'lab', ?, ?, ?, ?, 'all', 'completed')
    `, [
      referral.patient_id,
      referral.doctor_id,
      'Test Result: ' + referral.test_name,
      result_data + (notes ? '\n\nNotes: ' + notes : ''),
      file_path || null,
      file_name || null
    ]);
    
    connection.release();
    
    // Send email notification to patient
    if (referral.patient_email) {
      await sendTestResultNotificationToPatient(
        { email: referral.patient_email, name: referral.patient_name },
        referral.test_name,
        result_data,
        notes
      );
    }
    
    res.json({
      success: true,
      message: 'Diagnostic result uploaded successfully',
      resultId: result.insertId
    });
  } catch (error) {
    console.error('Error uploading diagnostic result:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload diagnostic result'
    });
  }
});

// POST upload diagnostic result for walk-in patient
router.post('/results/walkin', checkPermission(PERMISSIONS.UPLOAD_DIAGNOSTIC_RESULTS), async (req, res) => {
  try {
    const {
      walkin_id,
      result_data,
      result_date,
      notes,
      file_path,
      file_name,
      file_type
    } = req.body;
    
    if (!walkin_id || !result_data) {
      return res.status(400).json({
        success: false,
        message: 'Walk-in ID and result data are required'
      });
    }
    
    const connection = await pool.getConnection();
    
    // Get walk-in patient details
    const [walkins] = await connection.execute(`
      SELECT * FROM walkin_patients WHERE id = ?
    `, [walkin_id]);
    
    if (walkins.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Walk-in patient not found'
      });
    }
    
    const walkin = walkins[0];
    
    // Update walk-in patient status
    await connection.execute(`
      UPDATE walkin_patients SET status = 'completed', completed_date = NOW(), updated_at = NOW() WHERE id = ?
    `, [walkin_id]);
    
    // For walk-in patients without a doctor, we create a report visible to them
    // Use admin or system as placeholder doctor
    const [admins] = await connection.execute(`
      SELECT id FROM users WHERE role = 'admin' LIMIT 1
    `);
    
    const adminId = admins.length > 0 ? admins[0].id : 1;
    
    // Create result record
    const [result] = await connection.execute(`
      INSERT INTO results 
      (patient_id, test_name, test_type, result_data, result_date, notes, file_path, file_name, file_type, status)
      VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `, [
      walkin.test_name,
      walkin.test_type,
      result_data,
      result_date || new Date().toISOString().split('T')[0],
      notes || null,
      file_path || null,
      file_name || null,
      file_type || null
    ]);
    
    // Create report for patient (visible to patient, admin, staff - NOT doctors for walk-ins)
    await connection.execute(`
      INSERT INTO reports 
      (patient_id, report_type, report_title, report_description, file_path, file_name, visibility, status)
      VALUES (NULL, 'lab', ?, ?, ?, ?, 'staff', 'completed')
    `, [
      'Test Result: ' + walkin.test_name,
      result_data + (notes ? '\n\nNotes: ' + notes : ''),
      file_path || null,
      file_name || null
    ]);
    
    connection.release();
    
    // Send email notification to patient
    if (walkin.email) {
      await sendTestResultNotificationToPatient(
        { email: walkin.email, name: walkin.first_name + ' ' + walkin.last_name },
        walkin.test_name,
        result_data,
        notes
      );
    }
    
    res.json({
      success: true,
      message: 'Diagnostic result uploaded successfully for walk-in patient',
      resultId: result.insertId
    });
  } catch (error) {
    console.error('Error uploading diagnostic result for walk-in:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload diagnostic result'
    });
  }
});

// GET test result template
router.get('/result-template/:testType', checkPermission(PERMISSIONS.UPLOAD_DIAGNOSTIC_RESULTS), async (req, res) => {
  const { testType } = req.params;
  
  // Standard hospital result templates
  const templates = {
    blood: {
      title: 'Complete Blood Count (CBC)',
      fields: [
        { name: 'hemoglobin', label: 'Hemoglobin', unit: 'g/dL', normal: '12.0-16.0' },
        { name: 'wbc', label: 'WBC', unit: '10^3/μL', normal: '4.0-11.0' },
        { name: 'rbc', label: 'RBC', unit: '10^6/μL', normal: '4.0-5.5' },
        { name: 'platelets', label: 'Platelets', unit: '10^3/μL', normal: '150-400' },
        { name: 'hematocrit', label: 'Hematocrit', unit: '%', normal: '36-46' },
        { name: 'mcv', label: 'MCV', unit: 'fL', normal: '80-100' }
      ]
    },
    urine: {
      title: 'Urinalysis',
      fields: [
        { name: 'color', label: 'Color', unit: '', normal: 'Yellow' },
        { name: 'appearance', label: 'Appearance', unit: '', normal: 'Clear' },
        { name: 'ph', label: 'pH', unit: '', normal: '5.0-8.0' },
        { name: 'specific_gravity', label: 'Specific Gravity', unit: '', normal: '1.005-1.030' },
        { name: 'protein', label: 'Protein', unit: 'mg/dL', normal: 'Negative' },
        { name: 'glucose', label: 'Glucose', unit: 'mg/dL', normal: 'Negative' },
        { name: 'ketones', label: 'Ketones', unit: 'mg/dL', normal: 'Negative' }
      ]
    },
    xray: {
      title: 'X-Ray Report',
      fields: [
        { name: 'examination', label: 'Examination', unit: '', normal: '' },
        { name: 'clinical_history', label: 'Clinical History', unit: '', normal: '' },
        { name: 'findings', label: 'Findings', unit: '', normal: '' },
        { name: 'impression', label: 'Impression', unit: '', normal: '' }
      ]
    },
    ecg: {
      title: 'ECG Report',
      fields: [
        { name: 'heart_rate', label: 'Heart Rate', unit: 'bpm', normal: '60-100' },
        { name: 'rhythm', label: 'Rhythm', unit: '', normal: 'Regular' },
        { name: 'pr_interval', label: 'PR Interval', unit: 'ms', normal: '120-200' },
        { name: 'qrs_duration', label: 'QRS Duration', unit: 'ms', normal: '<120' },
        { name: 'qt_interval', label: 'QT Interval', unit: 'ms', normal: '350-440' },
        { name: 'interpretation', label: 'Interpretation', unit: '', normal: '' }
      ]
    },
    mri: {
      title: 'MRI Report',
      fields: [
        { name: 'examination', label: 'Examination', unit: '', normal: '' },
        { name: 'clinical_history', label: 'Clinical History', unit: '', normal: '' },
        { name: 'technique', label: 'Technique', unit: '', normal: '' },
        { name: 'findings', label: 'Findings', unit: '', normal: '' },
        { name: 'impression', label: 'Impression', unit: '', normal: '' }
      ]
    },
    lab: {
      title: 'Lab Test Result',
      fields: [
        { name: 'test_name', label: 'Test Name', unit: '', normal: '' },
        { name: 'test_value', label: 'Test Value', unit: '', normal: '' },
        { name: 'reference_range', label: 'Reference Range', unit: '', normal: '' },
        { name: 'interpretation', label: 'Interpretation', unit: '', normal: '' }
      ]
    },
    imaging: {
      title: 'Imaging Report',
      fields: [
        { name: 'examination', label: 'Examination', unit: '', normal: '' },
        { name: 'clinical_history', label: 'Clinical History', unit: '', normal: '' },
        { name: 'findings', label: 'Findings', unit: '', normal: '' },
        { name: 'impression', label: 'Impression', unit: '', normal: '' }
      ]
    },
    default: {
      title: 'Lab Test Result',
      fields: [
        { name: 'test_value', label: 'Test Value', unit: '', normal: '' },
        { name: 'reference_range', label: 'Reference Range', unit: '', normal: '' },
        { name: 'interpretation', label: 'Interpretation', unit: '', normal: '' }
      ]
    }
  };
  
  res.json({
    success: true,
    template: templates[testType] || templates.default
  });
});

// GET /api/diagnostic/patients - for result assignment dropdown
router.get('/patients', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const { search = '', limit = 50 } = req.query;
    const connection = await pool.getConnection();
    const limitNum = parseInt(limit) || 50;
    
    // Recent patients from appointments/results + walkins
    const [patients] = await connection.execute(`
      SELECT DISTINCT
        u.id,
        CONCAT(u.name, ' (', u.email, ')') as display_name,
        u.email,
        'patient' as type,
        u.created_at
      FROM users u
      WHERE u.role = 'patient' 
        AND (u.name LIKE ? OR u.email LIKE ?)
      ORDER BY u.created_at DESC
      LIMIT ${limitNum}
    `, [`%${search}%`, `%${search}%`]);
    
    // Recent walkins (no user record)
    const [walkins] = await connection.execute(`
      SELECT 
        id as id,
        CONCAT(first_name, ' ', last_name, ' (Walk-in ', id, ')') as display_name,
        email,
        'walkin' as type,
        registration_date as created_at
      FROM walkin_patients
      WHERE (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)
        AND status != 'completed'
      ORDER BY registration_date DESC
      LIMIT 20
    `, [`%${search}%`, `%${search}%`, `%${search}%`]);
    
    connection.release();
    
    res.json({
      success: true,
      patients: [...patients, ...walkins]
    });
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patients' });
  }
});

// GET /api/diagnostic/results - list uploaded results
router.get('/results', checkPermission(PERMISSIONS.ADD_RESULTS), async (req, res) => {
  try {
    const { search = '', limit = 50 } = req.query;
    const connection = await pool.getConnection();
    const limitNum = parseInt(limit) || 50;
    
    // Results table
    let query = `
      SELECT 
        r.id, r.test_name, r.test_type as type, r.created_at, r.visibility,
        CONCAT(u.name, ' (', u.email, ')') as patient_name,
        'result' as source
      FROM results r
      LEFT JOIN users u ON r.patient_id = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      query += ' AND (r.test_name LIKE ? OR u.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` ORDER BY r.created_at DESC LIMIT ${limitNum}`;
    
    const [results] = await connection.execute(query, params);
    
    // Walkin reports
    const [walkinReports] = await connection.execute(`
      SELECT 
        r.id, r.report_title as test_name, r.report_type as type, 
        r.created_at, r.visibility,
        'Walk-in Patient' as patient_name,
        'walkin_report' as source
      FROM reports r
      WHERE r.patient_id IS NULL AND r.report_type = 'lab'
        AND (${search ? 'r.report_title LIKE ?' : '1=1'})
      ORDER BY r.created_at DESC LIMIT 20
    `, search ? [`%${search}%`] : []);
    
    connection.release();
    
    res.json({
      success: true,
      results: [...results, ...walkinReports],
      count: results.length + walkinReports.length
    });
  } catch (error) {
    console.error('Error fetching diagnostic results:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch results' });
  }
});

// POST /api/diagnostic/results - upload test result
router.post('/results', checkPermission(PERMISSIONS.ADD_RESULTS), async (req, res) => {
  try {
    const { 
      patient_id, type, title, description, file_path, visibility,
      pending_source, pending_id, is_referral, referred_to, urgency, notes
    } = req.body;
    
    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    
    const connection = await pool.getConnection();
    
    // Check if this is a walk-in patient (no valid user ID)
    const [userCheck] = await connection.execute(
      "SELECT id FROM users WHERE id = ?",
      [patient_id]
    );
    
    let result_id;
    
    if (userCheck.length === 0) {
      // No user found - this is a walk-in patient
      // Get doctor ID first
      const [doctors] = await connection.execute(
        "SELECT id FROM doctors WHERE user_id = ?",
        [req.session.userId]
      );
      
      let doctorId;
      if (doctors.length > 0) {
        doctorId = doctors[0].id;
      } else {
        const [anyDoctor] = await connection.execute("SELECT id FROM doctors LIMIT 1");
        if (anyDoctor.length > 0) {
          doctorId = anyDoctor[0].id;
        } else {
          connection.release();
          return res.status(400).json({ success: false, message: 'No doctors available.' });
        }
      }
      
      // Insert into reports table for walk-in patient (use report_description instead of notes)
      const [reportResult] = await connection.execute(`
        INSERT INTO reports (patient_id, doctor_id, report_title, report_type, report_description, file_path, created_at)
        VALUES (NULL, ?, ?, ?, ?, ?, NOW())
      `, [doctorId, title, type || 'lab', description || '', file_path || '']);
      
      result_id = reportResult.insertId;
    } else {
      // Regular patient - use results table
      // Get doctor ID
      const [doctors] = await connection.execute(
        "SELECT id FROM doctors WHERE user_id = ?",
        [req.session.userId]
      );
      
      let doctorId;
      if (doctors.length > 0) {
        doctorId = doctors[0].id;
      } else {
        const [anyDoctor] = await connection.execute("SELECT id FROM doctors LIMIT 1");
        if (anyDoctor.length > 0) {
          doctorId = anyDoctor[0].id;
        } else {
          connection.release();
          return res.status(400).json({ success: false, message: 'No doctors available. Please contact administrator.' });
        }
      }
      
      const [result] = await connection.execute(`
        INSERT INTO results (patient_id, doctor_id, test_name, test_type, result_data, report_file, notes, result_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), 'completed')
      `, [patient_id, doctorId, title, type || 'lab', description || '', file_path || '', notes || '']);
      
      result_id = result.insertId;
    }
    if (pending_source && pending_id) {
      if (pending_source === 'walkin') {
        await connection.execute(
          "UPDATE walkin_patients SET status = 'completed', completed_date = NOW() WHERE id = ?",
          [pending_id]
        );
      } else if (pending_source === 'doctor') {
        await connection.execute(
          "UPDATE test_referrals SET status = 'completed' WHERE id = ?",
          [pending_id]
        );
      }
    }
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Test result uploaded successfully',
      result_id: result_id
    });
  } catch (error) {
    console.error('Error uploading result:', error);
    res.status(500).json({ success: false, message: 'Failed to upload result' });
  }
});

module.exports = router;

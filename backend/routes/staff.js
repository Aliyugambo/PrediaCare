/**
 * Staff API Routes
 * Provides endpoints for staff (lab workers, receptionists) to manage tests and records
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');

/**
 * GET /api/staff/test-referrals
 * Get all test referrals for staff to process
 * Permission: VIEW_TEST_REFERRALS (staff)
 */
router.get('/test-referrals', checkPermission(PERMISSIONS.VIEW_TEST_REFERRALS), async (req, res) => {
  try {
    console.log('\n=== STAFF FETCHING TEST REFERRALS ===');
    console.log('User session:', { userId: req.session.userId, role: req.session.userRole });
    
    const { status = 'all', limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        tr.id,
        tr.patient_id,
        tr.doctor_id,
        tr.test_name,
        tr.test_type,
        tr.reason_for_test,
        tr.urgency,
        tr.status,
        tr.assigned_to_staff_id,
        tr.notes,
        tr.created_at,
        tr.updated_at,
        u_patient.name as patient_name,
        u_patient.email as patient_email,
        u_doctor.name as doctor_name,
        u_staff.name as assigned_staff_name
      FROM test_referrals tr
      LEFT JOIN users u_patient ON tr.patient_id = u_patient.id
      LEFT JOIN doctors d ON tr.doctor_id = d.id
      LEFT JOIN users u_doctor ON d.user_id = u_doctor.id
      LEFT JOIN users u_staff ON tr.assigned_to_staff_id = u_staff.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (status !== 'all') {
      query += ' AND tr.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY tr.urgency DESC, tr.created_at ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    const [referrals] = await connection.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM test_referrals WHERE 1=1';
    const countParams = [];
    if (status !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({
      success: true,
      count: referrals.length,
      total: countResult[0].total,
      referrals: referrals.map(ref => ({
        id: ref.id,
        patientId: ref.patient_id,
        patientName: ref.patient_name,
        patientEmail: ref.patient_email,
        doctorId: ref.doctor_id,
        doctorName: ref.doctor_name,
        testName: ref.test_name,
        testType: ref.test_type,
        reasonForTest: ref.reason_for_test,
        urgency: ref.urgency,
        status: ref.status,
        assignedStaffId: ref.assigned_to_staff_id,
        assignedStaffName: ref.assigned_staff_name,
        notes: ref.notes,
        createdAt: ref.created_at,
        updatedAt: ref.updated_at
      }))
    });
  } catch (error) {
    console.error('Error fetching test referrals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test referrals'
    });
  }
});

/**
 * GET /api/staff/test-referrals/:id
 * Get specific test referral details
 * Permission: VIEW_TEST_REFERRALS (staff)
 */
router.get('/test-referrals/:id', checkPermission(PERMISSIONS.VIEW_TEST_REFERRALS), async (req, res) => {
  try {
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [referrals] = await connection.execute(`
      SELECT 
        tr.*,
        u_patient.name as patient_name,
        u_patient.email as patient_email,
        u_doctor.name as doctor_name,
        u_staff.name as assigned_staff_name,
        r.report_title,
        r.report_description,
        r.file_path,
        r.file_name
      FROM test_referrals tr
      JOIN users u_patient ON tr.patient_id = u_patient.id
      JOIN doctors d ON tr.doctor_id = d.id
      JOIN users u_doctor ON d.user_id = u_doctor.id
      LEFT JOIN users u_staff ON tr.assigned_to_staff_id = u_staff.id
      LEFT JOIN reports r ON tr.report_id = r.id
      WHERE tr.id = ?
    `, [id]);
    
    connection.release();
    
    if (referrals.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Test referral not found'
      });
    }
    
    const ref = referrals[0];
    
    res.json({
      success: true,
      referral: {
        id: ref.id,
        patientId: ref.patient_id,
        patientName: ref.patient_name,
        patientEmail: ref.patient_email,
        doctorId: ref.doctor_id,
        doctorName: ref.doctor_name,
        appointmentId: ref.appointment_id,
        reportId: ref.report_id,
        testName: ref.test_name,
        testType: ref.test_type,
        reasonForTest: ref.reason_for_test,
        urgency: ref.urgency,
        status: ref.status,
        assignedStaffId: ref.assigned_to_staff_id,
        assignedStaffName: ref.assigned_staff_name,
        notes: ref.notes,
        reportTitle: ref.report_title,
        reportDescription: ref.report_description,
        reportFile: ref.file_name ? {
          name: ref.file_name,
          path: ref.file_path
        } : null,
        createdAt: ref.created_at,
        updatedAt: ref.updated_at
      }
    });
  } catch (error) {
    console.error('Error fetching test referral:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test referral'
    });
  }
});

/**
 * PUT /api/staff/test-referrals/:id
 * Update test referral status (assign, mark as in progress, complete, etc.)
 * Permission: VIEW_TEST_REFERRALS (staff)
 */
router.put('/test-referrals/:id', checkPermission(PERMISSIONS.VIEW_TEST_REFERRALS), async (req, res) => {
  try {
    const staffId = req.session.userId;
    const { id } = req.params;
    const { status, assigned_to_staff_id, notes } = req.body;
    
    const connection = await pool.getConnection();
    
    // Verify the test referral exists
    const [referrals] = await connection.execute(`
      SELECT id FROM test_referrals WHERE id = ?
    `, [id]);
    
    if (referrals.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Test referral not found'
      });
    }
    
    const updateParts = [];
    const updateParams = [];
    
    if (status !== undefined) {
      updateParts.push('status = ?');
      updateParams.push(status);
    }
    if (assigned_to_staff_id !== undefined) {
      updateParts.push('assigned_to_staff_id = ?');
      updateParams.push(assigned_to_staff_id);
    }
    if (notes !== undefined) {
      updateParts.push('notes = ?');
      updateParams.push(notes);
    }
    updateParts.push('updated_at = NOW()');
    
    if (updateParts.length === 1) { // only updated_at
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    updateParams.push(id);
    const query = `UPDATE test_referrals SET ${updateParts.join(', ')} WHERE id = ?`;
    
    await connection.execute(query, updateParams);
    connection.release();
    
    res.json({
      success: true,
      message: 'Test referral updated successfully'
    });
  } catch (error) {
    console.error('Error updating test referral:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update test referral'
    });
  }
});

/**
 * POST /api/staff/test-referrals/:id/results
 * Upload test results for a test referral (lab staff uploads the actual test result)
 * Permission: VIEW_TEST_REFERRALS (staff)
 */
router.post('/test-referrals/:id/results', checkPermission(PERMISSIONS.VIEW_TEST_REFERRALS), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      result_data,
      report_file,
      file_name,
      result_date,
      notes
    } = req.body;
    
    if (!result_data) {
      return res.status(400).json({
        success: false,
        message: 'Result data is required'
      });
    }
    
    const connection = await pool.getConnection();
    
    // Get the test referral details
    const [referrals] = await connection.execute(`
      SELECT tr.*, d.user_id as doctor_user_id
      FROM test_referrals tr
      JOIN doctors d ON tr.doctor_id = d.id
      WHERE tr.id = ?
    `, [id]);
    
    if (referrals.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Test referral not found'
      });
    }
    
    const referral = referrals[0];
    
    // The doctor_id in test_referrals is already the ID from doctors table
    // We can use it directly for the results table
    const doctorId = referral.doctor_id;
    
    console.log('Using doctorId for results:', doctorId);
    
    // Insert the test result into results table
    const [result] = await connection.execute(`
      INSERT INTO results 
      (patient_id, doctor_id, appointment_id, test_name, test_type, result_data, report_file, file_name, status, notes, result_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)
    `, [
      referral.patient_id,
      doctorId,
      referral.appointment_id || null,
      referral.test_name,
      referral.test_type || null,
      result_data,
      report_file || null,
      file_name || null,
      notes || null,
      result_date || new Date().toISOString().split('T')[0]
    ]);
    
    // Update the test referral status to completed
    await connection.execute(`
      UPDATE test_referrals SET status = 'completed', updated_at = NOW() WHERE id = ?
    `, [id]);
    
    // If there's a report_id associated with this referral, update its status
    if (referral.report_id) {
      await connection.execute(`
        UPDATE reports SET status = 'acted_upon', updated_at = NOW() WHERE id = ?
      `, [referral.report_id]);
    }
    
    connection.release();
    
    res.status(201).json({
      success: true,
      message: 'Test results uploaded successfully',
      resultId: result.insertId
    });
  } catch (error) {
    console.error('Error uploading test results:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload test results'
    });
  }
});

/**
 * GET /api/staff/reports
 * Get all reports that are visible to staff (for test referrals)
 * Permission: VIEW_REPORTS (staff)
 */
router.get('/reports', checkPermission(PERMISSIONS.VIEW_REPORTS), async (req, res) => {
  try {
    const { status = 'all', limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        r.id,
        r.patient_id,
        r.doctor_id,
        r.report_type,
        r.report_title,
        r.report_description,
        r.urgency,
        r.status,
        r.is_test_referral,
        r.file_path,
        r.file_name,
        r.created_at,
        u_patient.name as patient_name,
        u_patient.email as patient_email,
        u_doctor.name as doctor_name
      FROM reports r
      JOIN users u_patient ON r.patient_id = u_patient.id
      JOIN doctors d ON r.doctor_id = d.id
      JOIN users u_doctor ON d.user_id = u_doctor.id
      WHERE (r.visibility = 'staff' OR r.visibility = 'all' OR r.is_test_referral = TRUE)
    `;
    
    const params = [];
    
    if (status !== 'all') {
      query += ' AND r.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY r.urgency DESC, r.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    const [reports] = await connection.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM reports WHERE (visibility = 'staff' OR visibility = 'all' OR is_test_referral = TRUE)`;
    const countParams = [];
    if (status !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({
      success: true,
      count: reports.length,
      total: countResult[0].total,
      reports: reports.map(rep => ({
        id: rep.id,
        patientId: rep.patient_id,
        patientName: rep.patient_name,
        patientEmail: rep.patient_email,
        doctorId: rep.doctor_id,
        doctorName: rep.doctor_name,
        reportType: rep.report_type,
        reportTitle: rep.report_title,
        reportDescription: rep.report_description,
        urgency: rep.urgency,
        status: rep.status,
        isTestReferral: rep.is_test_referral,
        filePath: rep.file_path,
        fileName: rep.file_name,
        createdAt: rep.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
});

/**
 * GET /api/staff/reports/:id/file
 * Get the report file
 * Permission: VIEW_REPORTS (staff)
 */
router.get('/reports/:id/file', checkPermission(PERMISSIONS.VIEW_REPORTS), async (req, res) => {
  try {
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [reports] = await connection.execute(`
      SELECT file_path, file_name FROM reports WHERE id = ? AND (visibility = 'staff' OR visibility = 'all' OR is_test_referral = TRUE)
    `, [id]);
    
    connection.release();
    
    if (reports.length === 0 || !reports[0].file_path) {
      return res.status(404).json({ 
        success: false, 
        message: 'Report file not found' 
      });
    }
    
    const filePath = reports[0].file_path;
    const fileName = reports[0].file_name || 'report';
    
    // Serve the file
    res.sendFile(filePath, { 
      dotfiles: 'allow',
      headers: {
        'Content-Disposition': `inline; filename="${fileName}"`
      }
    }, (err) => {
      if (err) {
        console.error('Error serving file:', err);
        res.status(404).json({ success: false, message: 'File not found' });
      }
    });
  } catch (error) {
    console.error('Error fetching report file:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch file' });
  }
});

/**
 * GET /api/staff/round-checks
 * Get round-check records for nursing staff
 * Permission: VIEW_ROUND_CHECKS (staff)
 */
router.get('/round-checks', checkPermission(PERMISSIONS.VIEW_ROUND_CHECKS), async (req, res) => {
  try {
    const staffId = req.session.userId;
    const { patient_id, admission_id, status = 'ongoing' } = req.query;

    let query = `
      SELECT rc.*, u.name as patient_name, u.email as patient_email,
        d.doctor_name, rc.checked_by as staff_id, su.name as staff_name
      FROM round_checks rc
      JOIN users u ON rc.patient_id = u.id
      JOIN doctors d ON rc.checked_by = d.id
      JOIN users su ON rc.checked_by = su.id
      WHERE 1=1
    `;
    const params = [];

    if (patient_id) {
      query += ' AND rc.patient_id = ?';
      params.push(patient_id);
    }
    if (admission_id) {
      query += ' AND rc.admission_id = ?';
      params.push(admission_id);
    }
    if (status !== 'all') {
      query += ' AND rc.status = ?';
      params.push(status);
    }

    query += ' ORDER BY rc.check_date DESC LIMIT 100';

    const connection = await pool.getConnection();
    const [checks] = await connection.execute(query, params);
    connection.release();

    const parsedChecks = checks.map(c => {
      let vitalSigns = null;
      if (c.vital_signs) {
        try {
          vitalSigns = typeof c.vital_signs === 'string' ? JSON.parse(c.vital_signs) : c.vital_signs;
        } catch (e) {}
      }
      return {
        id: c.id,
        patientId: c.patient_id,
        patientName: c.patient_name,
        patientEmail: c.patient_email,
        admissionId: c.admission_id,
        examinationId: c.examination_id,
        doctorName: c.doctor_name,
        staffId: c.staff_id,
        staffName: c.staff_name,
        checkType: c.check_type,
        notes: c.notes,
        vitalSigns: vitalSigns,
        nextPlan: c.next_plan,
        status: c.status,
        checkDate: c.check_date,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      };
    });

    res.json({ success: true, roundChecks: parsedChecks });
  } catch (error) {
    console.error('Error fetching round checks:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch round checks' });
  }
});

/**
 * POST /api/staff/round-checks
 * Create a new round-check record (nurse)
 * Permission: MANAGE_ROUND_CHECKS (staff)
 */
router.post('/round-checks', checkPermission(PERMISSIONS.MANAGE_ROUND_CHECKS), async (req, res) => {
  try {
    const staffId = req.session.userId;
    const {
      patient_id,
      admission_id,
      examination_id,
      check_type = 'nurse',
      notes,
      vital_signs,
      next_plan,
      status = 'ongoing'
    } = req.body;

    if (!patient_id) {
      return res.status(400).json({ success: false, message: 'Patient ID is required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(`
      INSERT INTO round_checks
      (patient_id, admission_id, examination_id, checked_by, check_type, notes, vital_signs, next_plan, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      patient_id,
      admission_id || null,
      examination_id || null,
      staffId,
      check_type,
      notes || null,
      vital_signs ? JSON.stringify(vital_signs) : null,
      next_plan || null,
      status
    ]);

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Nurse round check recorded successfully',
      roundCheckId: result.insertId
    });
  } catch (error) {
    console.error('Error creating nurse round check:', error);
    res.status(500).json({ success: false, message: 'Failed to create round check' });
  }
});

/**
 * PUT /api/staff/round-checks/:id
 * Nurse can append follow-up notes and change status, but CANNOT edit vital_signs or original notes
 * Permission: MANAGE_ROUND_CHECKS (staff)
 */
router.put('/round-checks/:id', checkPermission(PERMISSIONS.MANAGE_ROUND_CHECKS), async (req, res) => {
  try {
    const { id } = req.params;
    const staffId = req.session.userId;
    const { status, next_plan, follow_up_note } = req.body;

    const connection = await pool.getConnection();

    const [existing] = await connection.execute(
      'SELECT id, checked_by, check_type, follow_up_notes FROM round_checks WHERE id = ?',
      [id]
    );

    if (!existing || existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Round check not found' });
    }

    const record = existing[0];
    const updates = [];
    const values = [];

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (next_plan !== undefined) {
      updates.push('next_plan = ?');
      values.push(next_plan);
    }

    // Append follow-up note to JSON array
    if (follow_up_note !== undefined && follow_up_note.trim() !== '') {
      let currentNotes = [];
      try {
        currentNotes = typeof record.follow_up_notes === 'string' ? JSON.parse(record.follow_up_notes) : (record.follow_up_notes || []);
      } catch (e) {
        currentNotes = [];
      }
      currentNotes.push({
        userId: staffId,
        checkType: 'nurse',
        text: follow_up_note.trim(),
        createdAt: new Date().toISOString()
      });
      updates.push('follow_up_notes = ?');
      values.push(JSON.stringify(currentNotes));
    }

    if (updates.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'No allowed fields to update' });
    }

    const forbidden = [];
    if (req.body.notes !== undefined) forbidden.push('notes');
    if (req.body.vital_signs !== undefined) forbidden.push('vital_signs');
    if (forbidden.length > 0) {
      connection.release();
      return res.status(403).json({ success: false, message: `Forbidden: cannot update ${forbidden.join(', ')} after creation` });
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    await connection.execute(`
      UPDATE round_checks SET ${updates.join(', ')} WHERE id = ?
    `, values);

    connection.release();

    res.json({ success: true, message: 'Nurse follow-up note added successfully' });
  } catch (error) {
    console.error('Error updating nurse round check:', error);
    res.status(500).json({ success: false, message: 'Failed to update round check' });
  }
});

module.exports = router;

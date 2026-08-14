/**
 * Results API Routes
 * Provides endpoints for patients and doctors to view/test results
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');

/**
 * GET /api/results
 * Get all test results for the logged-in patient
 * Permission: VIEW_RESULTS (patient)
 */
router.get('/', checkPermission(PERMISSIONS.VIEW_RESULTS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { limit = 50, offset = 0, status } = req.query;
    
    let query = `
      SELECT 
        r.id,
        r.test_name,
        r.test_type,
        r.result_data,
        r.report_file,
        r.status,
        r.notes,
        r.result_date,
        r.created_at,
        d.id as doctor_id,
        d.specialization,
        u.name as doctor_name
      FROM results r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE r.patient_id = ?
    `;
    
    const params = [patientId];
    
    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }
    
    query += ` ORDER BY r.result_date DESC, r.created_at DESC LIMIT ${Math.floor(Number(limit)) || 50} OFFSET ${Math.floor(Number(offset)) || 0}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    // Use query() instead of execute() to avoid MySQL prepared statement LIMIT issues
    const [results] = await connection.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM results WHERE patient_id = ?';
    const countParams = [patientId];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    // Get unread count (results not reviewed by patient)
    const [unreadCount] = await connection.execute(`
      SELECT COUNT(*) as count FROM results WHERE patient_id = ? AND status = 'completed'
    `, [patientId]);
    
    // Get pending reports count (results without report file - awaiting upload)
    const [pendingCount] = await connection.execute(`
      SELECT COUNT(*) as count FROM results WHERE patient_id = ? AND (status = 'pending' OR report_file IS NULL OR report_file = '')
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: results.length,
      total: countResult[0].total,
      unreadCount: unreadCount[0].count,
      pendingCount: pendingCount[0].count,
      results: results.map(result => ({
        id: result.id,
        testName: result.test_name,
        testType: result.test_type,
        resultData: result.result_data,
        reportFile: result.report_file,
        status: result.status,
        notes: result.notes,
        resultDate: result.result_date,
        createdAt: result.created_at,
        doctor: {
          id: result.doctor_id,
          name: result.doctor_name,
          specialization: result.specialization
        }
      }))
    });
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch results' 
    });
  }
});

/**
 * GET /api/results/reports
 * Get all medical reports for the logged-in patient
 * Permission: VIEW_RESULTS (patient)
 */
router.get('/reports', checkPermission(PERMISSIONS.VIEW_RESULTS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { limit = 50, offset = 0 } = req.query;
    
    const connection = await pool.getConnection();
    
    const [reports] = await connection.query(`
      SELECT 
        r.id,
        r.report_type,
        r.report_title,
        r.report_description,
        r.file_path,
        r.file_name,
        r.status,
        r.urgency,
        r.created_at,
        u_doctor.name as doctor_name,
        d.specialization
      FROM reports r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN users u_doctor ON d.user_id = u_doctor.id
      WHERE r.patient_id = ?
      ORDER BY r.created_at DESC LIMIT ${Math.floor(Number(limit)) || 50} OFFSET ${Math.floor(Number(offset)) || 0}
    `, [patientId, parseInt(limit), parseInt(offset)]);
    
    // Get count
    const [countResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM reports WHERE patient_id = ?',
      [patientId]
    );
    
    connection.release();
    
    res.json({
      success: true,
      count: reports.length,
      total: countResult[0].total,
      reports: reports.map(report => ({
        id: report.id,
        reportType: report.report_type,
        reportTitle: report.report_title,
        reportDescription: report.report_description,
        filePath: report.file_path,
        fileName: report.file_name,
        status: report.status,
        urgency: report.urgency,
        createdAt: report.created_at,
        doctorName: report.doctor_name,
        specialization: report.specialization
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
 * GET /api/results/reports/:id/file
 * Get the report file for a patient report
 * Permission: VIEW_RESULTS (patient)
 */
router.get('/reports/:id/file', checkPermission(PERMISSIONS.VIEW_RESULTS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [reports] = await connection.execute(`
      SELECT file_path, file_name, report_title FROM reports WHERE id = ? AND patient_id = ?
    `, [id, patientId]);
    
    connection.release();
    
    if (reports.length === 0 || !reports[0].file_path) {
      return res.status(404).json({ 
        success: false, 
        message: 'Report file not found' 
      });
    }
    
    const filePath = reports[0].file_path;
    const fileName = reports[0].file_name || reports[0].report_title || 'report';
    
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
 * GET /api/results/:id
 * Get specific result details
 * Permission: VIEW_RESULTS (patient)
 */
router.get('/:id', checkPermission(PERMISSIONS.VIEW_RESULTS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [results] = await connection.execute(`
      SELECT 
        r.id,
        r.test_name,
        r.test_type,
        r.result_data,
        r.report_file,
        r.status,
        r.notes,
        r.result_date,
        r.created_at,
        r.appointment_id,
        d.id as doctor_id,
        d.specialization,
        u.name as doctor_name,
        u.email as doctor_email
      FROM results r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE r.id = ? AND r.patient_id = ?
    `, [id, patientId]);
    
    connection.release();
    
    if (results.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Result not found' 
      });
    }
    
    const result = results[0];
    
    res.json({
      success: true,
      result: {
        id: result.id,
        testName: result.test_name,
        testType: result.test_type,
        resultData: result.result_data,
        reportFile: result.report_file,
        status: result.status,
        notes: result.notes,
        resultDate: result.result_date,
        createdAt: result.created_at,
        appointmentId: result.appointment_id,
        doctor: {
          id: result.doctor_id,
          name: result.doctor_name,
          email: result.doctor_email,
          specialization: result.specialization
        }
      }
    });
  } catch (error) {
    console.error('Error fetching result:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch result details' 
    });
  }
});

/**
 * GET /api/results/:id/file
 * Get the report file for a result
 * Permission: VIEW_RESULTS (patient)
 */
router.get('/:id/file', checkPermission(PERMISSIONS.VIEW_RESULTS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [results] = await connection.execute(`
      SELECT report_file, file_name FROM results WHERE id = ? AND patient_id = ?
    `, [id, patientId]);
    
    connection.release();
    
    if (results.length === 0 || !results[0].report_file) {
      return res.status(404).json({ 
        success: false, 
        message: 'Report file not found' 
      });
    }
    
    const filePath = results[0].report_file;
    const fileName = results[0].file_name || 'report';
    
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
    console.error('Error fetching result file:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch file' });
  }
});

/**
 * GET /api/results/recent
 * Get recent test results for the patient dashboard
 * Permission: VIEW_RESULTS (patient)
 */
router.get('/recent/latest', checkPermission(PERMISSIONS.VIEW_RESULTS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { limit = 5 } = req.query;
    
    const connection = await pool.getConnection();
    
    const [results] = await connection.query(`
      SELECT 
        r.id,
        r.test_name,
        r.test_type,
        r.result_data,
        r.status,
        r.result_date,
        r.created_at,
        u.name as doctor_name
      FROM results r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE r.patient_id = ?
      ORDER BY r.result_date DESC, r.created_at DESC
      LIMIT ?
    `, [patientId, parseInt(limit)]);
    
    connection.release();
    
    res.json({
      success: true,
      count: results.length,
      results: results.map(result => ({
        id: result.id,
        testName: result.test_name,
        testType: result.test_type,
        resultData: result.result_data,
        status: result.status,
        resultDate: result.result_date,
        doctorName: result.doctor_name
      }))
    });
  } catch (error) {
    console.error('Error fetching recent results:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch recent results' 
    });
  }
});

/**
 * GET /api/results/by-type/:type
 * Get test results by test type
 * Permission: VIEW_RESULTS (patient)
 */
router.get('/by-type/:type', checkPermission(PERMISSIONS.VIEW_RESULTS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { type } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const connection = await pool.getConnection();
    
    const [results] = await connection.query(`
      SELECT 
        r.id,
        r.test_name,
        r.test_type,
        r.result_data,
        r.report_file,
        r.status,
        r.notes,
        r.result_date,
        r.created_at,
        u.name as doctor_name
      FROM results r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE r.patient_id = ? AND r.test_type = ?
      ORDER BY r.result_date DESC, r.created_at DESC
      LIMIT ${Math.floor(Number(limit)) || 50} OFFSET ${Math.floor(Number(offset)) || 0}
    `, [patientId, type, parseInt(limit), parseInt(offset)]);
    
    const [countResult] = await connection.execute(`
      SELECT COUNT(*) as total FROM results WHERE patient_id = ? AND test_type = ?
    `, [patientId, type]);
    
    connection.release();
    
    res.json({
      success: true,
      testType: type,
      count: results.length,
      total: countResult[0].total,
      results: results.map(result => ({
        id: result.id,
        testName: result.test_name,
        testType: result.test_type,
        resultData: result.result_data,
        reportFile: result.report_file,
        status: result.status,
        notes: result.notes,
        resultDate: result.result_date,
        createdAt: result.created_at,
        doctorName: result.doctor_name
      }))
    });
  } catch (error) {
    console.error('Error fetching results by type:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch results' 
    });
  }
});

/**
 * GET /api/results/types
 * Get list of available test result types
 * Permission: VIEW_RESULTS (patient)
 */
router.get('/meta/types', checkPermission(PERMISSIONS.VIEW_RESULTS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    
    const connection = await pool.getConnection();
    
    const [types] = await connection.execute(`
      SELECT DISTINCT test_type, COUNT(*) as count
      FROM results 
      WHERE patient_id = ?
      GROUP BY test_type
      ORDER BY test_type
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      types: types.map(t => ({
        name: t.test_type,
        count: t.count
      }))
    });
  } catch (error) {
    console.error('Error fetching result types:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch result types' 
    });
  }
});

/**
 * GET /api/results/doctor/pending
 * Get pending results for doctor to review
 * Permission: ADD_RESULTS (doctor)
 */
router.get('/doctor/pending', checkPermission(PERMISSIONS.ADD_RESULTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const connection = await pool.getConnection();
    
    const [results] = await connection.execute(`
      SELECT 
        r.id,
        r.patient_id,
        r.test_name,
        r.test_type,
        r.result_data,
        r.status,
        r.notes,
        r.result_date,
        r.created_at,
        u.name as patient_name,
        u.email as patient_email
      FROM results r
      JOIN users u ON r.patient_id = u.id
      WHERE r.doctor_id = ? AND r.status = 'completed'
      ORDER BY r.result_date DESC
    `, [doctorId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: results.length,
      results: results.map(result => ({
        id: result.id,
        patientId: result.patient_id,
        patientName: result.patient_name,
        patientEmail: result.patient_email,
        testName: result.test_name,
        testType: result.test_type,
        resultData: result.result_data,
        status: result.status,
        notes: result.notes,
        resultDate: result.result_date,
        createdAt: result.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching pending results:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch pending results' 
    });
  }
});

/**
 * POST /api/results/:id/review
 * Mark a result as reviewed by doctor
 * Permission: ADD_RESULTS (doctor)
 */
router.post('/:id/review', checkPermission(PERMISSIONS.ADD_RESULTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    const { notes } = req.body;
    
    const connection = await pool.getConnection();
    
    // Verify result exists and belongs to this doctor
    const [results] = await connection.execute(`
      SELECT id, status FROM results WHERE id = ? AND doctor_id = ?
    `, [id, doctorId]);
    
    if (results.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Result not found' 
      });
    }
    
    // Update result status
    await connection.execute(`
      UPDATE results SET status = 'reviewed', notes = ? WHERE id = ?
    `, [notes || 'Reviewed by doctor', id]);
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Result marked as reviewed'
    });
  } catch (error) {
    console.error('Error reviewing result:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to review result' 
    });
  }
});

/**
 * POST /api/results
 * Add a new test result (doctor)
 * Permission: ADD_RESULTS (doctor)
 */
router.post('/', checkPermission(PERMISSIONS.ADD_RESULTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { 
      patient_id, 
      test_name, 
      test_type, 
      result_data, 
      report_file,
      status = 'completed',
      notes,
      result_date 
    } = req.body;
    
    // Validate required fields
    if (!patient_id || !test_name || !result_data || !result_date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Patient ID, test name, result data, and date are required' 
      });
    }
    
    const connection = await pool.getConnection();
    
    // Create the result
    const [result] = await connection.execute(`
      INSERT INTO results (patient_id, doctor_id, test_name, test_type, result_data, report_file, status, notes, result_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [patient_id, doctorId, test_name, test_type || null, result_data, report_file || null, status, notes || null, result_date]);
    
    connection.release();
    
    res.status(201).json({
      success: true,
      message: 'Result added successfully',
      resultId: result.insertId
    });
  } catch (error) {
    console.error('Error adding result:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to add result' 
    });
  }
});

module.exports = router;


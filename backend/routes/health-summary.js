/**
 * Health Summary API Routes
 * Provides endpoints for patients to view their health summaries
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');

/**
 * GET /api/health-summary
 * Get all health summaries for the logged-in patient
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { type, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        h.id,
        h.summary_type,
        h.chief_complaint,
        h.vital_signs,
        h.diagnosis,
        h.treatment_plan,
        h.recommendations,
        h.next_visit_date,
        h.attachments,
        h.created_at,
        h.updated_at,
        d.id as doctor_id,
        d.specialization,
        u.name as doctor_name,
        a.appointment_date,
        a.appointment_time
      FROM health_summaries h
      JOIN doctors d ON h.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      LEFT JOIN appointments a ON h.appointment_id = a.id
      WHERE h.patient_id = ?
    `;
    
    const params = [patientId];
    
    if (type) {
      query += ' AND h.summary_type = ?';
      params.push(type);
    }
    
    query += ` ORDER BY h.created_at DESC LIMIT ${Math.floor(Number(limit)) || 50} OFFSET ${Math.floor(Number(offset)) || 0}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    // Use query() instead of execute() to avoid MySQL prepared statement LIMIT issues
    const [summaries] = await connection.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM health_summaries WHERE patient_id = ?';
    const countParams = [patientId];
    if (type) {
      countQuery += ' AND summary_type = ?';
      countParams.push(type);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    // Get latest checkup date
    const [latestCheckup] = await connection.execute(`
      SELECT MAX(created_at) as last_checkup FROM health_summaries WHERE patient_id = ?
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: summaries.length,
      total: countResult[0].total,
      lastCheckup: latestCheckup[0].last_checkup,
      summaries: summaries.map(summary => ({
        id: summary.id,
        summaryType: summary.summary_type,
        chiefComplaint: summary.chief_complaint,
        vitalSigns: summary.vital_signs,
        diagnosis: summary.diagnosis,
        treatmentPlan: summary.treatment_plan,
        recommendations: summary.recommendations,
        nextVisitDate: summary.next_visit_date,
        attachments: summary.attachments,
        createdAt: summary.created_at,
        updatedAt: summary.updated_at,
        appointmentDate: summary.appointment_date,
        appointmentTime: summary.appointment_time,
        doctor: {
          id: summary.doctor_id,
          name: summary.doctor_name,
          specialization: summary.specialization
        }
      }))
    });
  } catch (error) {
    console.error('Error fetching health summaries:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch health summaries' 
    });
  }
});

/**
 * GET /api/health-summary/latest
 * Get latest health summary for the patient dashboard
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/latest', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    
    const connection = await pool.getConnection();
    
    const [summaries] = await connection.execute(`
      SELECT 
        h.id,
        h.summary_type,
        h.chief_complaint,
        h.vital_signs,
        h.diagnosis,
        h.treatment_plan,
        h.recommendations,
        h.next_visit_date,
        h.attachments,
        h.created_at,
        u.name as doctor_name
      FROM health_summaries h
      JOIN doctors d ON h.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE h.patient_id = ?
      ORDER BY h.created_at DESC
      LIMIT 1
    `, [patientId]);
    
    connection.release();
    
    if (summaries.length === 0) {
      return res.json({
        success: true,
        hasSummary: false,
        message: 'No health summaries available'
      });
    }
    
    const summary = summaries[0];
    
    res.json({
      success: true,
      hasSummary: true,
      summary: {
        id: summary.id,
        summaryType: summary.summary_type,
        chiefComplaint: summary.chief_complaint,
        vitalSigns: summary.vital_signs,
        diagnosis: summary.diagnosis,
        treatmentPlan: summary.treatment_plan,
        recommendations: summary.recommendations,
        nextVisitDate: summary.next_visit_date,
        attachments: summary.attachments,
        createdAt: summary.created_at,
        doctorName: summary.doctor_name
      }
    });
  } catch (error) {
    console.error('Error fetching latest health summary:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch latest health summary' 
    });
  }
});

/**
 * GET /api/health-summary/examinations
 * Get examination records for the logged-in patient
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/examinations', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { limit = 50, offset = 0 } = req.query;
    
    const connection = await pool.getConnection();
    
    const [examinations] = await connection.query(`
      SELECT 
        e.id,
        e.examination_date,
        e.vital_signs,
        e.chief_complaint,
        e.examination_notes,
        e.findings,
        e.diagnosis,
        e.treatment_plan,
        e.status,
        e.created_at,
        d.id as doctor_id,
        d.specialization,
        u.name as doctor_name
      FROM examinations e
      JOIN doctors d ON e.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE e.patient_id = ? AND e.vital_signs IS NOT NULL AND e.vital_signs != ''
      ORDER BY e.examination_date DESC, e.created_at DESC
      LIMIT ${Math.floor(Number(limit)) || 50} OFFSET ${Math.floor(Number(offset)) || 0}
    `, [patientId, parseInt(limit), parseInt(offset)]);
    
    // Get total count
    const [countResult] = await connection.execute(`
      SELECT COUNT(*) as total FROM examinations 
      WHERE patient_id = ? AND vital_signs IS NOT NULL AND vital_signs != ''
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: examinations.length,
      total: countResult[0].total,
      examinations: examinations.map(exam => {
        let vitalSigns = null;
        if (exam.vital_signs) {
          try {
            // Handle both string and object types (MySQL JSON column behavior varies)
            vitalSigns = typeof exam.vital_signs === 'string' ? JSON.parse(exam.vital_signs) : exam.vital_signs;
          } catch (e) {
            console.warn('Failed to parse vital_signs for examination:', exam.id);
          }
        }
        return {
          id: exam.id,
          examinationDate: exam.examination_date,
          vitalSigns: vitalSigns,
          chiefComplaint: exam.chief_complaint,
          examinationNotes: exam.examination_notes,
          findings: exam.findings,
          diagnosis: exam.diagnosis,
          treatmentPlan: exam.treatment_plan,
          status: exam.status,
          createdAt: exam.created_at,
          doctor: {
            id: exam.doctor_id,
            name: exam.doctor_name,
            specialization: exam.specialization
          }
        };
      })
    });
  } catch (error) {
    console.error('Error fetching examinations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch examinations' 
    });
  }
});

/**
 * GET /api/health-summary/reports
 * Get medical reports (doctor's examination notes) for the logged-in patient
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/reports', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { limit = 50, offset = 0, type } = req.query;
    
    let query = `
      SELECT 
        h.id,
        h.summary_type,
        h.chief_complaint,
        h.vital_signs,
        h.diagnosis,
        h.treatment_plan,
        h.recommendations,
        h.next_visit_date,
        h.attachments,
        h.created_at,
        h.updated_at,
        d.id as doctor_id,
        d.specialization,
        u.name as doctor_name,
        a.appointment_date,
        a.appointment_time
      FROM health_summaries h
      JOIN doctors d ON h.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      LEFT JOIN appointments a ON h.appointment_id = a.id
      WHERE h.patient_id = ?
    `;
    
    const params = [patientId];
    
    if (type) {
      query += ' AND h.summary_type = ?';
      params.push(type);
    }
    
    query += ` ORDER BY h.created_at DESC LIMIT ${Math.floor(Number(limit)) || 50} OFFSET ${Math.floor(Number(offset)) || 0}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    const [reports] = await connection.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM health_summaries WHERE patient_id = ?';
    const countParams = [patientId];
    if (type) {
      countQuery += ' AND summary_type = ?';
      countParams.push(type);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({
      success: true,
      count: reports.length,
      total: countResult[0].total,
      reports: reports.map(report => ({
        id: report.id,
        summaryType: report.summary_type,
        chiefComplaint: report.chief_complaint,
        vitalSigns: report.vital_signs,
        diagnosis: report.diagnosis,
        treatmentPlan: report.treatment_plan,
        recommendations: report.recommendations,
        nextVisitDate: report.next_visit_date,
        attachments: report.attachments,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        appointmentDate: report.appointment_date,
        appointmentTime: report.appointment_time,
        doctor: {
          id: report.doctor_id,
          name: report.doctor_name,
          specialization: report.specialization
        }
      }))
    });
  } catch (error) {
    console.error('Error fetching medical reports:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch medical reports' 
    });
  }
});

/**
 * GET /api/health-summary/reports/:id/file
 * Get attachment file for a medical report
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/reports/:id/file', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [reports] = await connection.execute(`
      SELECT attachments FROM health_summaries WHERE id = ? AND patient_id = ?
    `, [id, patientId]);
    
    connection.release();
    
    if (reports.length === 0 || !reports[0].attachments) {
      return res.status(404).json({ 
        success: false, 
        message: 'Report file not found' 
      });
    }
    
    const attachments = reports[0].attachments;
    
    // Handle both string and JSON array formats
    let attachmentPath = attachments;
    try {
      if (typeof attachments === 'string') {
        const parsed = JSON.parse(attachments);
        if (Array.isArray(parsed) && parsed.length > 0) {
          attachmentPath = parsed[0].path || parsed[0];
        }
      }
    } catch (e) {
      // Use as is if not JSON
    }
    
    // Serve the file
    res.sendFile(attachmentPath, { 
      dotfiles: 'allow',
      headers: {
        'Content-Disposition': 'inline'
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
 * GET /api/health-summary/:id
 * Get specific health summary details
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/:id', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [summaries] = await connection.execute(`
      SELECT 
        h.id,
        h.summary_type,
        h.chief_complaint,
        h.vital_signs,
        h.diagnosis,
        h.treatment_plan,
        h.recommendations,
        h.next_visit_date,
        h.attachments,
        h.created_at,
        h.updated_at,
        h.appointment_id,
        d.id as doctor_id,
        d.specialization,
        u.name as doctor_name,
        u.email as doctor_email,
        a.appointment_date,
        a.appointment_time
      FROM health_summaries h
      JOIN doctors d ON h.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      LEFT JOIN appointments a ON h.appointment_id = a.id
      WHERE h.id = ? AND h.patient_id = ?
    `, [id, patientId]);
    
    connection.release();
    
    if (summaries.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Health summary not found' 
      });
    }
    
    const summary = summaries[0];
    
    res.json({
      success: true,
      summary: {
        id: summary.id,
        summaryType: summary.summary_type,
        chiefComplaint: summary.chief_complaint,
        vitalSigns: summary.vital_signs,
        diagnosis: summary.diagnosis,
        treatmentPlan: summary.treatment_plan,
        recommendations: summary.recommendations,
        nextVisitDate: summary.next_visit_date,
        attachments: summary.attachments,
        createdAt: summary.created_at,
        updatedAt: summary.updated_at,
        appointmentId: summary.appointment_id,
        appointmentDate: summary.appointment_date,
        appointmentTime: summary.appointment_time,
        doctor: {
          id: summary.doctor_id,
          name: summary.doctor_name,
          email: summary.doctor_email,
          specialization: summary.specialization
        }
      }
    });
  } catch (error) {
    console.error('Error fetching health summary:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch health summary details' 
    });
  }
});

/**
 * GET /api/health-summary/by-type/:type
 * Get health summaries by type
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/by-type/:type', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { type } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const connection = await pool.getConnection();
    
    const [summaries] = await connection.query(`
      SELECT 
        h.id,
        h.summary_type,
        h.chief_complaint,
        h.vital_signs,
        h.diagnosis,
        h.recommendations,
        h.next_visit_date,
        h.created_at,
        u.name as doctor_name
      FROM health_summaries h
      JOIN doctors d ON h.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE h.patient_id = ? AND h.summary_type = ?
      ORDER BY h.created_at DESC
      LIMIT ${Math.floor(Number(limit)) || 50} OFFSET ${Math.floor(Number(offset)) || 0}
    `, [patientId, type, parseInt(limit), parseInt(offset)]);
    
    const [countResult] = await connection.execute(`
      SELECT COUNT(*) as total FROM health_summaries WHERE patient_id = ? AND summary_type = ?
    `, [patientId, type]);
    
    connection.release();
    
    res.json({
      success: true,
      summaryType: type,
      count: summaries.length,
      total: countResult[0].total,
      summaries: summaries.map(summary => ({
        id: summary.id,
        summaryType: summary.summary_type,
        chiefComplaint: summary.chief_complaint,
        vitalSigns: summary.vital_signs,
        diagnosis: summary.diagnosis,
        recommendations: summary.recommendations,
        nextVisitDate: summary.next_visit_date,
        createdAt: summary.created_at,
        doctorName: summary.doctor_name
      }))
    });
  } catch (error) {
    console.error('Error fetching health summaries by type:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch health summaries' 
    });
  }
});

/**
 * GET /api/health-summary/vitals
 * Get vital signs history
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/history/vitals', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { limit = 10 } = req.query;
    
    const connection = await pool.getConnection();
    
    const [vitals] = await connection.query(`
      SELECT 
        id,
        vital_signs,
        created_at
      FROM health_summaries
      WHERE patient_id = ? AND vital_signs IS NOT NULL AND vital_signs != ''
      ORDER BY created_at DESC
      LIMIT ?
    `, [patientId, parseInt(limit)]);
    
    connection.release();
    
    res.json({
      success: true,
      count: vitals.length,
      vitals: vitals.map(v => ({
        id: v.id,
        vitalSigns: v.vital_signs,
        recordedAt: v.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching vitals history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch vitals history' 
    });
  }
});

/**
 * GET /api/health-summary/upcoming
 * Get upcoming visit recommendations
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/upcoming/visits', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    
    const connection = await pool.getConnection();
    
    const [visits] = await connection.execute(`
      SELECT 
        id,
        next_visit_date,
        recommendations,
        created_at
      FROM health_summaries
      WHERE patient_id = ? 
        AND next_visit_date IS NOT NULL 
        AND next_visit_date >= CURDATE()
      ORDER BY next_visit_date ASC
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: visits.length,
      upcomingVisits: visits.map(v => ({
        id: v.id,
        nextVisitDate: v.next_visit_date,
        recommendations: v.recommendations,
        createdAt: v.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching upcoming visits:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch upcoming visits' 
    });
  }
});

/**
 * GET /api/health-summary/types
 * Get list of available health summary types
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/meta/types', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    
    const connection = await pool.getConnection();
    
    const [types] = await connection.execute(`
      SELECT DISTINCT summary_type, COUNT(*) as count
      FROM health_summaries 
      WHERE patient_id = ?
      GROUP BY summary_type
      ORDER BY summary_type
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      types: types.map(t => ({
        name: t.summary_type,
        count: t.count
      }))
    });
  } catch (error) {
    console.error('Error fetching health summary types:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch health summary types' 
    });
  }
});

module.exports = router;

/**
 * GET /api/health-summary/examinations
 * Get examination records for the logged-in patient
 * Permission: VIEW_HEALTH_SUMMARY (patient)
 */
router.get('/examinations', checkPermission(PERMISSIONS.VIEW_HEALTH_SUMMARY), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { limit = 50, offset = 0 } = req.query;
    
    const connection = await pool.getConnection();
    
    const [examinations] = await connection.query(`
      SELECT 
        e.id,
        e.examination_date,
        e.vital_signs,
        e.chief_complaint,
        e.examination_notes,
        e.findings,
        e.diagnosis,
        e.treatment_plan,
        e.status,
        e.created_at,
        d.id as doctor_id,
        d.specialization,
        u.name as doctor_name
      FROM examinations e
      JOIN doctors d ON e.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE e.patient_id = ? AND e.vital_signs IS NOT NULL AND e.vital_signs != ''
      ORDER BY e.examination_date DESC, e.created_at DESC
      LIMIT ${Math.floor(Number(limit)) || 50} OFFSET ${Math.floor(Number(offset)) || 0}
    `, [patientId, parseInt(limit), parseInt(offset)]);
    
    // Get total count
    const [countResult] = await connection.execute(`
      SELECT COUNT(*) as total FROM examinations 
      WHERE patient_id = ? AND vital_signs IS NOT NULL AND vital_signs != ''
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: examinations.length,
      total: countResult[0].total,
      examinations: examinations.map(exam => {
        let vitalSigns = null;
        if (exam.vital_signs) {
          try {
            // Handle both string and object types (MySQL JSON column behavior varies)
            vitalSigns = typeof exam.vital_signs === 'string' ? JSON.parse(exam.vital_signs) : exam.vital_signs;
          } catch (e) {
            console.warn('Failed to parse vital_signs for examination:', exam.id);
          }
        }
        return {
          id: exam.id,
          examinationDate: exam.examination_date,
          vitalSigns: vitalSigns,
          chiefComplaint: exam.chief_complaint,
          examinationNotes: exam.examination_notes,
          findings: exam.findings,
          diagnosis: exam.diagnosis,
          treatmentPlan: exam.treatment_plan,
          status: exam.status,
          createdAt: exam.created_at,
          doctor: {
            id: exam.doctor_id,
            name: exam.doctor_name,
            specialization: exam.specialization
          }
        };
      })
    });
  } catch (error) {
    console.error('Error fetching examinations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch examinations' 
    });
  }
});

module.exports = router;


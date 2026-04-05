/**
 * Doctor Dashboard API Routes
 * Provides endpoints for doctors to manage their practice
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');

/**
 * GET /api/doctor/dashboard/stats
 * Get dashboard statistics for the logged-in doctor
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.get('/dashboard/stats', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    console.log('dashboard/stats called for doctorId=', doctorId);
    const connection = await pool.getConnection();
    
    // Get today's appointments count
    const [todayAppointments] = await connection.execute(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE doctor_id = ? AND appointment_date = CURDATE() AND status IN ('scheduled', 'confirmed')
    `, [doctorId]);
    
    // Get urgent appointments count (by reason containing 'urgent' or 'emergency')
    const [urgentAppointments] = await connection.execute(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE doctor_id = ? AND appointment_date = CURDATE() 
      AND status IN ('scheduled', 'confirmed') 
      AND (reason LIKE '%urgent%' OR reason LIKE '%emergency%' OR reason LIKE '%Urgent%' OR reason LIKE '%Emergency%')
    `, [doctorId]);
    
    // Get pending reports count (results with pending status - awaiting upload)
    const [pendingReports] = await connection.execute(`
      SELECT COUNT(*) as count FROM results 
      WHERE doctor_id = ? AND (status = 'pending' OR report_file IS NULL OR report_file = '')
    `, [doctorId]);
    
    // Get pending tasks count (appointments waiting for follow-up)
    const [pendingTasks] = await connection.execute(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE doctor_id = ? AND status = 'completed' AND updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    `, [doctorId]);
    
    // Get completed appointments today
    const [completedToday] = await connection.execute(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE doctor_id = ? AND appointment_date = CURDATE() AND status = 'completed'
    `, [doctorId]);
    
    // Get total patients this week
    const [patientsThisWeek] = await connection.execute(`
      SELECT COUNT(DISTINCT patient_id) as count FROM appointments 
      WHERE doctor_id = ? AND appointment_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `, [doctorId]);
    
    connection.release();
    
    res.json({
      success: true,
      stats: {
        todayAppointments: todayAppointments[0].count,
        urgentAppointments: urgentAppointments[0].count,
        pendingReports: pendingReports[0].count,
        pendingTasks: pendingTasks[0].count,
        completedToday: completedToday[0].count,
        patientsThisWeek: patientsThisWeek[0].count
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard statistics' 
    });
  }
});

/**
 * GET /api/doctor/appointments/today
 * Get today's appointments for the logged-in doctor
 * Permission: VIEW_PATIENT_APPOINTMENTS (doctor)
 */
router.get('/appointments/today', checkPermission(PERMISSIONS.VIEW_PATIENT_APPOINTMENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    console.log('appointments/today called for doctorId=', doctorId);
    const connection = await pool.getConnection();
    
    // use the database's current date so that server timezone/SQL timezone
    // mismatches can't push the doctor one day out of sync with the stored
    // appointment_date values
    const [appointments] = await connection.execute(`
      SELECT 
        a.id,
        a.patient_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.reason,
        a.notes,
        a.created_at,
        u.name as patient_name,
        u.email as patient_email
      FROM appointments a
      JOIN users u ON a.patient_id = u.id
      WHERE a.doctor_id = ?
        AND a.appointment_date = CURDATE()
      ORDER BY a.appointment_time ASC
    `, [doctorId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: appointments.length,
      // return the date used by the query for debugging / UI
      date: new Date().toISOString().split('T')[0],
      appointments: appointments.map(apt => ({
        id: apt.id,
        patientId: apt.patient_id,
        patient_id: apt.patient_id,
        patientName: apt.patient_name,
        patient_name: apt.patient_name,
        patientEmail: apt.patient_email,
        patient_email: apt.patient_email,
        // alias fields for backward compatibility
        appointment_date: apt.appointment_date,
        appointment_time: apt.appointment_time,
        date: apt.appointment_date,
        time: apt.appointment_time,
        status: apt.status,
        reason: apt.reason,
        notes: apt.notes,
        createdAt: apt.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching today appointments:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch today appointments' 
    });
  }
});

/**
 * GET /api/doctor/appointments
 * Get appointments for a specific date
 * Permission: VIEW_PATIENT_APPOINTMENTS (doctor)
 */
router.get('/appointments', checkPermission(PERMISSIONS.VIEW_PATIENT_APPOINTMENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required (YYYY-MM-DD)'
      });
    }
    
    console.log('appointments called for doctorId=', doctorId, 'date=', date);
    const connection = await pool.getConnection();
    
    const [appointments] = await connection.execute(`
      SELECT 
        a.id,
        a.patient_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.reason,
        a.notes,
        a.duration,
        a.created_at,
        u.name as patient_name,
        u.email as patient_email
      FROM appointments a
      JOIN users u ON a.patient_id = u.id
      WHERE a.doctor_id = ?
        AND a.appointment_date = ?
      ORDER BY a.appointment_time ASC
    `, [doctorId, date]);
    
    connection.release();
    
    res.json({
      success: true,
      count: appointments.length,
      date: date,
      appointments: appointments.map(apt => ({
        id: apt.id,
        patientId: apt.patient_id,
        patient_id: apt.patient_id,
        patientName: apt.patient_name,
        patient_name: apt.patient_name,
        patientEmail: apt.patient_email,
        patient_email: apt.patient_email,
        appointment_date: apt.appointment_date,
        appointment_time: apt.appointment_time,
        date: apt.appointment_date,
        time: apt.appointment_time,
        duration: apt.duration || 30,
        status: apt.status,
        reason: apt.reason,
        notes: apt.notes,
        createdAt: apt.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch appointments' 
    });
  }
});

/**
 * GET /api/doctor/appointments/count
 * Get appointment count for a specific date
 * Permission: VIEW_PATIENT_APPOINTMENTS (doctor)
 */
router.get('/appointments/count', checkPermission(PERMISSIONS.VIEW_PATIENT_APPOINTMENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required (YYYY-MM-DD)'
      });
    }
    
    const connection = await pool.getConnection();
    
    const [result] = await connection.execute(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE doctor_id = ? AND appointment_date = ? AND status IN ('scheduled', 'confirmed')
    `, [doctorId, date]);
    
    connection.release();
    
    res.json({
      success: true,
      count: result[0].count,
      date: date
    });
  } catch (error) {
    console.error('Error fetching appointment count:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch appointment count' 
    });
  }
});

/**
 * GET /api/doctor/appointments/upcoming
 * Get upcoming appointments for the logged-in doctor
 * Permission: VIEW_PATIENT_APPOINTMENTS (doctor)
 */
router.get('/appointments/upcoming', checkPermission(PERMISSIONS.VIEW_PATIENT_APPOINTMENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    console.log('appointments/upcoming called for doctorId=', doctorId, 'limit=', req.query.limit, 'startDate=', req.query.start_date);
    const limit = parseInt(req.query.limit) || 20;
    const connection = await pool.getConnection();
    
    // allow an optional ?start_date=YYYY-MM-DD query parameter so the front‑end
    // (or during debugging) can request a specific day range instead of always
    // using CURDATE(); default to the database's current day.
    const startDate = req.query.start_date || null;
    let sql = `
      SELECT 
        a.id,
        a.patient_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.reason,
        a.notes,
        a.created_at,
        u.name as patient_name,
        u.email as patient_email
      FROM appointments a
      JOIN users u ON a.patient_id = u.id
      WHERE a.doctor_id = ? 
        AND a.status IN ('scheduled', 'confirmed')
    `;
    const params = [doctorId];
    if (startDate) {
      sql += ` AND a.appointment_date >= ?`;
      params.push(startDate);
    } else {
      sql += ` AND a.appointment_date > CURDATE()`;
    }
    sql += `
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
      LIMIT ?
    `;
    params.push(limit);

    const [appointments] = await connection.query(sql, params);
    connection.release();

    res.json({
      success: true,
      count: appointments.length,
      appointments: appointments.map(apt => ({
        id: apt.id,
        patientId: apt.patient_id,
        patient_id: apt.patient_id,
        patientName: apt.patient_name,
        patient_name: apt.patient_name,
        patientEmail: apt.patient_email,
        patient_email: apt.patient_email,
        appointment_date: apt.appointment_date,
        appointment_time: apt.appointment_time,
        date: apt.appointment_date,
        time: apt.appointment_time,
        status: apt.status,
        reason: apt.reason,
        notes: apt.notes,
        createdAt: apt.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching upcoming appointments:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch upcoming appointments' 
    });
  }
});

/**
 * GET /api/doctor/appointments/urgent
 * Get urgent appointments for the logged-in doctor
 * Permission: VIEW_PATIENT_APPOINTMENTS (doctor)
 */
router.get('/appointments/urgent', checkPermission(PERMISSIONS.VIEW_PATIENT_APPOINTMENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const connection = await pool.getConnection();
    
    const [appointments] = await connection.execute(`
      SELECT 
        a.id,
        a.patient_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.reason,
        a.notes,
        a.created_at,
        u.name as patient_name,
        u.email as patient_email
      FROM appointments a
      JOIN users u ON a.patient_id = u.id
      WHERE a.doctor_id = ? 
        AND a.appointment_date >= CURDATE()
        AND a.status IN ('scheduled', 'confirmed')
        AND (a.reason LIKE '%urgent%' OR a.reason LIKE '%emergency%' OR a.notes LIKE '%urgent%')
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
    `, [doctorId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: appointments.length,
      appointments: appointments.map(apt => ({
        id: apt.id,
        patientId: apt.patient_id,
        patient_id: apt.patient_id,
        patientName: apt.patient_name,
        patient_name: apt.patient_name,
        patientEmail: apt.patient_email,
        patient_email: apt.patient_email,
        appointment_date: apt.appointment_date,
        appointment_time: apt.appointment_time,
        date: apt.appointment_date,
        time: apt.appointment_time,
        status: apt.status,
        reason: apt.reason,
        notes: apt.notes,
        createdAt: apt.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching urgent appointments:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch urgent appointments' 
    });
  }
});

/**
 * POST /api/doctor/appointments/:id/complete
 * Mark an appointment as completed
 * Permission: MANAGE_APPOINTMENTS (doctor)
 */
router.post('/appointments/:id/complete', checkPermission(PERMISSIONS.MANAGE_APPOINTMENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    const { notes } = req.body;
    
    const connection = await pool.getConnection();
    
    // Verify appointment exists and belongs to this doctor
    const [appointments] = await connection.execute(`
      SELECT id, status FROM appointments WHERE id = ? AND doctor_id = ?
    `, [id, doctorId]);
    
    if (appointments.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Appointment not found' 
      });
    }
    
    if (appointments[0].status === 'completed') {
      connection.release();
      return res.status(400).json({ 
        success: false, 
        message: 'This appointment is already completed' 
      });
    }
    
    // Update appointment status
    await connection.execute(`
      UPDATE appointments SET status = 'completed', notes = ? WHERE id = ?
    `, [notes || 'Appointment completed', id]);
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Appointment marked as completed'
    });
  } catch (error) {
    console.error('Error completing appointment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to complete appointment' 
    });
  }
});

/**
 * POST /api/doctor/appointments/:id/cancel
 * Cancel an appointment
 * Permission: MANAGE_APPOINTMENTS (doctor)
 */
router.post('/appointments/:id/cancel', checkPermission(PERMISSIONS.MANAGE_APPOINTMENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    const { reason } = req.body;
    
    const connection = await pool.getConnection();
    
    // Verify appointment exists and belongs to this doctor
    const [appointments] = await connection.execute(`
      SELECT id, status FROM appointments WHERE id = ? AND doctor_id = ?
    `, [id, doctorId]);
    
    if (appointments.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Appointment not found' 
      });
    }
    
    if (appointments[0].status === 'cancelled') {
      connection.release();
      return res.status(400).json({ 
        success: false, 
        message: 'This appointment is already cancelled' 
      });
    }
    
    // Update appointment status
    await connection.execute(`
      UPDATE appointments SET status = 'cancelled', notes = ? WHERE id = ?
    `, [reason ? `Cancelled: ${reason}` : 'Cancelled by doctor', id]);
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Appointment cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to cancel appointment' 
    });
  }
});

/**
 * GET /api/doctor/patients/today
 * Get all patients the doctor is seeing today
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.get('/patients/today', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    console.log('patients/today called for doctorId=', doctorId);
    const connection = await pool.getConnection();
    
    const [patients] = await connection.execute(`
      SELECT DISTINCT
        u.id as patient_id,
        u.name as patient_name,
        u.email as patient_email,
        a.id as appointment_id,
        a.appointment_time,
        a.status,
        a.reason,
        m.medication_name,
        m.dosage,
        m.frequency,
        (SELECT COUNT(*) FROM appointments WHERE patient_id = u.id AND doctor_id = ?) as total_visits
      FROM appointments a
      JOIN users u ON a.patient_id = u.id
      LEFT JOIN medications m ON u.id = m.patient_id AND m.status = 'active'
      WHERE a.doctor_id = ? AND a.appointment_date = CURDATE() AND a.status IN ('scheduled', 'confirmed')
      ORDER BY a.appointment_time ASC
    `, [doctorId, doctorId]);
    
    console.log(`patients/today query result: found ${patients.length} patients`);
    
    connection.release();
    
    res.json({
      success: true,
      count: patients.length,
      date: new Date().toISOString().split('T')[0],
      patients: patients.map(p => ({
        id: p.patient_id,
        name: p.patient_name,
        email: p.patient_email,
        appointmentId: p.appointment_id,
        appointmentTime: p.appointment_time,
        status: p.status,
        reason: p.reason,
        currentMedication: p.medication_name ? `${p.medication_name} ${p.dosage} - ${p.frequency}` : null,
        totalVisits: p.total_visits
      }))
    });
  } catch (error) {
    console.error('Error fetching today patients:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch today patients' 
    });
  }
});

/**
 * GET /api/doctor/patients/:id
 * Get specific patient details
 * Permission: VIEW_PATIENT_RECORDS (doctor)
 */
router.get('/patients/:id', checkPermission(PERMISSIONS.VIEW_PATIENT_RECORDS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    // Get patient basic info
    const [patients] = await connection.execute(`
      SELECT id, name, email, created_at
      FROM users WHERE id = ? AND role = 'patient'
    `, [id]);
    
    if (patients.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Patient not found' 
      });
    }
    
    const patient = patients[0];
    
    // Get patient's appointments with this doctor
    const [appointments] = await connection.execute(`
      SELECT 
        id,
        appointment_date,
        appointment_time,
        status,
        reason,
        notes,
        created_at
      FROM appointments
      WHERE doctor_id = ? AND patient_id = ?
      ORDER BY appointment_date DESC, appointment_time DESC
      LIMIT 10
    `, [doctorId, id]);
    
    // Get patient's medications
    const [medications] = await connection.execute(`
      SELECT 
        m.id,
        m.medication_name,
        m.dosage,
        m.frequency,
        m.duration,
        m.instructions,
        m.status,
        m.prescribed_date,
        u.name as doctor_name
      FROM medications m
      JOIN doctors d ON m.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE m.patient_id = ?
      ORDER BY m.prescribed_date DESC
    `, [id]);
    
    // Get patient's test results
    const [results] = await connection.execute(`
      SELECT 
        r.id,
        r.test_name,
        r.test_type,
        r.result_data,
        r.status,
        r.result_date,
        r.notes,
        u.name as doctor_name
      FROM results r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE r.patient_id = ?
      ORDER BY r.result_date DESC
      LIMIT 10
    `, [id]);
    
    // Get patient's health summaries
    const [healthSummaries] = await connection.execute(`
      SELECT 
        hs.id,
        hs.summary_type,
        hs.chief_complaint,
        hs.vital_signs,
        hs.diagnosis,
        hs.treatment_plan,
        hs.recommendations,
        hs.next_visit_date,
        hs.created_at,
        u.name as doctor_name
      FROM health_summaries hs
      JOIN doctors d ON hs.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE hs.patient_id = ?
      ORDER BY hs.created_at DESC
      LIMIT 10
    `, [id]);
    
    connection.release();
    
    res.json({
      success: true,
      patient: {
        id: patient.id,
        name: patient.name,
        email: patient.email,
        createdAt: patient.created_at
      },
      appointments: appointments.map(a => ({
        id: a.id,
        date: a.appointment_date,
        time: a.appointment_time,
        status: a.status,
        reason: a.reason,
        notes: a.notes,
        createdAt: a.created_at
      })),
      medications: medications.map(m => ({
        id: m.id,
        medicationName: m.medication_name,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions,
        status: m.status,
        prescribedDate: m.prescribed_date,
        doctorName: m.doctor_name
      })),
      results: results.map(r => ({
        id: r.id,
        testName: r.test_name,
        testType: r.test_type,
        resultData: r.result_data,
        status: r.status,
        resultDate: r.result_date,
        notes: r.notes,
        doctorName: r.doctor_name
      })),
      healthSummaries: healthSummaries.map(hs => ({
        id: hs.id,
        summaryType: hs.summary_type,
        chiefComplaint: hs.chief_complaint,
        vitalSigns: hs.vital_signs,
        diagnosis: hs.diagnosis,
        treatmentPlan: hs.treatment_plan,
        recommendations: hs.recommendations,
        nextVisitDate: hs.next_visit_date,
        createdAt: hs.created_at,
        doctorName: hs.doctor_name
      }))
    });
  } catch (error) {
    console.error('Error fetching patient details:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch patient details' 
    });
  }
});

/**
 * GET /api/doctor/examinations
 * Get all examination records for the logged-in doctor
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.get('/examinations', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  let connection;
  try {
    const doctorId = req.session.doctorId;
    const { search, dateRange } = req.query;
    
    connection = await pool.getConnection();
    
    // Join with users table (where role = 'patient') instead of non-existent patients table
    let query = `
      SELECT e.*, u.name as patient_name, u.email as patient_email
      FROM examinations e
      LEFT JOIN users u ON e.patient_id = u.id AND u.role = 'patient'
      WHERE e.doctor_id = ?
    `;
    const params = [doctorId];
    
    // Add date range filter
    if (dateRange && dateRange !== '') {
      let dateCondition = '';
      const today = new Date();
      
      switch(dateRange) {
        case 'today':
          const todayStr = today.toISOString().split('T')[0];
          dateCondition = ' AND DATE(e.examination_date) = ?';
          params.push(todayStr);
          break;
        case 'week':
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          dateCondition = ' AND DATE(e.examination_date) >= ?';
          params.push(weekAgo.toISOString().split('T')[0]);
          break;
        case 'month':
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          dateCondition = ' AND DATE(e.examination_date) >= ?';
          params.push(monthAgo.toISOString().split('T')[0]);
          break;
      }
      query += dateCondition;
    }
    
    // Add search filter (by patient name)
    if (search && search.trim() !== '') {
      query += ' AND u.name LIKE ?';
      params.push('%' + search.trim() + '%');
    }
    
    query += ' ORDER BY e.examination_date DESC, e.id DESC';
    
    const [examinations] = await connection.query(query, params);
    
    connection.release();
    connection = null;
    
    // Parse vital_signs JSON for each examination with error handling
    // Handle both string and object types (MySQL JSON column behavior varies)
    const parsedExaminations = examinations.map(exam => {
      let vitalSigns = null;
      if (exam.vital_signs) {
        try {
          vitalSigns = typeof exam.vital_signs === 'string' ? JSON.parse(exam.vital_signs) : exam.vital_signs;
        } catch (e) {
          console.warn('Failed to parse vital_signs for examination:', exam.id);
        }
      }
      return {
        ...exam,
        vital_signs: vitalSigns
      };
    });
    
    res.json({
      success: true,
      examinations: parsedExaminations
    });
  } catch (error) {
    console.error('Error fetching examinations:', error);
    if (connection) {
      connection.release();
    }
    res.status(500).json({
      success: false,
      message: 'Failed to fetch examinations: ' + error.message
    });
  }
});

/**
 * POST /api/doctor/examinations
 * Create a new examination record during consultation
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.post('/examinations', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const {
      patient_id,
      appointment_id,
      examination_date,
      vital_signs,
      chief_complaint,
      examination_notes,
      findings,
      diagnosis,
      treatment_plan,
      status
    } = req.body;

    if (!patient_id || !examination_date) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID and examination date are required'
      });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(`
      INSERT INTO examinations 
      (patient_id, doctor_id, appointment_id, examination_date, vital_signs, chief_complaint, examination_notes, findings, diagnosis, treatment_plan, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      patient_id,
      doctorId,
      appointment_id || null,
      examination_date,
      vital_signs ? JSON.stringify(vital_signs) : null,
      chief_complaint || null,
      examination_notes || null,
      findings || null,
      diagnosis || null,
      treatment_plan || null,
      status || 'completed'
    ]);

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Examination record created',
      examinationId: result.insertId
    });
  } catch (error) {
    console.error('Error creating examination:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create examination record'
    });
  }
});

/**
 * GET /api/doctor/examinations/:id
 * Get a single examination record by ID
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.get('/examinations/:id', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  let connection;
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    
    connection = await pool.getConnection();
    
    // Get examination with patient info
    const [exams] = await connection.query(`
      SELECT e.*, u.name as patient_name, u.email as patient_email
      FROM examinations e
      LEFT JOIN users u ON e.patient_id = u.id AND u.role = 'patient'
      WHERE e.id = ? AND e.doctor_id = ?
    `, [id, doctorId]);
    
    if (exams.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Examination not found'
      });
    }
    
    const exam = exams[0];
    
    // Parse vital_signs JSON - handle both string and object types
    let vitalSigns = null;
    if (exam.vital_signs) {
      try {
        vitalSigns = typeof exam.vital_signs === 'string' ? JSON.parse(exam.vital_signs) : exam.vital_signs;
      } catch (e) {
        console.warn('Failed to parse vital_signs');
      }
    }
    
    connection.release();
    
    res.json({
      success: true,
      examination: {
        ...exam,
        vital_signs: vitalSigns
      }
    });
  } catch (error) {
    console.error('Error fetching examination:', error);
    if (connection) {
      connection.release();
    }
    res.status(500).json({
      success: false,
      message: 'Failed to fetch examination: ' + error.message
    });
  }
});

/**
 * PUT /api/doctor/examinations/:id
 * Update an examination record
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.put('/examinations/:id', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    const {
      vital_signs,
      chief_complaint,
      examination_notes,
      findings,
      diagnosis,
      treatment_plan,
      status
    } = req.body;

    const connection = await pool.getConnection();

    // Verify the examination belongs to this doctor
    const [exams] = await connection.execute(`
      SELECT doctor_id FROM examinations WHERE id = ?
    `, [id]);

    if (exams.length === 0 || exams[0].doctor_id !== doctorId) {
      connection.release();
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this examination'
      });
    }

    const updateParts = [];
    const updateParams = [];

    if (vital_signs !== undefined) {
      updateParts.push('vital_signs = ?');
      updateParams.push(vital_signs ? JSON.stringify(vital_signs) : null);
    }
    if (chief_complaint !== undefined) {
      updateParts.push('chief_complaint = ?');
      updateParams.push(chief_complaint);
    }
    if (examination_notes !== undefined) {
      updateParts.push('examination_notes = ?');
      updateParams.push(examination_notes);
    }
    if (findings !== undefined) {
      updateParts.push('findings = ?');
      updateParams.push(findings);
    }
    if (diagnosis !== undefined) {
      updateParts.push('diagnosis = ?');
      updateParams.push(diagnosis);
    }
    if (treatment_plan !== undefined) {
      updateParts.push('treatment_plan = ?');
      updateParams.push(treatment_plan);
    }
    if (status !== undefined) {
      updateParts.push('status = ?');
      updateParams.push(status);
    }

    if (updateParts.length === 0) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateParams.push(id);
    const query = `UPDATE examinations SET ${updateParts.join(', ')} WHERE id = ?`;

    await connection.execute(query, updateParams);
    connection.release();

    res.json({
      success: true,
      message: 'Examination record updated'
    });
  } catch (error) {
    console.error('Error updating examination:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update examination'
    });
  }
});

/**
 * POST /api/doctor/reports
 * Create/upload a new report for a patient
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.post('/reports', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    console.log('\n=== DOCTOR CREATING REPORT ===');
    console.log('Doctor ID:', doctorId);
    
    const {
      patient_id,
      appointment_id,
      report_type,
      report_title,
      report_description,
      file_path,
      file_name,
      file_type,
      file_size,
      is_test_referral,
      test_referred_to,
      urgency,
      visibility,
      status
    } = req.body;
    
    console.log('Report data:', { patient_id, report_type, report_title, is_test_referral, test_referred_to });

    if (!patient_id || !report_type || !report_title) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID, report type, and title are required'
      });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(`
      INSERT INTO reports 
      (patient_id, doctor_id, appointment_id, report_type, report_title, report_description, file_path, file_name, file_type, file_size, is_test_referral, test_referred_to, urgency, visibility, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      patient_id,
      doctorId,
      appointment_id || null,
      report_type,
      report_title,
      report_description || null,
      file_path || null,
      file_name || null,
      file_type || null,
      file_size || null,
      is_test_referral || false,
      test_referred_to || null,
      urgency || 'routine',
      visibility || 'all',
      status || 'submitted'
    ]);

    // If this is a test referral, create a test_referral record
    if (is_test_referral && test_referred_to) {
      console.log('Creating test referral for:', { patient_id, doctorId, report_title, test_referred_to });
      await connection.execute(`
        INSERT INTO test_referrals
        (patient_id, doctor_id, appointment_id, report_id, test_name, test_type, urgency, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `, [
        patient_id,
        doctorId,
        appointment_id || null,
        result.insertId,
        report_title,
        test_referred_to,
        urgency || 'routine'
      ]);
      console.log('Test referral created successfully');
    }

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Report created successfully',
      reportId: result.insertId
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create report'
    });
  }
});

/**
 * GET /api/doctor/test-referrals
 * Get test referrals created by the doctor
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.get('/test-referrals', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { search, status } = req.query;
    
    const connection = await pool.getConnection();
    
    let query = `
      SELECT 
        tr.id,
        tr.patient_id,
        tr.test_name,
        tr.test_type,
        tr.urgency,
        tr.status,
        tr.created_at,
        u.name as patient_name
      FROM test_referrals tr
      JOIN users u ON tr.patient_id = u.id
      WHERE tr.doctor_id = ?
    `;
    
    const params = [doctorId];
    
    if (search) {
      query += ' AND u.name LIKE ?';
      params.push('%' + search + '%');
    }
    
    if (status) {
      query += ' AND tr.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY tr.created_at DESC LIMIT 50';
    
    const [referrals] = await connection.execute(query, params);
    connection.release();
    
    res.json({
      success: true,
      referrals
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
 * GET /api/doctor/appointments/:appointmentId/examination
 * Get (or create placeholder for) examination record for an appointment
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.get('/appointments/:appointmentId/examination', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { appointmentId } = req.params;

    const connection = await pool.getConnection();

    // get appointment details
    const [appointments] = await connection.execute(`
      SELECT a.id, a.patient_id, a.appointment_date, a.appointment_time,
             u.name as patient_name
      FROM appointments a
      JOIN users u ON a.patient_id = u.id
      WHERE a.id = ? AND a.doctor_id = ?
    `, [appointmentId, doctorId]);

    if (appointments.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    const appointment = appointments[0];

    // Look for existing examination
    const [exams] = await connection.execute(`
      SELECT * FROM examinations
      WHERE appointment_id = ? AND doctor_id = ?
    `, [appointmentId, doctorId]);

    connection.release();

    if (exams.length > 0) {
      const exam = exams[0];
      // Handle vital_signs which can be a string or object depending on MySQL version
      let vitalSigns = exam.vital_signs;
      if (vitalSigns) {
        try {
          vitalSigns = typeof vitalSigns === 'string' ? JSON.parse(vitalSigns) : vitalSigns;
        } catch (e) {
          vitalSigns = null;
        }
      }
      res.json({
        success: true,
        examination: {
          id: exam.id,
          patientId: exam.patient_id,
          appointmentId: exam.appointment_id,
          examinationDate: exam.examination_date,
          vitalSigns: vitalSigns,
          chiefComplaint: exam.chief_complaint,
          examinationNotes: exam.examination_notes,
          findings: exam.findings,
          diagnosis: exam.diagnosis,
          treatmentPlan: exam.treatment_plan,
          status: exam.status,
          createdAt: exam.created_at
        }
      });
    } else {
      // return appointment info so doctor can create new examination
      res.json({
        success: true,
        examination: null,
        appointmentInfo: {
          id: appointmentId,
          patientId: appointment.patient_id,
          patientName: appointment.patient_name,
          appointmentDate: appointment.appointment_date,
          appointmentTime: appointment.appointment_time
        }
      });
    }
  } catch (error) {
    console.error('Error fetching examination:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch examination'
    });
  }
});

/**
 * GET /api/doctor/patients
 * Get all patients for the logged-in doctor with optional search
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.get('/patients', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { search } = req.query;
    console.log('patients called for doctorId=', doctorId, 'search=', search);
    
    const connection = await pool.getConnection();
    
    let query = `
      SELECT DISTINCT
        u.id as patient_id,
        u.name as patient_name,
        u.email as patient_email,
        u.created_at as patient_created_at,
        (SELECT COUNT(*) FROM appointments WHERE patient_id = u.id AND doctor_id = ?) as total_visits,
        (SELECT MAX(appointment_date) FROM appointments WHERE patient_id = u.id AND doctor_id = ?) as last_visit_date
      FROM appointments a
      JOIN users u ON a.patient_id = u.id
      WHERE a.doctor_id = ?
    `;
    
    const params = [doctorId, doctorId, doctorId];
    
    if (search) {
      query += ` AND (u.name LIKE ? OR u.email LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }
    
    query += ` ORDER BY last_visit_date DESC, u.name ASC`;
    
    const [patients] = await connection.execute(query, params);
    
    console.log(`patients query result: found ${patients.length} patients`);
    
    connection.release();
    
    res.json({
      success: true,
      count: patients.length,
      patients: patients.map(p => ({
        id: p.patient_id,
        name: p.patient_name,
        email: p.patient_email,
        createdAt: p.patient_created_at,
        totalVisits: p.total_visits,
        lastVisitDate: p.last_visit_date
      }))
    });
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch patients' 
    });
  }
});

/**
 * GET /api/doctor/reports
 * Get reports for patients of the logged-in doctor with optional search
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.get('/reports', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  let connection;
  try {
    const doctorId = req.session.doctorId;
    const { search, patient_id, status, limit, offset } = req.query;
    console.log('reports called for doctorId=', doctorId, 'search=', search);

    connection = await pool.getConnection();

    let query = `
      SELECT 
        r.id,
        r.patient_id,
        r.report_type,
        r.report_title,
        r.report_description,
        r.file_path,
        r.file_name,
        r.urgency,
        r.visibility,
        r.status,
        r.created_at,
        r.updated_at,
        u.name as patient_name,
        u.email as patient_email
      FROM reports r
      JOIN users u ON r.patient_id = u.id
      WHERE r.doctor_id = ?
    `;

    const params = [doctorId];

    if (search) {
      query += ` AND (r.report_title LIKE ? OR r.report_description LIKE ? OR u.name LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (patient_id) {
      query += ` AND r.patient_id = ?`;
      params.push(patient_id);
    }

    if (status) {
      query += ` AND r.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY r.created_at DESC`;

    // Add pagination - use query() instead of execute() for LIMIT/OFFSET
    const limitNum = parseInt(limit) || 50;
    const offsetNum = parseInt(offset) || 0;
    query += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const [reports] = await connection.query(query, params);
    
    // = await connection.execute Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM reports r
      JOIN users u ON r.patient_id = u.id
      WHERE r.doctor_id = ?
    `;
    const countParams = [doctorId];
    
    if (search) {
      countQuery += ` AND (r.report_title LIKE ? OR r.report_description LIKE ? OR u.name LIKE ?)`;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    if (patient_id) {
      countQuery += ` AND r.patient_id = ?`;
      countParams.push(patient_id);
    }
    
    if (status) {
      countQuery += ` AND r.status = ?`;
      countParams.push(status);
    }
    
    const [countResult] = await connection.execute(countQuery, countParams);
    
    console.log(`reports query result: found ${reports.length} reports`);
    
    connection.release();
    
    res.json({
      success: true,
      count: reports.length,
      total: countResult[0].total,
      reports: reports.map(r => ({
        id: r.id,
        patientId: r.patient_id,
        patientName: r.patient_name,
        patientEmail: r.patient_email,
        reportType: r.report_type,
        reportTitle: r.report_title,
        reportDescription: r.report_description,
        filePath: r.file_path,
        fileName: r.file_name,
        urgency: r.urgency,
        visibility: r.visibility,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    if (connection) {
      connection.release();
    }
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch reports' 
    });
  }
});

module.exports = router;


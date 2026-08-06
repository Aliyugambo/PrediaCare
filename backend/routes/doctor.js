/**
 * Doctor Dashboard API Routes
 * Provides endpoints for doctors to manage their practice
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

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
        a.vitals_data,
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
      appointments: appointments.map(apt => {
        let vitalsData = null;
        if (apt.vitals_data) {
          try {
            vitalsData = typeof apt.vitals_data === 'string' ? JSON.parse(apt.vitals_data) : apt.vitals_data;
          } catch (e) {
            vitalsData = null;
          }
        }
        return {
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
          vitalsData: vitalsData,
          hasVitals: !!vitalsData,
          createdAt: apt.created_at
        };
      })
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
        a.vitals_data,
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
      appointments: appointments.map(apt => {
        let vitalsData = null;
        if (apt.vitals_data) {
          try {
            vitalsData = typeof apt.vitals_data === 'string' ? JSON.parse(apt.vitals_data) : apt.vitals_data;
          } catch (e) {
            vitalsData = null;
          }
        }
        return {
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
          vitalsData: vitalsData,
          hasVitals: !!vitalsData,
          createdAt: apt.created_at
        };
      })
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
      SELECT id, name, email, phone, address, created_at, patient_status
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

    const [examinations] = await connection.execute(`
      SELECT 
        e.id,
        e.examination_date,
        e.vital_signs,
        e.chief_complaint,
        e.examination_notes,
        e.findings,
        e.diagnosis,
        e.treatment_plan,
        e.status
      FROM examinations e
      JOIN doctors d ON e.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE e.patient_id = ?
      ORDER BY e.examination_date DESC, e.id DESC
      LIMIT 20
    `, [id]);

    const [admissions] = await connection.execute(`
      SELECT 
        a.id,
        a.admission_type,
        a.admission_date,
        a.discharge_date,
        a.discharge_data,
        a.room_number,
        a.bed_number,
        a.reason_for_admission,
        a.admitting_diagnosis,
        a.notes,
        a.status,
        u.name as doctor_name
      FROM admissions a
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE a.patient_id = ?
      ORDER BY a.admission_date DESC
      LIMIT 10
    `, [id]);

    const [roundChecks] = await connection.execute(`
      SELECT 
        rc.id,
        rc.check_type,
        rc.status,
        rc.check_date,
        rc.vital_signs,
        rc.fluid_balance,
        rc.drug_chat,
        rc.notes,
        rc.follow_up_notes,
        rc.next_plan,
        u.name as checked_by_name
      FROM round_checks rc
      JOIN users u ON rc.checked_by = u.id
      WHERE rc.patient_id = ?
      ORDER BY rc.check_date DESC
      LIMIT 10
    `, [id]);

    const [testReferrals] = await connection.execute(`
      SELECT 
        tr.id,
        tr.test_type,
        tr.test_name,
        tr.urgency,
        tr.status,
        tr.created_at,
        u.name as doctor_name
      FROM test_referrals tr
      JOIN doctors d ON tr.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE tr.patient_id = ?
      ORDER BY tr.created_at DESC
      LIMIT 10
    `, [id]);

    connection.release();
    
    res.json({
      success: true,
      patient: {
        id: patient.id,
        name: patient.name,
        email: patient.email,
        phone: patient.phone,
        address: patient.address,
        createdAt: patient.created_at,
        patientStatus: patient.patient_status
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
      })),
      examinations: examinations.map(e => {
        let vitalSigns = null;
        if (e.vital_signs) {
          try {
            vitalSigns = typeof e.vital_signs === 'string' ? JSON.parse(e.vital_signs) : e.vital_signs;
          } catch (err) {
            console.warn('Failed to parse vital_signs for patient profile examination:', e.id);
          }
        }
        return {
          id: e.id,
          examinationDate: e.examination_date,
          vitalSigns,
          chiefComplaint: e.chief_complaint,
          examinationNotes: e.examination_notes,
          findings: e.findings,
          diagnosis: e.diagnosis,
          treatmentPlan: e.treatment_plan,
          status: e.status,
          doctorName: e.doctor_name
        };
      }),
      admissions: admissions.map(a => {
        let dischargeData = null;
        if (a.discharge_data) {
          try {
            dischargeData = typeof a.discharge_data === 'string' ? JSON.parse(a.discharge_data) : a.discharge_data;
          } catch (err) {
            console.warn('Failed to parse discharge_data for admission:', a.id);
          }
        }
        return {
          id: a.id,
          admissionType: a.admission_type,
          admissionDate: a.admission_date,
          roomNumber: a.room_number,
          bedNumber: a.bed_number,
          reason: a.reason_for_admission,
          admittingDiagnosis: a.admitting_diagnosis,
          notes: a.notes,
          dischargeDate: a.discharge_date,
          dischargeData: dischargeData,
          status: a.status,
          doctorName: a.doctor_name
        };
      }),
      roundChecks: roundChecks.map(rc => {
        let vitalSigns = null;
        if (rc.vital_signs) {
          try {
            vitalSigns = typeof rc.vital_signs === 'string' ? JSON.parse(rc.vital_signs) : rc.vital_signs;
          } catch (err) {
            console.warn('Failed to parse round check vital_signs:', rc.id);
          }
        }
        let followUpNotes = [];
        if (rc.follow_up_notes) {
          try {
            followUpNotes = typeof rc.follow_up_notes === 'string' ? JSON.parse(rc.follow_up_notes) : rc.follow_up_notes;
          } catch (err) {
            console.warn('Failed to parse round check follow_up_notes:', rc.id);
          }
        }
        return {
          id: rc.id,
          checkType: rc.check_type,
          status: rc.status,
          checkDate: rc.check_date,
          vitalSigns,
          fluidBalance: rc.fluid_balance,
          drugChat: rc.drug_chat,
          notes: rc.notes,
          followUpNotes,
          nextPlan: rc.next_plan,
          checkedByName: rc.checked_by_name
        };
      }),
      testReferrals: testReferrals.map(tr => ({
        id: tr.id,
        testType: tr.test_type,
        testName: tr.test_name,
        urgency: tr.urgency,
        status: tr.status,
        createdAt: tr.created_at,
        doctorName: tr.doctor_name
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
        vital_signs: vitalSigns,
        follow_up_notes: (() => { try { return typeof exam.follow_up_notes === 'string' ? JSON.parse(exam.follow_up_notes) : (exam.follow_up_notes || []); } catch (e) { return []; } })()
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
             u.name as patient_name, a.vitals_data
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
       
       // Get staff vitals from appointment if available
       let staffVitals = null;
       if (appointments[0].vitals_data) {
         try {
           staffVitals = typeof appointments[0].vitals_data === 'string' ? JSON.parse(appointments[0].vitals_data) : appointments[0].vitals_data;
         } catch (e) {
           staffVitals = null;
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
         },
         staffVitals: staffVitals
       });
} else {
       // return appointment info so doctor can create new examination
       // Get staff vitals from appointment if available
       let staffVitals = null;
       if (appointments[0].vitals_data) {
         try {
           staffVitals = typeof appointments[0].vitals_data === 'string' ? JSON.parse(appointments[0].vitals_data) : appointments[0].vitals_data;
         } catch (e) {
           staffVitals = null;
         }
       }
       
       res.json({
         success: true,
         examination: null,
         appointmentInfo: {
           id: appointmentId,
           patientId: appointment.patient_id,
           patientName: appointment.patient_name,
           appointmentDate: appointment.appointment_date,
           appointmentTime: appointment.appointment_time
         },
         staffVitals: staffVitals
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
     const { search, status } = req.query;
     console.log('patients called for doctorId=', doctorId, 'search=', search, 'status=', status);
     
     const connection = await pool.getConnection();
     
       let query = `
        SELECT DISTINCT
          u.id as patient_id,
          u.name as patient_name,
          u.email as patient_email,
          u.phone as patient_phone,
          u.is_active as is_active,
          u.patient_status as user_patient_status,
          adm.id as admission_id,
          adm.status as admission_status,
          adm.room_number,
          adm.bed_number,
          adm.admission_date,
          adm.discharge_date,
          (SELECT COUNT(*) FROM appointments WHERE patient_id = u.id AND doctor_id = ?) as total_visits,
          (SELECT MAX(appointment_date) FROM appointments WHERE patient_id = u.id AND doctor_id = ?) as last_visit_date,
          (SELECT e.diagnosis FROM examinations e WHERE e.patient_id = u.id AND e.doctor_id = ? ORDER BY e.examination_date DESC, e.id DESC LIMIT 1) as latest_diagnosis,
          (SELECT e.examination_date FROM examinations e WHERE e.patient_id = u.id AND e.doctor_id = ? ORDER BY e.examination_date DESC, e.id DESC LIMIT 1) as latest_diagnosis_date
        FROM appointments a
        JOIN users u ON a.patient_id = u.id
        LEFT JOIN admissions adm ON adm.patient_id = u.id AND adm.status IN ('admitted', 'discharged')
        WHERE a.doctor_id = ?
      `;
       
       const params = [doctorId, doctorId, doctorId, doctorId, doctorId];
      
      if (search) {
        query += ` AND (u.name LIKE ? OR u.email LIKE ?)`;
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern);
      }
      
      if (status && status !== 'all') {
        if (status === 'admitted') {
          query += ` AND (adm.status = 'admitted' OR u.patient_status = 'admitted')`;
        } else if (status === 'non-admitted') {
          query += ` AND (adm.status = 'discharged' OR u.patient_status = 'discharged') = 0 AND (adm.id IS NULL AND u.patient_status NOT IN ('admitted', 'discharged'))`;
        } else if (status === 'discharged') {
          query += ` AND (adm.status = 'discharged' OR u.patient_status = 'discharged')`;
        }
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
          phone: p.patient_phone,
          isActive: p.is_active,
          status: p.admission_status || p.user_patient_status || 'non-admitted',
          admissionId: p.admission_id,
          roomNumber: p.room_number,
          bedNumber: p.bed_number,
          admissionDate: p.admission_date,
          dischargeDate: p.discharge_date,
          totalVisits: p.total_visits,
          lastVisitDate: p.last_visit_date,
          latestDiagnosis: p.latest_diagnosis,
          latestDiagnosisDate: p.latest_diagnosis_date
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

/**
 * POST /api/doctor/admissions
 * Create a patient admission when doctor chooses "Admit Patient" after examination
 * Permission: MANAGE_ADMISSIONS (doctor)
 */
router.post('/admissions', checkPermission(PERMISSIONS.MANAGE_ADMISSIONS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const {
      patient_id,
      examination_id,
      room_number,
      bed_number,
      admission_type = 'scheduled',
      reason_for_admission,
      admitting_diagnosis,
      notes
    } = req.body;

    if (!patient_id || !doctorId) {
      return res.status(400).json({ success: false, message: 'Patient ID and doctor ID are required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(`
      INSERT INTO admissions
      (patient_id, examination_id, doctor_id, room_number, bed_number, admission_type, reason_for_admission, admitting_diagnosis, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      patient_id,
      examination_id || null,
      doctorId,
      room_number || null,
      bed_number || null,
      admission_type,
      reason_for_admission || null,
      admitting_diagnosis || null,
      notes || null
    ]);

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Patient admitted successfully',
      admissionId: result.insertId
    });
  } catch (error) {
    console.error('Error creating admission:', error);
    res.status(500).json({ success: false, message: 'Failed to create admission' });
  }
});

/**
 * GET /api/doctor/admissions
 * List admissions for the doctor's patients
 * Permission: MANAGE_ADMISSIONS (doctor)
 */
router.get('/admissions', checkPermission(PERMISSIONS.MANAGE_ADMISSIONS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { status = 'admitted' } = req.query;

    const connection = await pool.getConnection();

    const [admissions] = await connection.execute(`
      SELECT 
        a.id,
        a.patient_id,
        a.examination_id,
        a.room_number,
        a.bed_number,
        a.admission_type,
        a.reason_for_admission,
        a.admitting_diagnosis,
        a.status,
        a.admission_date,
        a.discharge_date,
        a.notes,
        a.created_at,
        a.updated_at,
        u.name as patient_name,
        u.email as patient_email,
        du.name as doctor_name
      FROM admissions a
      JOIN users u ON a.patient_id = u.id
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users du ON d.user_id = du.id
      WHERE a.doctor_id = ? ${status !== 'all' ? 'AND a.status = ?' : ''}
      ORDER BY a.admission_date DESC
    `, status !== 'all' ? [doctorId, status] : [doctorId]);

    connection.release();

    res.json({
      success: true,
      admissions: admissions.map(a => ({
        id: a.id,
        patientId: a.patient_id,
        patientName: a.patient_name,
        patientEmail: a.patient_email,
        examinationId: a.examination_id,
        doctorName: a.doctor_name,
        roomNumber: a.room_number,
        bedNumber: a.bed_number,
        admissionType: a.admission_type,
        reasonForAdmission: a.reason_for_admission,
        admittingDiagnosis: a.admitting_diagnosis,
        status: a.status,
        admissionDate: a.admission_date,
        dischargeDate: a.discharge_date,
        notes: a.notes,
        createdAt: a.created_at,
        updatedAt: a.updated_at
      }))
    });
  } catch (error) {
    console.error('Error fetching admissions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admissions' });
  }
});

/**
 * PUT /api/doctor/admissions/:id/discharge
 * Mark an admission as discharged
 * Permission: MANAGE_ADMISSIONS (doctor)
 */
router.put('/admissions/:id/discharge', checkPermission(PERMISSIONS.MANAGE_ADMISSIONS), async (req, res) => {
  try {
    const { id } = req.params;
    const dischargeData = req.body;
    const connection = await pool.getConnection();

    const updateFields = ["status = 'discharged'", "discharge_date = ?", "updated_at = NOW()"];
    const params = [new Date()];

    if (dischargeData && typeof dischargeData === 'object') {
      updateFields.push('discharge_data = ?');
      params.push(JSON.stringify(dischargeData));
    }

    const [admissionResult] = await connection.execute(`
      UPDATE admissions SET ${updateFields.join(', ')} WHERE id = ?
    `, [...params, id]);

    if (admissionResult.affectedRows > 0 && dischargeData && dischargeData.patient_id) {
      await connection.execute(
        'UPDATE users SET patient_status = ? WHERE id = ?',
        ['discharged', dischargeData.patient_id]
      );
    }

    connection.release();

    res.json({ success: true, message: 'Patient discharged successfully' });
  } catch (error) {
    console.error('Error discharging patient:', error);
    res.status(500).json({ success: false, message: 'Failed to discharge patient' });
  }
});

/**
 * GET /api/doctor/admissions/:id/discharge/pdf
 * Generate a PDF of the discharge summary
 * Permission: MANAGE_ADMISSIONS (doctor)
 */
router.get('/admissions/:id/discharge/pdf', checkPermission(PERMISSIONS.MANAGE_ADMISSIONS), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [admissions] = await connection.execute(`
      SELECT a.*, u.name as patient_name, u.email as patient_email
      FROM admissions a
      JOIN users u ON a.patient_id = u.id
      WHERE a.id = ?
    `, [id]);

    if (admissions.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Admission not found' });
    }

    const admission = admissions[0];

    let dischargeData = {};
    if (admission.discharge_data) {
      try {
        dischargeData = typeof admission.discharge_data === 'string' ? JSON.parse(admission.discharge_data) : admission.discharge_data;
      } catch (e) {
        dischargeData = {};
      }
    }

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="discharge-${admission.patient_name || 'patient'}.pdf"`);

    doc.pipe(res);

    const pageWidth = doc.page.width;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    try {
      const logoPath = path.join(__dirname, '../../assets/images/logo/logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, margin, 30, { width: 60 });
      }
    } catch (e) {}

    doc
      .fontSize(20)
      .fillColor('#dc2626')
      .text('DISCHARGE SUMMARY', margin + 70, 35);

    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text(`Generated on ${new Date().toLocaleString('en-GB')}`, margin + 70, 55);

    doc.moveDown(2);

    const fieldGap = 18;

function addSectionTitle(title) {
      doc
        .fontSize(12)
        .fillColor('#991b1b')
        .text(title, margin, doc.y);
      doc
        .rect(margin, doc.y + 2, contentWidth, 1)
        .fill('#fecaca');
      doc.moveDown(0.5);
    }

    function addField(label, value, x, y) {
      doc
        .fontSize(9)
        .fillColor('#6b7280')
        .text(label, x, y);
      doc
        .fontSize(10)
        .fillColor('#111827')
        .text(value || 'N/A', x, y + 12);
    }

    const patientName = dischargeData.patient_name || admission.patient_name || 'N/A';
    const patientId = dischargeData.patient_id || admission.patient_id || 'N/A';
    const dateAdmitted = dischargeData.date_of_admission || admission.admission_date ? new Date(admission.admission_date).toLocaleDateString('en-GB') : (dischargeData.date_admitted || 'N/A');
    const dateDischarge = dischargeData.date_of_discharge || admission.discharge_date ? new Date(admission.discharge_date).toLocaleDateString('en-GB') : 'N/A';
    const nextCheckup = dischargeData.date_of_next_checkup || 'N/A';
    const physician = dischargeData.physician_approval || 'N/A';
    const signature = dischargeData.signature || 'N/A';
    const signatureDate = dischargeData.date_of_signature || 'N/A';
    const patientStatus = dischargeData.patient_status || 'Recovered';
    const reasonAdmission = dischargeData.reason_for_admission || 'N/A';
    const diagnosisAdmission = dischargeData.diagnosis_at_admission || admission.admitting_diagnosis || 'N/A';
    const treatmentSummary = dischargeData.treatment_summary || 'N/A';
    const reasonDischarge = dischargeData.reason_for_discharge || 'N/A';
    const diagnosisDischarge = dischargeData.diagnosis_at_discharge || 'N/A';
    const furtherPlan = dischargeData.further_treatment_plan || 'N/A';
    const address = dischargeData.address || 'N/A';
    const phone = dischargeData.phone || admission.phone || 'N/A';
    const email = dischargeData.email || admission.patient_email || 'N/A';
    const medication = dischargeData.medication || 'N/A';
    const dosage = dischargeData.dosage || 'N/A';
    const amount = dischargeData.amount || 'N/A';
    const frequency = dischargeData.frequency || 'N/A';
    const medEndDate = dischargeData.end_date || 'N/A';
    const medNotes = dischargeData.notes || 'N/A';

    addSectionTitle('Patient Information');
    addField('Patient Name', patientName, margin, doc.y);
    addField('Patient ID', `#${patientId}`, margin + contentWidth / 3, doc.y - 12);
    addField('Date Admitted', dateAdmitted, margin + contentWidth / 3 * 2, doc.y - 12);
    doc.y += fieldGap;
    addField('Address', address, margin, doc.y);
    addField('Phone', phone, margin + contentWidth / 3, doc.y);
    addField('Email', email, margin + contentWidth / 3 * 2, doc.y);
    doc.y += fieldGap + 10;

    addSectionTitle('Discharge Details');
    addField('Date of Discharge', dateDischarge, margin, doc.y);
    addField('Date of Next Checkup', nextCheckup, margin + contentWidth / 3, doc.y);
    const statusDisplay = patientStatus.charAt(0).toUpperCase() + patientStatus.slice(1);
    addField('Patient Status', statusDisplay, margin + contentWidth / 3 * 2, doc.y);
    doc.y += fieldGap;
    addField('Physician Approval', physician, margin, doc.y);
    addField('Signature Date', signatureDate, margin + contentWidth / 3, doc.y);
    addField('Signature', signature, margin + contentWidth / 3 * 2, doc.y);
    doc.y += fieldGap + 10;

    addSectionTitle('Clinical Information');
    addField('Reason for Admission', reasonAdmission, margin, doc.y);
    addField('Diagnosis at Admission', diagnosisAdmission, margin + contentWidth / 3, doc.y);
    doc.y += fieldGap;
    addField('Treatment Summary', treatmentSummary, margin, doc.y);
    addField('Reason for Discharge', reasonDischarge, margin + contentWidth / 3, doc.y);
    doc.y += fieldGap;
    addField('Diagnosis at Discharge', diagnosisDischarge, margin, doc.y);
    addField('Further Treatment Plan', furtherPlan, margin + contentWidth / 3, doc.y);
    doc.y += fieldGap + 10;

    addSectionTitle('Medication');
    addField('Medication Name', medication, margin, doc.y);
    addField('Dosage', dosage, margin + contentWidth / 3, doc.y);
    addField('Frequency', frequency, margin + contentWidth / 3 * 2, doc.y);
    doc.y += fieldGap;
    addField('Amount', amount, margin, doc.y);
    addField('End Date', medEndDate, margin + contentWidth / 3, doc.y);
    addField('Notes', medNotes, margin + contentWidth / 3 * 2, doc.y);
    doc.y += fieldGap + 10;

    doc
      .rect(margin, doc.y, contentWidth, 40)
      .fill('#f9f9f9')
      .stroke('#e5e7eb');

    doc
      .fontSize(10)
      .fillColor('#374151')
      .text('Signature: ___________________', margin + 10, doc.y + 20);

    doc
      .fontSize(10)
      .fillColor('#374151')
      .text(`Date: ${signatureDate}`, margin + contentWidth / 2, doc.y + 20);

    doc.y = doc.page.height - 50;
    doc
      .fontSize(9)
      .fillColor('#9ca3af')
      .text('This document was generated electronically and is valid without physical signature.', margin, doc.y);

    doc.end();

    connection.release();
  } catch (error) {
    console.error('Error generating discharge PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
  }
});

/**
 * GET /api/doctor/round-checks
 * Get round-check records for the doctor
 * Permission: MANAGE_ROUND_CHECKS (doctor)
 */
router.get('/round-checks', checkPermission(PERMISSIONS.MANAGE_ROUND_CHECKS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { patient_id, admission_id, check_type, status } = req.query;

    let query = `
      SELECT rc.*, u.name as patient_name, a.status as admission_status
      FROM round_checks rc
      JOIN users u ON rc.patient_id = u.id
      LEFT JOIN admissions a ON rc.admission_id = a.id
      WHERE rc.checked_by = ?
         OR rc.admission_id IN (
            SELECT id FROM admissions WHERE doctor_id = ? AND status = 'admitted'
         )
    `;
    const params = [doctorId, doctorId];

    if (patient_id) {
      query += ' AND rc.patient_id = ?';
      params.push(patient_id);
    }
    if (admission_id) {
      query += ' AND rc.admission_id = ?';
      params.push(admission_id);
    }
    if (check_type && check_type !== 'all') {
      query += ' AND rc.check_type = ?';
      params.push(check_type);
    }
    if (status && status !== 'all') {
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
      let fluidBalance = null;
      if (c.fluid_balance) {
        try {
          fluidBalance = typeof c.fluid_balance === 'string' ? JSON.parse(c.fluid_balance) : c.fluid_balance;
        } catch (e) {}
      }
      let drugChat = null;
      if (c.drug_chat) {
        try {
          drugChat = typeof c.drug_chat === 'string' ? JSON.parse(c.drug_chat) : c.drug_chat;
        } catch (e) {}
      }
      let followUpNotes = null;
      if (c.follow_up_notes) {
        try {
          followUpNotes = typeof c.follow_up_notes === 'string' ? JSON.parse(c.follow_up_notes) : c.follow_up_notes;
        } catch (e) {}
      }
      return {
        ...c,
        vital_signs: vitalSigns,
        fluid_balance: fluidBalance,
        drug_chat: drugChat,
        follow_up_notes: followUpNotes
      };
    });

    res.json({ success: true, roundChecks: parsedChecks });
  } catch (error) {
    console.error('Error fetching round checks:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch round checks' });
  }
});

/**
 * POST /api/doctor/round-checks
 * Create a new round-check record (doctor or nurse)
 * Permission: MANAGE_ROUND_CHECKS (doctor)
 */
router.post('/round-checks', checkPermission(PERMISSIONS.MANAGE_ROUND_CHECKS), async (req, res) => {
  try {
    const userId = req.session.userId || req.session.doctorId;
    const {
      patient_id,
      admission_id,
      examination_id,
      check_type = 'doctor',
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
      userId,
      check_type,
      notes || null,
      vital_signs ? JSON.stringify(vital_signs) : null,
      next_plan || null,
      status
    ]);

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Round check recorded successfully',
      roundCheckId: result.insertId
    });
  } catch (error) {
    console.error('Error creating round check:', error);
    res.status(500).json({ success: false, message: 'Failed to create round check' });
  }
});

/**
 * PUT /api/doctor/round-checks/:id
 * Doctor can append follow-up notes and change status, but CANNOT edit vital_signs or original notes
 * Permission: MANAGE_ROUND_CHECKS (doctor)
 */
router.put('/round-checks/:id', checkPermission(PERMISSIONS.MANAGE_ROUND_CHECKS), async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.session.doctorId;
    const { status, next_plan, follow_up_note, notes, fluid_chat, drug_chat } = req.body;

    const connection = await pool.getConnection();

    // Fetch the current record to verify it exists and check check_type
    const [existing] = await connection.execute(
      'SELECT id, checked_by, check_type, follow_up_notes FROM round_checks WHERE id = ?',
      [id]
    );

    if (!existing || existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Round check not found' });
    }

    const record = existing[0];

    // Build allowed updates only
    const updates = [];
    const values = [];

    // Doctors CANNOT edit vital_signs or original notes - only append follow_up_note or change status/next_plan
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
        userId: doctorId,
        checkType: 'doctor',
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

    // Prevent updating vital_signs or original notes
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

    res.json({ success: true, message: 'Doctor follow-up note added successfully' });
  } catch (error) {
    console.error('Error updating round check by doctor:', error);
    res.status(500).json({ success: false, message: 'Failed to update round check' });
  }
});

/**
 * GET /api/doctor/admitted-patients
 * Get admitted patients for doctor round checks
 * Permission: MANAGE_ROUND_CHECKS (doctor)
 */
router.get('/admitted-patients', checkPermission(PERMISSIONS.MANAGE_ROUND_CHECKS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const connection = await pool.getConnection();

    const [patients] = await connection.execute(`
      SELECT 
        a.id as admission_id,
        a.patient_id,
        a.room_number,
        a.bed_number,
        a.admission_date,
        a.status as admission_status,
        u.name as patient_name,
        u.email as patient_email,
        a.reason_for_admission,
        a.admitting_diagnosis
      FROM admissions a
      JOIN users u ON a.patient_id = u.id
      WHERE a.status = 'admitted'
      ORDER BY a.admission_date DESC
    `);

    connection.release();
    res.json({ success: true, admittedPatients: patients });
  } catch (error) {
    console.error('Error fetching admitted patients for doctor:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admitted patients' });
  }
});

/**
 * GET /api/doctor/medications
 * Get prescriptions for the doctor's patients
 * Permission: VIEW_MEDICATIONS (doctor)
 */
router.get('/medications', checkPermission(PERMISSIONS.VIEW_MEDICATIONS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { patient_id, status } = req.query;

    let query = `
      SELECT m.*, 
        u_patient.name as patient_name,
        u_doctor.name as doctor_name
      FROM medications m
      JOIN users u_patient ON m.patient_id = u_patient.id
      JOIN doctors d ON m.doctor_id = d.id
      JOIN users u_doctor ON d.user_id = u_doctor.id
      WHERE m.doctor_id = ?
    `;
    const params = [doctorId];

    if (patient_id) {
      query += ' AND m.patient_id = ?';
      params.push(patient_id);
    }
    if (status && status !== 'all') {
      query += ' AND m.status = ?';
      params.push(status);
    }

    query += ' ORDER BY m.created_at DESC';

    const connection = await pool.getConnection();
    const [medications] = await connection.execute(query, params);
    connection.release();

    res.json({
      success: true,
      medications: medications.map(m => ({
        id: m.id,
        medicationName: m.medication_name,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions,
        refillsRemaining: m.refills_remaining,
        status: m.status,
        prescribedDate: m.prescribed_date,
        expiryDate: m.expiry_date,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
        patient: { id: m.patient_id, name: m.patient_name },
        doctor: { id: m.doctor_id, name: m.doctor_name }
      }))
    });
  } catch (error) {
    console.error('Error fetching medications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch medications' });
  }
});

/**
 * GET /api/doctor/medications/:id
 * Get specific prescription
 * Permission: VIEW_MEDICATIONS (doctor)
 */
router.get('/medications/:id', checkPermission(PERMISSIONS.VIEW_MEDICATIONS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;

    const connection = await pool.getConnection();
    const [medications] = await connection.execute(`
      SELECT m.*, 
        u_patient.name as patient_name,
        u_doctor.name as doctor_name
      FROM medications m
      JOIN users u_patient ON m.patient_id = u_patient.id
      JOIN doctors d ON m.doctor_id = d.id
      JOIN users u_doctor ON d.user_id = u_doctor.id
      WHERE m.id = ? AND m.doctor_id = ?
    `, [id, doctorId]);

    connection.release();

    if (medications.length === 0) {
      return res.status(404).json({ success: false, message: 'Medication not found' });
    }

    const m = medications[0];
    res.json({
      success: true,
      medication: {
        id: m.id,
        medicationName: m.medication_name,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions,
        refillsRemaining: m.refills_remaining,
        status: m.status,
        prescribedDate: m.prescribed_date,
        expiryDate: m.expiry_date,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
        patient: { id: m.patient_id, name: m.patient_name },
        doctor: { id: m.doctor_id, name: m.doctor_name }
      }
    });
  } catch (error) {
    console.error('Error fetching medication:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch medication' });
  }
});

/**
 * POST /api/doctor/medications
 * Create a new prescription
 * Permission: PRESCRIBE_MEDICATION (doctor)
 */
router.post('/medications', checkPermission(PERMISSIONS.PRESCRIBE_MEDICATION), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { patient_id, appointment_id, medication_name, dosage, frequency, duration, instructions, refills_remaining = 0, prescribed_date, expiry_date } = req.body;

    if (!patient_id || !medication_name || !dosage || !frequency) {
      return res.status(400).json({ success: false, message: 'Patient, medication name, dosage, and frequency are required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(`
      INSERT INTO medications (patient_id, doctor_id, appointment_id, medication_name, dosage, frequency, duration, instructions, refills_remaining, status, prescribed_date, expiry_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `, [
      patient_id,
      doctorId,
      appointment_id || null,
      medication_name,
      dosage,
      frequency,
      duration || null,
      instructions || null,
      refills_remaining,
      prescribed_date || new Date().toISOString().split('T')[0],
      expiry_date || null
    ]);

    connection.release();

    res.json({ success: true, message: 'Prescription created successfully', medicationId: result.insertId });
  } catch (error) {
    console.error('Error creating medication:', error);
    res.status(500).json({ success: false, message: 'Failed to create prescription' });
  }
});

/**
 * PUT /api/doctor/medications/:id
 * Update a prescription
 * Permission: PRESCRIBE_MEDICATION (doctor)
 */
router.put('/medications/:id', checkPermission(PERMISSIONS.PRESCRIBE_MEDICATION), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    const { medication_name, dosage, frequency, duration, instructions, refills_remaining } = req.body;

    if (!medication_name || !dosage || !frequency) {
      return res.status(400).json({ success: false, message: 'Medication name, dosage, and frequency are required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(`
      UPDATE medications SET 
        medication_name = ?, dosage = ?, frequency = ?, duration = ?, instructions = ?, refills_remaining = ?, updated_at = NOW()
      WHERE id = ? AND doctor_id = ?
    `, [medication_name, dosage, frequency, duration || null, instructions || null, refills_remaining || 0, id, doctorId]);

    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Medication not found or access denied' });
    }

    res.json({ success: true, message: 'Prescription updated successfully' });
  } catch (error) {
    console.error('Error updating medication:', error);
    res.status(500).json({ success: false, message: 'Failed to update prescription' });
  }
});

/**
 * POST /api/doctor/medications/:id/cancel
 * Cancel/stop a prescription
 * Permission: PRESCRIBE_MEDICATION (doctor)
 */
router.post('/medications/:id/cancel', checkPermission(PERMISSIONS.PRESCRIBE_MEDICATION), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;

    const connection = await pool.getConnection();

    const [result] = await connection.execute(`
      UPDATE medications SET status = 'stopped', updated_at = NOW()
      WHERE id = ? AND doctor_id = ?
    `, [id, doctorId]);

    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Medication not found or access denied' });
    }

    res.json({ success: true, message: 'Prescription stopped successfully' });
  } catch (error) {
    console.error('Error cancelling medication:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel prescription' });
  }
});

/**
 * POST /api/doctor/medications/:id/renew
 * Renew a prescription
 * Permission: PRESCRIBE_MEDICATION (doctor)
 */
router.post('/medications/:id/renew', checkPermission(PERMISSIONS.PRESCRIBE_MEDICATION), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;

    const connection = await pool.getConnection();

    const [result] = await connection.execute(`
      UPDATE medications SET status = 'active', refills_remaining = refills_remaining + 1, updated_at = NOW()
      WHERE id = ? AND doctor_id = ?
    `, [id, doctorId]);

    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Medication not found or access denied' });
    }

    res.json({ success: true, message: 'Prescription renewed successfully' });
  } catch (error) {
    console.error('Error renewing medication:', error);
    res.status(500).json({ success: false, message: 'Failed to renew prescription' });
  }
});

/**
 * POST /api/doctor/medications/:id/refill
 * Add a refill to a prescription
 * Permission: PRESCRIBE_MEDICATION (doctor)
 */
router.post('/medications/:id/refill', checkPermission(PERMISSIONS.PRESCRIBE_MEDICATION), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    const { refills = 1 } = req.body;

    const connection = await pool.getConnection();

    const [result] = await connection.execute(`
      UPDATE medications SET refills_remaining = refills_remaining + ?, updated_at = NOW()
      WHERE id = ? AND doctor_id = ?
    `, [refills, id, doctorId]);

    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Medication not found or access denied' });
    }

    res.json({ success: true, message: 'Refill added successfully' });
  } catch (error) {
    console.error('Error adding refill:', error);
    res.status(500).json({ success: false, message: 'Failed to add refill' });
  }
});

/**
 * GET /api/doctor/patients/:id/medications
 * Get all medications for a specific patient
 * Permission: VIEW_PATIENT_RECORDS (doctor)
 */
router.get('/patients/:id/medications', checkPermission(PERMISSIONS.VIEW_PATIENT_RECORDS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id: patientId } = req.params;

    const connection = await pool.getConnection();

    const [medications] = await connection.execute(`
      SELECT m.*, u_doctor.name as doctor_name
      FROM medications m
      JOIN doctors d ON m.doctor_id = d.id
      JOIN users u_doctor ON d.user_id = u_doctor.id
      WHERE m.patient_id = ? AND m.doctor_id = ?
      ORDER BY m.created_at DESC
    `, [patientId, doctorId]);

    connection.release();

    res.json({
      success: true,
      medications: medications.map(m => ({
        id: m.id,
        medicationName: m.medication_name,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions,
        refillsRemaining: m.refills_remaining,
        status: m.status,
        prescribedDate: m.prescribed_date,
        expiryDate: m.expiry_date,
        createdAt: m.created_at,
        doctorName: m.doctor_name
      }))
    });
  } catch (error) {
    console.error('Error fetching patient medications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patient medications' });
  }
});

module.exports = router;


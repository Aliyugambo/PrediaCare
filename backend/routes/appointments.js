/**
 * Appointments API Routes
 * Provides endpoints for patients to view and book appointments
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');
const { sendAppointmentNotificationToDoctor } = require('../config/email');

/**
 * GET /api/appointments
 * Get all appointments for the logged-in patient
 * Permission: VIEW_OWN_APPOINTMENTS (patient)
 */
router.get('/', checkPermission(PERMISSIONS.VIEW_OWN_APPOINTMENTS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { status, limit = 20, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.reason,
        a.notes,
        a.created_at,
        a.location as appointment_location,
        d.id as doctor_id,
        d.specialization,
        d.location as doctor_location,
        u.name as doctor_name
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE a.patient_id = ?
    `;    
    const params = [patientId];
    
    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    // Use query() instead of execute() to avoid MySQL prepared statement LIMIT issues
    const [appointments] = await connection.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM appointments WHERE patient_id = ?';
    const countParams = [patientId];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({
      success: true,
      count: appointments.length,
      total: countResult[0].total,
      appointments: appointments.map(apt => ({
        id: apt.id,
        date: apt.appointment_date,
        time: apt.appointment_time,
        status: apt.status,
        reason: apt.reason,
        notes: apt.notes,
        createdAt: apt.created_at,
        doctor: {
          id: apt.doctor_id,
          name: apt.doctor_name,
          specialization: apt.specialization,
          location: apt.appointment_location || apt.doctor_location || 'Main Clinic'
        }
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
 * GET /api/appointments/next
 * Get next upcoming appointment for the logged-in patient
 * Permission: VIEW_NEXT_APPOINTMENT (patient)
 */
router.get('/next', checkPermission(PERMISSIONS.VIEW_NEXT_APPOINTMENT), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const connection = await pool.getConnection();
    
    const [appointments] = await connection.execute(`
      SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.reason,
        a.notes,
        a.created_at,
        a.location as appointment_location,
        d.id as doctor_id,
        d.specialization,
        d.location as doctor_location,
        u.name as doctor_name,
        u.email as doctor_email
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE a.patient_id = ? 
        AND a.appointment_date >= CURDATE()
        AND a.status IN ('scheduled', 'confirmed')
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
      LIMIT 1
    `, [patientId]);
    
    connection.release();
    
    if (appointments.length === 0) {
      return res.json({
        success: true,
        hasAppointment: false,
        message: 'No upcoming appointments'
      });
    }
    
    const apt = appointments[0];
    
    res.json({
      success: true,
      hasAppointment: true,
      appointment: {
        id: apt.id,
        date: apt.appointment_date,
        time: apt.appointment_time,
        status: apt.status,
        reason: apt.reason,
        notes: apt.notes,
        createdAt: apt.created_at,
        doctor: {
          id: apt.doctor_id,
          name: apt.doctor_name,
          email: apt.doctor_email,
          specialization: apt.specialization,
          location: apt.appointment_location || apt.doctor_location || 'Main Clinic'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching next appointment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch next appointment' 
    });
  }
});

/**
 * POST /api/appointments
 * Book a new appointment
 * Permission: BOOK_APPOINTMENT (patient)
 */
router.post('/', checkPermission(PERMISSIONS.BOOK_APPOINTMENT), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { doctor_id, appointment_date, appointment_time, reason, location } = req.body;
    
    console.log('\n=== POST /appointments ===' );
    console.log('Request headers:', { 
      'content-type': req.headers['content-type'],
      'cookie': req.headers['cookie'] ? 'present' : 'missing'
    });
    console.log('Session ID:', req.sessionID);
    console.log('Session data:', {
      userId: req.session.userId,
      userRole: req.session.userRole,
      userEmail: req.session.userEmail
    });
    console.log('Patient ID:', patientId);
    console.log('Request body:', { doctor_id, appointment_date, appointment_time, reason });
    
    // Validate required fields
    if (!doctor_id || !appointment_date || !appointment_time) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        success: false, 
        message: 'Doctor ID, date, and time are required' 
      });
    }
    
    const connection = await pool.getConnection();
    
    // Verify doctor exists and is active
    const [doctors] = await connection.execute(`
      SELECT d.id, d.available_days, d.available_time_start, d.available_time_end, u.name as doctor_name, u.email as doctor_email
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = ? AND d.is_active = TRUE
    `, [doctor_id]);
    
    if (doctors.length === 0) {
      console.log('❌ Doctor not found or not active:', doctor_id);
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Doctor not found or not available' 
      });
    }
    
    const doctor = doctors[0];
    console.log('✅ Doctor found:', { doctor_id: doctor.id, available_days: doctor.available_days, available_time_start: doctor.available_time_start, available_time_end: doctor.available_time_end });
    
    // Check if time is within available hours
    const availableDays = doctor.available_days.split(',');
    const requestedDate = new Date(appointment_date);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat','Sun'];
    const requestedDay = dayNames[requestedDate.getDay()];
    
    console.log('Day check:', { appointment_date, requestedDay, availableDays });
    const requestedTime = new Date(`1970-01-01T${appointment_time}`);
    const startTime = new Date(`1970-01-01T${doctor.available_time_start}`);
    const endTime = new Date(`1970-01-01T${doctor.available_time_end}`);
    
    console.log('Time check:', { appointment_time, startTime: doctor.available_time_start, endTime: doctor.available_time_end, isValid: requestedTime >= startTime && requestedTime <= endTime });
    
    if (requestedTime < startTime || requestedTime > endTime) {
      console.log('❌ Time outside available hours');
      connection.release();
      return res.status(400).json({ 
        success: false, 
        message: `Time must be between ${doctor.available_time_start} and ${doctor.available_time_end}` 
      });
    }
    
    // Check if slot is already booked
    const [existingAppointments] = await connection.execute(`
      SELECT id FROM appointments 
      WHERE doctor_id = ? 
        AND appointment_date = ? 
        AND appointment_time = ? 
        AND status IN ('scheduled', 'confirmed')
    `, [doctor_id, appointment_date, appointment_time]);
    
    if (existingAppointments.length > 0) {
      console.log('❌ Slot already booked');
      connection.release();
      return res.status(409).json({ 
        success: false, 
        message: 'This time slot is already booked. Please choose another time.' 
      });
    }
    
    // Check if patient already has an appointment at this time
    const [patientConflict] = await connection.execute(`
      SELECT id FROM appointments 
      WHERE patient_id = ? 
        AND appointment_date = ? 
        AND appointment_time = ?
        AND status NOT IN ('cancelled', 'completed')
    `, [patientId, appointment_date, appointment_time]);
    
    if (patientConflict.length > 0) {
      console.log('❌ Patient already has appointment at this time');
      connection.release();
      return res.status(409).json({ 
        success: false, 
        message: 'You already have an appointment at this time.' 
      });
    }
    
    // Check if doctor already has 5 appointments on this day (max limit)
    const [dayAppointments] = await connection.execute(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE doctor_id = ? 
        AND appointment_date = ? 
        AND status IN ('scheduled', 'confirmed')
    `, [doctor_id, appointment_date]);
    
    if (dayAppointments[0].count >= 5) {
      console.log('❌ Doctor already has 5 appointments on this day');
      connection.release();
      return res.status(409).json({ 
        success: false, 
        message: 'Doctor has reached maximum appointments (5) for this day. Please choose another date.' 
      });
    }
    
    // Create the appointment
    const [result] = await connection.execute(`
      INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status, reason, location)
      VALUES (?, ?, ?, ?, 'scheduled', ?, ?)
    `, [patientId, doctor_id, appointment_date, appointment_time, reason || null, location || null]);
    
    console.log(`✅ New appointment created: appointmentId=${result.insertId} patient=${patientId} doctor=${doctor_id} date=${appointment_date} time=${appointment_time}`);
    
    // Get patient details for email notification (patients are stored in users table with role='patient')
    const [patients] = await connection.execute(`
      SELECT name as patient_name, email as patient_email
      FROM users
      WHERE id = ? AND role = 'patient'
    `, [patientId]);
    
    const patient = patients[0];
    
    // Send email notification to doctor (async, don't wait)
    if (doctor.doctor_email && patient) {
      sendAppointmentNotificationToDoctor(
        { email: doctor.doctor_email, name: doctor.doctor_name },
        { name: patient.patient_name, email: patient.patient_email },
        appointment_date,
        appointment_time,
        reason
      ).catch(err => console.error('Email notification error:', err.message));
    }
    
    connection.release();
    
    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      appointmentId: result.insertId
    });
  } catch (error) {
    console.error('Error booking appointment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to book appointment' 
    });
  }
});

/**
 * POST /api/appointments/:id/cancel
 * Cancel an existing appointment
 * Permission: CANCEL_APPOINTMENT (patient)
 */
router.post('/:id/cancel', checkPermission(PERMISSIONS.CANCEL_APPOINTMENT), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { id } = req.params;
    const { reason } = req.body;
    
    const connection = await pool.getConnection();
    
    // Verify appointment exists and belongs to this patient
    const [appointments] = await connection.execute(`
      SELECT id, status FROM appointments 
      WHERE id = ? AND patient_id = ?
    `, [id, patientId]);
    
    if (appointments.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Appointment not found' 
      });
    }
    
    const appointment = appointments[0];
    
    if (appointment.status === 'cancelled') {
      connection.release();
      return res.status(400).json({ 
        success: false, 
        message: 'This appointment is already cancelled' 
      });
    }
    
    if (appointment.status === 'completed') {
      connection.release();
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot cancel a completed appointment' 
      });
    }
    
    // Cancel the appointment
    await connection.execute(`
      UPDATE appointments SET status = 'cancelled', notes = ? WHERE id = ?
    `, [reason ? `Cancelled: ${reason}` : 'Cancelled by patient', id]);
    
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
 * GET /api/appointments/:id
 * Get specific appointment details
 * Permission: VIEW_OWN_APPOINTMENTS (patient)
 */
router.get('/:id', checkPermission(PERMISSIONS.VIEW_OWN_APPOINTMENTS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [appointments] = await connection.execute(`
      SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.reason,
        a.notes,
        a.created_at,
        a.location as appointment_location,
        d.id as doctor_id,
        d.specialization,
        d.location as doctor_location,
        u.name as doctor_name,
        u.email as doctor_email
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE a.id = ? AND a.patient_id = ?
    `, [id, patientId]);
    
    connection.release();
    
    if (appointments.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Appointment not found' 
      });
    }
    
    const apt = appointments[0];
    
    res.json({
      success: true,
      appointment: {
        id: apt.id,
        date: apt.appointment_date,
        time: apt.appointment_time,
        status: apt.status,
        reason: apt.reason,
        notes: apt.notes,
        createdAt: apt.created_at,
        doctor: {
          id: apt.doctor_id,
          name: apt.doctor_name,
          email: apt.doctor_email,
          specialization: apt.specialization,
          location: apt.appointment_location || apt.doctor_location || 'Main Clinic'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch appointment details' 
    });
  }
});

module.exports = router;


/**
 * Customer Care Staff Routes
 * Handles walk-in patient registration and test referrals viewing
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');

// GET all test referrals (both doctor referrals and walk-ins)
router.get('/test-referrals', checkPermission(PERMISSIONS.VIEW_ALL_TEST_REFERRALS), async (req, res) => {
  try {
    const { status, search } = req.query;
    
    const connection = await pool.getConnection();
    
    let query = `
      SELECT 
        tr.id,
        tr.test_name,
        tr.test_type,
        tr.reason_for_test,
        tr.urgency,
        tr.status,
        tr.created_at,
        tr.doctor_id,
        u.name as patient_name,
        u.email as patient_email,
        d.user_id as doctor_user_id,
        doctor.name as doctor_name
      FROM test_referrals tr
      LEFT JOIN users u ON tr.patient_id = u.id
      LEFT JOIN doctors d ON tr.doctor_id = d.id
      LEFT JOIN users doctor ON d.user_id = doctor.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (status && status !== 'all') {
      query += ' AND tr.status = ?';
      params.push(status);
    }
    
    if (search) {
      query += ' AND (u.name LIKE ? OR tr.test_name LIKE ? OR doctor.name LIKE ?)';
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
    }
    
    query += ' ORDER BY tr.created_at DESC';
    
    const [referrals] = await connection.execute(query, params);
    
    // Also get walk-in patients
    let walkinQuery = `
      SELECT 
        wp.id,
        wp.first_name,
        wp.last_name,
        wp.date_of_birth,
        wp.phone,
        wp.email,
        wp.address,
        wp.test_type,
        wp.test_name,
        wp.status,
        wp.registration_date,
        wp.referred_by_doctor
      FROM walkin_patients wp
      WHERE 1=1
    `;
    
    const walkinParams = [];
    
    if (status && status !== 'all') {
      walkinQuery += ' AND wp.status = ?';
      walkinParams.push(status);
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
      referrals: referrals,
      walkins: walkins
    });
  } catch (error) {
    console.error('Error fetching test referrals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test referrals'
    });
  }
});

// POST register walk-in patient
router.post('/walkin-patients', checkPermission(PERMISSIONS.REGISTER_WALKIN_PATIENTS), async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      date_of_birth,
      gender,
      phone,
      email,
      address,
      test_type,
      test_name,
      referred_by_doctor,
      doctor_id,
      test_referral_id
    } = req.body;
    
    if (!first_name || !last_name || !test_type || !test_name) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, test type and test name are required'
      });
    }
    
    const connection = await pool.getConnection();
    
    const [result] = await connection.execute(`
      INSERT INTO walkin_patients 
      (first_name, last_name, date_of_birth, gender, phone, email, address, test_type, test_name, referred_by_doctor, doctor_id, test_referral_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered')
    `, [
      first_name,
      last_name,
      date_of_birth || null,
      gender || null,
      phone || null,
      email || null,
      address || null,
      test_type,
      test_name,
      referred_by_doctor || false,
      doctor_id || null,
      test_referral_id || null
    ]);
    
    connection.release();
    
    res.status(201).json({
      success: true,
      message: 'Walk-in patient registered successfully',
      patientId: result.insertId
    });
  } catch (error) {
    console.error('Error registering walk-in patient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register walk-in patient'
    });
  }
});

// GET walk-in patients
router.get('/walkin-patients', checkPermission(PERMISSIONS.VIEW_WALKIN_REGISTRATIONS), async (req, res) => {
  try {
    const { status, search } = req.query;
    
    const connection = await pool.getConnection();
    
    let query = `
      SELECT 
        wp.*,
        d.user_id as doctor_user_id,
        doctor.name as doctor_name
      FROM walkin_patients wp
      LEFT JOIN doctors d ON wp.doctor_id = d.id
      LEFT JOIN users doctor ON d.user_id = doctor.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (status && status !== 'all') {
      query += ' AND wp.status = ?';
      params.push(status);
    }
    
    if (search) {
      query += ' AND (wp.first_name LIKE ? OR wp.last_name LIKE ? OR wp.phone LIKE ? OR wp.email LIKE ?)';
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%');
    }
    
    query += ' ORDER BY wp.registration_date DESC';
    
    const [patients] = await connection.execute(query, params);
    
    connection.release();
    
    res.json({
      success: true,
      patients: patients
    });
  } catch (error) {
    console.error('Error fetching walk-in patients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch walk-in patients'
    });
  }
});

// PUT update walk-in patient status
router.put('/walkin-patients/:id/status', checkPermission(PERMISSIONS.REGISTER_WALKIN_PATIENTS), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const connection = await pool.getConnection();
    
    let query = 'UPDATE walkin_patients SET status = ?';
    let params = [status];
    
    if (status === 'completed') {
      query += ', completed_date = NOW()';
    }
    
    query += ' WHERE id = ?';
    params.push(id);
    
    await connection.execute(query, params);
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Walk-in patient status updated'
    });
  } catch (error) {
    console.error('Error updating walk-in patient status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status'
    });
  }
});

// GET single walk-in patient
router.get('/walkin-patients/:id', checkPermission(PERMISSIONS.VIEW_WALKIN_REGISTRATIONS), async (req, res) => {
  try {
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [patients] = await connection.execute(`
      SELECT 
        wp.*,
        d.user_id as doctor_user_id,
        doctor.name as doctor_name
      FROM walkin_patients wp
      LEFT JOIN doctors d ON wp.doctor_id = d.id
      LEFT JOIN users doctor ON d.user_id = doctor.id
      WHERE wp.id = ?
    `, [id]);
    
    connection.release();
    
    if (patients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Walk-in patient not found'
      });
    }
    
    res.json({
      success: true,
      patient: patients[0]
    });
  } catch (error) {
    console.error('Error fetching walk-in patient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch walk-in patient'
    });
  }
});

/**
 * GET /api/customer-care/appointments
 * Get all appointments (for customer-care to view)
 * Permission: VIEW_ALL_APPOINTMENTS
 */
router.get('/appointments', checkPermission(PERMISSIONS.VIEW_ALL_APPOINTMENTS), async (req, res) => {
  try {
    const { status, date, doctor_id, patient_id, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        a.*,
        u_patient.name as patient_name,
        u_patient.email as patient_email,
        u_doctor.name as doctor_name,
        d.specialization
      FROM appointments a
      JOIN users u_patient ON a.patient_id = u_patient.id
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users u_doctor ON d.user_id = u_doctor.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (date) {
      query += ' AND a.appointment_date = ?';
      params.push(date);
    }
    if (doctor_id) {
      query += ' AND a.doctor_id = ?';
      params.push(doctor_id);
    }
    if (patient_id) {
      query += ' AND a.patient_id = ?';
      params.push(patient_id);
    }

    query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const connection = await pool.getConnection();
    const [appointments] = await connection.query(query, params);

    let countQuery = 'SELECT COUNT(*) as total FROM appointments WHERE 1=1';
    const countParams = [];
    if (status && status !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    if (date) {
      countQuery += ' AND appointment_date = ?';
      countParams.push(date);
    }
    if (doctor_id) {
      countQuery += ' AND doctor_id = ?';
      countParams.push(doctor_id);
    }
    if (patient_id) {
      countQuery += ' AND patient_id = ?';
      countParams.push(patient_id);
    }
    const [countResult] = await connection.execute(countQuery, countParams);

    connection.release();

    res.json({
      success: true,
      appointments: appointments.map(a => ({
        id: a.id,
        date: a.appointment_date,
        time: a.appointment_time,
        status: a.status,
        reason: a.reason,
        notes: a.notes,
        location: a.location,
        patient: { id: a.patient_id, name: a.patient_name, email: a.patient_email },
        doctor: { id: a.doctor_id, name: a.doctor_name, specialization: a.specialization }
      })),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/customer-care/appointments
 * Book a new appointment on behalf of a patient
 * Permission: BOOK_APPOINTMENT
 */
router.post('/appointments', checkPermission(PERMISSIONS.BOOK_APPOINTMENT), async (req, res) => {
  try {
    const { patient_id, doctor_id, appointment_date, appointment_time, reason, location } = req.body;

    if (!patient_id || !doctor_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: 'Patient, doctor, date, and time are required'
      });
    }

    const connection = await pool.getConnection();

    // Verify doctor exists and is active
    const [doctors] = await connection.execute(`
      SELECT d.id, d.available_days, d.available_time_start, d.available_time_end, u.name as doctor_name
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = ? AND d.is_active = TRUE
    `, [doctor_id]);

    if (doctors.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Doctor not found or not available'
      });
    }

    const doctor = doctors[0];

    // Check if time is within available hours
    const availableDays = doctor.available_days.split(',');
    const requestedDate = new Date(appointment_date);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const requestedDay = dayNames[requestedDate.getDay()];

    const requestedTime = new Date(`1970-01-01T${appointment_time}`);
    const startTime = new Date(`1970-01-01T${doctor.available_time_start}`);
    const endTime = new Date(`1970-01-01T${doctor.available_time_end}`);

    if (!availableDays.includes(requestedDay)) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: `Doctor is not available on ${requestedDay}s`
      });
    }

    if (requestedTime < startTime || requestedTime > endTime) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: `Time must be between ${doctor.available_time_start} and ${doctor.available_time_end}`
      });
    }

    // Check if slot is already booked
    const [existingAppointments] = await connection.execute(`
      SELECT id FROM appointments
      WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
      AND status IN ('scheduled', 'confirmed')
    `, [doctor_id, appointment_date, appointment_time]);

    if (existingAppointments.length > 0) {
      connection.release();
      return res.status(409).json({
        success: false,
        message: 'This time slot is already booked. Please choose another time.'
      });
    }

    // Check if patient already has an appointment at this time
    const [patientConflict] = await connection.execute(`
      SELECT id FROM appointments
      WHERE patient_id = ? AND appointment_date = ? AND appointment_time = ?
      AND status NOT IN ('cancelled', 'completed')
    `, [patient_id, appointment_date, appointment_time]);

    if (patientConflict.length > 0) {
      connection.release();
      return res.status(409).json({
        success: false,
        message: 'This patient already has an appointment at this time.'
      });
    }

    // Check doctor max appointments per day (5)
    const [dayAppointments] = await connection.execute(`
      SELECT COUNT(*) as count FROM appointments
      WHERE doctor_id = ? AND appointment_date = ? AND status IN ('scheduled', 'confirmed')
    `, [doctor_id, appointment_date]);

    if (dayAppointments[0].count >= 5) {
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
    `, [patient_id, doctor_id, appointment_date, appointment_time, reason || null, location || null]);

    connection.release();

    console.log(`✅ Appointment booked by customer_care: id=${result.insertId} patient=${patient_id} doctor=${doctor_id} date=${appointment_date}`);

    res.json({
      success: true,
      message: 'Appointment booked successfully',
      appointmentId: result.insertId
    });
  } catch (err) {
    console.error('Error booking appointment:', err);
    res.status(500).json({ success: false, message: 'Failed to book appointment' });
  }
});

module.exports = router;

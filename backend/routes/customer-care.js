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

module.exports = router;

/**
 * Medications API Routes
 * Provides endpoints for patients to view their prescriptions
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');

/**
 * GET /api/medications
 * Get all medications for the logged-in patient
 * Permission: VIEW_MEDICATIONS (patient)
 */
router.get('/', checkPermission(PERMISSIONS.VIEW_MEDICATIONS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { status = 'all', limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        m.id,
        m.medication_name,
        m.dosage,
        m.frequency,
        m.duration,
        m.instructions,
        m.refills_remaining,
        m.status,
        m.prescribed_date,
        m.expiry_date,
        m.created_at,
        m.updated_at,
        d.id as doctor_id,
        d.specialization,
        u.name as doctor_name
      FROM medications m
      JOIN doctors d ON m.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE m.patient_id = ?
    `;
    
    const params = [patientId];
    
    if (status !== 'all') {
      query += ' AND m.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY m.prescribed_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    // Use query() instead of execute() to avoid MySQL prepared statement LIMIT issues
    const [medications] = await connection.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM medications WHERE patient_id = ?';
    const countParams = [patientId];
    if (status !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    // Get active medications count
    const [activeCount] = await connection.execute(`
      SELECT COUNT(*) as count FROM medications WHERE patient_id = ? AND status = 'active'
    `, [patientId]);
    
    // Get refills needed count
    const [refillsNeeded] = await connection.execute(`
      SELECT COUNT(*) as count FROM medications 
      WHERE patient_id = ? AND status = 'active' AND refills_remaining <= 1
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: medications.length,
      total: countResult[0].total,
      activeCount: activeCount[0].count,
      refillsNeeded: refillsNeeded[0].count,
      medications: medications.map(med => ({
        id: med.id,
        medicationName: med.medication_name,
        dosage: med.dosage,
        frequency: med.frequency,
        duration: med.duration,
        instructions: med.instructions,
        refillsRemaining: med.refills_remaining,
        status: med.status,
        prescribedDate: med.prescribed_date,
        expiryDate: med.expiry_date,
        createdAt: med.created_at,
        updatedAt: med.updated_at,
        doctor: {
          id: med.doctor_id,
          name: med.doctor_name,
          specialization: med.specialization
        }
      }))
    });
  } catch (error) {
    console.error('Error fetching medications:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch medications' 
    });
  }
});

/**
 * GET /api/medications/active
 * Get only active medications for the logged-in patient
 * Permission: VIEW_MEDICATIONS (patient)
 */
router.get('/active', checkPermission(PERMISSIONS.VIEW_MEDICATIONS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    
    const connection = await pool.getConnection();
    
    const [medications] = await connection.execute(`
      SELECT 
        m.id,
        m.medication_name,
        m.dosage,
        m.frequency,
        m.duration,
        m.instructions,
        m.refills_remaining,
        m.status,
        m.prescribed_date,
        m.expiry_date,
        m.created_at,
        u.name as doctor_name
      FROM medications m
      JOIN doctors d ON m.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE m.patient_id = ? AND m.status = 'active'
      ORDER BY m.prescribed_date DESC
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: medications.length,
      medications: medications.map(med => ({
        id: med.id,
        medicationName: med.medication_name,
        dosage: med.dosage,
        frequency: med.frequency,
        duration: med.duration,
        instructions: med.instructions,
        refillsRemaining: med.refills_remaining,
        status: med.status,
        prescribedDate: med.prescribed_date,
        expiryDate: med.expiry_date,
        createdAt: med.created_at,
        doctorName: med.doctor_name
      }))
    });
  } catch (error) {
    console.error('Error fetching active medications:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch active medications' 
    });
  }
});

/**
 * GET /api/medications/:id
 * Get specific medication details
 * Permission: VIEW_MEDICATIONS (patient)
 */
router.get('/:id', checkPermission(PERMISSIONS.VIEW_MEDICATIONS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [medications] = await connection.execute(`
      SELECT 
        m.id,
        m.medication_name,
        m.dosage,
        m.frequency,
        m.duration,
        m.instructions,
        m.refills_remaining,
        m.status,
        m.prescribed_date,
        m.expiry_date,
        m.created_at,
        m.updated_at,
        m.appointment_id,
        d.id as doctor_id,
        d.specialization,
        u.name as doctor_name,
        u.email as doctor_email
      FROM medications m
      JOIN doctors d ON m.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE m.id = ? AND m.patient_id = ?
    `, [id, patientId]);
    
    connection.release();
    
    if (medications.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Medication not found' 
      });
    }
    
    const med = medications[0];
    
    res.json({
      success: true,
      medication: {
        id: med.id,
        medicationName: med.medication_name,
        dosage: med.dosage,
        frequency: med.frequency,
        duration: med.duration,
        instructions: med.instructions,
        refillsRemaining: med.refills_remaining,
        status: med.status,
        prescribedDate: med.prescribed_date,
        expiryDate: med.expiry_date,
        createdAt: med.created_at,
        updatedAt: med.updated_at,
        appointmentId: med.appointment_id,
        doctor: {
          id: med.doctor_id,
          name: med.doctor_name,
          email: med.doctor_email,
          specialization: med.specialization
        }
      }
    });
  } catch (error) {
    console.error('Error fetching medication:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch medication details' 
    });
  }
});

/**
 * GET /api/medications/recent
 * Get recent medications for the patient dashboard
 * Permission: VIEW_MEDICATIONS (patient)
 */
router.get('/recent/latest', checkPermission(PERMISSIONS.VIEW_MEDICATIONS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { limit = 5 } = req.query;
    
    const connection = await pool.getConnection();
    
    const [medications] = await connection.query(`
      SELECT 
        m.id,
        m.medication_name,
        m.dosage,
        m.frequency,
        m.status,
        m.prescribed_date,
        m.refills_remaining,
        u.name as doctor_name
      FROM medications m
      JOIN doctors d ON m.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE m.patient_id = ?
      ORDER BY m.prescribed_date DESC
      LIMIT ?
    `, [patientId, parseInt(limit)]);
    
    connection.release();
    
    res.json({
      success: true,
      count: medications.length,
      medications: medications.map(med => ({
        id: med.id,
        medicationName: med.medication_name,
        dosage: med.dosage,
        frequency: med.frequency,
        status: med.status,
        prescribedDate: med.prescribed_date,
        refillsRemaining: med.refills_remaining,
        doctorName: med.doctor_name
      }))
    });
  } catch (error) {
    console.error('Error fetching recent medications:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch recent medications' 
    });
  }
});

/**
 * GET /api/medications/summary
 * Get medication summary for the patient dashboard
 * Permission: VIEW_MEDICATIONS (patient)
 */
router.get('/summary/stats', checkPermission(PERMISSIONS.VIEW_MEDICATIONS), async (req, res) => {
  try {
    const patientId = req.session.userId;
    
    const connection = await pool.getConnection();
    
    // Get counts by status
    const [statusCounts] = await connection.execute(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(refills_remaining) as total_refills
      FROM medications 
      WHERE patient_id = ?
      GROUP BY status
    `, [patientId]);
    
    // Get medications expiring soon (within 30 days)
    const [expiringSoon] = await connection.execute(`
      SELECT COUNT(*) as count FROM medications 
      WHERE patient_id = ? 
        AND status = 'active' 
        AND expiry_date IS NOT NULL 
        AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    `, [patientId]);
    
    connection.release();
    
    const summary = {
      total: 0,
      active: 0,
      completed: 0,
      stopped: 0,
      totalRefills: 0,
      expiringSoon: expiringSoon[0].count
    };
    
    statusCounts.forEach(row => {
      summary.total += row.count;
      summary[row.status] = row.count;
      if (row.status === 'active' || row.status === 'completed') {
        summary.totalRefills += row.total_refills || 0;
      }
    });
    
    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Error fetching medication summary:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch medication summary' 
    });
  }
});

/**
 * POST /api/medications
 * Create a new prescription (doctor)
 * Permission: PRESCRIBE_MEDICATION (doctor)
 */
router.post('/', checkPermission(PERMISSIONS.PRESCRIBE_MEDICATION), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { 
      patient_id, 
      medication_name, 
      dosage, 
      frequency, 
      duration,
      instructions,
      refills_remaining = 0,
      prescribed_date,
      expiry_date,
      appointment_id
    } = req.body;
    
    // Validate required fields
    if (!patient_id || !medication_name || !dosage || !frequency || !prescribed_date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Patient ID, medication name, dosage, frequency, and prescribed date are required' 
      });
    }
    
    const connection = await pool.getConnection();
    
    // Create the medication/prescription
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
      prescribed_date, 
      expiry_date || null
    ]);
    
    connection.release();
    
    res.status(201).json({
      success: true,
      message: 'Prescription created successfully',
      prescriptionId: result.insertId
    });
  } catch (error) {
    console.error('Error creating prescription:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create prescription' 
    });
  }
});

/**
 * GET /api/medications/doctor/pending
 * Get prescriptions that need follow-up
 * Permission: PRESCRIBE_MEDICATION (doctor)
 */
router.get('/doctor/pending', checkPermission(PERMISSIONS.PRESCRIBE_MEDICATION), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const connection = await pool.getConnection();
    
    // Get active medications prescribed by this doctor
    const [medications] = await connection.execute(`
      SELECT 
        m.id,
        m.patient_id,
        m.medication_name,
        m.dosage,
        m.frequency,
        m.duration,
        m.instructions,
        m.refills_remaining,
        m.status,
        m.prescribed_date,
        m.expiry_date,
        m.created_at,
        u.name as patient_name,
        u.email as patient_email
      FROM medications m
      JOIN users u ON m.patient_id = u.id
      WHERE m.doctor_id = ? AND m.status = 'active'
      ORDER BY m.prescribed_date DESC
    `, [doctorId]);
    
    // Get prescriptions expiring soon
    const [expiringSoon] = await connection.execute(`
      SELECT COUNT(*) as count FROM medications 
      WHERE doctor_id = ? 
        AND status = 'active' 
        AND expiry_date IS NOT NULL 
        AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    `, [doctorId]);
    
    // Get medications with no refills remaining
    const [noRefills] = await connection.execute(`
      SELECT COUNT(*) as count FROM medications 
      WHERE doctor_id = ? AND status = 'active' AND refills_remaining <= 0
    `, [doctorId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: medications.length,
      expiringSoon: expiringSoon[0].count,
      noRefills: noRefills[0].count,
      medications: medications.map(med => ({
        id: med.id,
        patientId: med.patient_id,
        patientName: med.patient_name,
        patientEmail: med.patient_email,
        medicationName: med.medication_name,
        dosage: med.dosage,
        frequency: med.frequency,
        duration: med.duration,
        instructions: med.instructions,
        refillsRemaining: med.refills_remaining,
        status: med.status,
        prescribedDate: med.prescribed_date,
        expiryDate: med.expiry_date,
        createdAt: med.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching pending medications:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch pending medications' 
    });
  }
});

/**
 * POST /api/medications/:id/refill
 * Request refill for a medication
 * Permission: PRESCRIBE_MEDICATION (doctor)
 */
router.post('/:id/refill', checkPermission(PERMISSIONS.PRESCRIBE_MEDICATION), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    const { refills_to_add = 1 } = req.body;
    
    const connection = await pool.getConnection();
    
    // Verify medication exists and belongs to this doctor
    const [medications] = await connection.execute(`
      SELECT id, refills_remaining FROM medications WHERE id = ? AND doctor_id = ?
    `, [id, doctorId]);
    
    if (medications.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Medication not found' 
      });
    }
    
    // Update refills
    await connection.execute(`
      UPDATE medications SET refills_remaining = refills_remaining + ? WHERE id = ?
    `, [parseInt(refills_to_add), id]);
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Refill added successfully'
    });
  } catch (error) {
    console.error('Error adding refill:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to add refill' 
    });
  }
});

/**
 * POST /api/medications/:id/stop
 * Stop a medication
 * Permission: PRESCRIBE_MEDICATION (doctor)
 */
router.post('/:id/stop', checkPermission(PERMISSIONS.PRESCRIBE_MEDICATION), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    const { reason } = req.body;
    
    const connection = await pool.getConnection();
    
    // Verify medication exists and belongs to this doctor
    const [medications] = await connection.execute(`
      SELECT id, status FROM medications WHERE id = ? AND doctor_id = ?
    `, [id, doctorId]);
    
    if (medications.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Medication not found' 
      });
    }
    
    if (medications[0].status === 'stopped') {
      connection.release();
      return res.status(400).json({ 
        success: false, 
        message: 'Medication is already stopped' 
      });
    }
    
    // Update status
    await connection.execute(`
      UPDATE medications SET status = 'stopped', instructions = ? WHERE id = ?
    `, [reason ? `Stopped: ${reason}` : 'Stopped by doctor', id]);
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Medication stopped successfully'
    });
  } catch (error) {
    console.error('Error stopping medication:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to stop medication' 
    });
  }
});

/**
 * POST /api/medications/prescribe
 * Doctor prescribes a medication to a patient
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.post('/prescribe', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const {
      patient_id,
      appointment_id,
      medication_name,
      dosage,
      frequency,
      duration,
      instructions,
      refills_remaining,
      expiry_date,
      prescribed_date
    } = req.body;

    if (!patient_id || !medication_name || !dosage || !frequency) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID, medication name, dosage, and frequency are required'
      });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(`
      INSERT INTO medications 
      (patient_id, doctor_id, appointment_id, medication_name, dosage, frequency, duration, instructions, refills_remaining, status, prescribed_date, expiry_date)
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
      refills_remaining || 0,
      prescribed_date || new Date().toISOString().split('T')[0],
      expiry_date || null
    ]);

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Prescription created successfully',
      medicationId: result.insertId
    });
  } catch (error) {
    console.error('Error prescribing medication:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create prescription'
    });
  }
});

/**
 * PUT /api/medications/:id/doctor
 * Doctor updates a prescription
 * Permission: VIEW_OWN_PATIENTS (doctor)
 */
router.put('/:id/doctor', checkPermission(PERMISSIONS.VIEW_OWN_PATIENTS), async (req, res) => {
  try {
    const doctorId = req.session.doctorId;
    const { id } = req.params;
    const {
      dosage,
      frequency,
      duration,
      instructions,
      refills_remaining,
      status,
      expiry_date
    } = req.body;

    const connection = await pool.getConnection();

    // Verify the medication belongs to this doctor
    const [meds] = await connection.execute(`
      SELECT doctor_id FROM medications WHERE id = ?
    `, [id]);

    if (meds.length === 0 || meds[0].doctor_id !== doctorId) {
      connection.release();
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this prescription'
      });
    }

    const updateParts = [];
    const updateParams = [];

    if (dosage !== undefined) {
      updateParts.push('dosage = ?');
      updateParams.push(dosage);
    }
    if (frequency !== undefined) {
      updateParts.push('frequency = ?');
      updateParams.push(frequency);
    }
    if (duration !== undefined) {
      updateParts.push('duration = ?');
      updateParams.push(duration);
    }
    if (instructions !== undefined) {
      updateParts.push('instructions = ?');
      updateParams.push(instructions);
    }
    if (refills_remaining !== undefined) {
      updateParts.push('refills_remaining = ?');
      updateParams.push(refills_remaining);
    }
    if (status !== undefined) {
      updateParts.push('status = ?');
      updateParams.push(status);
    }
    if (expiry_date !== undefined) {
      updateParts.push('expiry_date = ?');
      updateParams.push(expiry_date);
    }

    if (updateParts.length === 0) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateParams.push(id);
    const query = `UPDATE medications SET ${updateParts.join(', ')} WHERE id = ?`;

    await connection.execute(query, updateParams);
    connection.release();

    res.json({
      success: true,
      message: 'Prescription updated successfully'
    });
  } catch (error) {
    console.error('Error updating prescription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update prescription'
    });
  }
});

module.exports = router;


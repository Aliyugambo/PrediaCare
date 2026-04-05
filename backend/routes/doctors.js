/**
 * Doctors API Routes
 * Provides endpoints for patients to view doctors
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');

/**
 * GET /api/doctors
 * Get list of all active doctors
 * Permission: VIEW_DOCTORS (patient)
 */
router.get('/', checkPermission(PERMISSIONS.VIEW_DOCTORS), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    const [doctors] = await connection.execute(`
      SELECT 
        d.id,
        d.user_id,
        d.specialization,
        d.qualification,
        d.experience_years,
        d.consultation_fee,
        d.available_days,
        d.available_time_start,
        d.available_time_end,
        d.bio,
        d.profile_image,
        d.location,
        u.name,
        u.email
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      WHERE d.is_active = TRUE
      ORDER BY u.name ASC
    `);
    
    connection.release();
    
    res.json({
      success: true,
      count: doctors.length,
      doctors: doctors.map(doc => ({
        id: doc.id,
        userId: doc.user_id,
        name: doc.name,
        email: doc.email,
        specialization: doc.specialization,
        qualification: doc.qualification,
        experienceYears: doc.experience_years,
        consultationFee: doc.consultation_fee,
        availableDays: doc.available_days,
        availableTimeStart: doc.available_time_start,
        availableTimeEnd: doc.available_time_end,
        bio: doc.bio,
        profileImage: doc.profile_image,
        location: doc.location
      }))
    });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch doctors' 
    });
  }
});

/**
 * GET /api/doctors/:id
 * Get specific doctor details
 * Permission: VIEW_DOCTORS (patient)
 */
router.get('/:id', checkPermission(PERMISSIONS.VIEW_DOCTORS), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    
    const [doctors] = await connection.execute(`
      SELECT 
        d.id,
        d.user_id,
        d.specialization,
        d.qualification,
        d.experience_years,
        d.consultation_fee,
        d.available_days,
        d.available_time_start,
        d.available_time_end,
        d.bio,
        d.profile_image,
        u.name,
        u.email
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = ? AND d.is_active = TRUE
    `, [id]);
    
    connection.release();
    
    if (doctors.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Doctor not found' 
      });
    }
    
    const doc = doctors[0];
    
    res.json({
      success: true,
      doctor: {
        id: doc.id,
        userId: doc.user_id,
        name: doc.name,
        email: doc.email,
        specialization: doc.specialization,
        qualification: doc.qualification,
        experienceYears: doc.experience_years,
        consultationFee: doc.consultation_fee,
        availableDays: doc.available_days,
        availableTimeStart: doc.available_time_start,
        availableTimeEnd: doc.available_time_end,
        bio: doc.bio,
        profileImage: doc.profile_image,
        location: doc.location
      }
    });
  } catch (error) {
    console.error('Error fetching doctor:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch doctor details' 
    });
  }
});

/**
 * GET /api/doctors/:id/schedule
 * Get doctor's available schedule for booking
 * Permission: VIEW_DOCTORS (patient)
 */
router.get('/:id/schedule', checkPermission(PERMISSIONS.VIEW_DOCTORS), async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;
    
    const connection = await pool.getConnection();
    
    // Get doctor details
    const [doctors] = await connection.execute(`
      SELECT 
        d.id,
        d.available_days,
        d.available_time_start,
        d.available_time_end
      FROM doctors d
      WHERE d.id = ? AND d.is_active = TRUE
    `, [id]);
    
    if (doctors.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Doctor not found' 
      });
    }
    
    const doc = doctors[0];
    
    // If date is provided, get existing appointments for that date
    let bookedSlots = [];
    if (date) {
      const [appointments] = await connection.execute(`
        SELECT appointment_time
        FROM appointments
        WHERE doctor_id = ? AND appointment_date = ? AND status IN ('scheduled', 'confirmed')
      `, [id, date]);
      bookedSlots = appointments.map(a => a.appointment_time);
    }
    
    connection.release();
    
    res.json({
      success: true,
      schedule: {
        doctorId: doc.id,
        availableDays: doc.available_days.split(','),
        availableTimeStart: doc.available_time_start,
        availableTimeEnd: doc.available_time_end,
        date: date || null,
        bookedSlots: bookedSlots
      }
    });
  } catch (error) {
    console.error('Error fetching doctor schedule:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch schedule' 
    });
  }
});

/**
 * GET /api/doctors/specializations
 * Get list of all specializations
 * Permission: VIEW_DOCTORS (patient)
 */
router.get('/meta/specializations', checkPermission(PERMISSIONS.VIEW_DOCTORS), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    const [specializations] = await connection.execute(`
      SELECT DISTINCT specialization
      FROM doctors
      WHERE is_active = TRUE
      ORDER BY specialization ASC
    `);
    
    connection.release();
    
    res.json({
      success: true,
      specializations: specializations.map(s => s.specialization)
    });
  } catch (error) {
    console.error('Error fetching specializations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch specializations' 
    });
  }
});

module.exports = router;


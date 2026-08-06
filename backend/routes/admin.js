/**
 * Admin API Routes
 * Comprehensive endpoints for admin to manage all platform activities
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { sendEmail } = require('../config/email');
const router = express.Router();
const { checkPermission, PERMISSIONS, setUserPermissions, getUserPermissions, clearUserPermissions } = require('../config/permissions');

// All admin endpoints require MANAGE_USERS permission
const requireAdmin = checkPermission(PERMISSIONS.MANAGE_USERS);

// ==================== DASHBOARD STATS ====================

/**
 * GET /api/admin/dashboard-stats
 * Get comprehensive dashboard statistics
 */
router.get('/dashboard-stats', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // Total users by role
    const [userCounts] = await connection.execute(`
      SELECT role, COUNT(*) as count FROM users GROUP BY role
    `);
    
    // Today's appointments
    const [todayAppointments] = await connection.execute(`
      SELECT COUNT(*) as count FROM appointments WHERE appointment_date = CURDATE()
    `);
    
    // Pending appointments
    const [pendingAppointments] = await connection.execute(`
      SELECT COUNT(*) as count FROM appointments WHERE status IN ('scheduled', 'confirmed')
    `);
    
    // Total doctors
    const [doctorCount] = await connection.execute(`
      SELECT COUNT(*) as count FROM doctors
    `);
    
    // Active patients (with appointments in last 30 days)
    const [activePatients] = await connection.execute(`
      SELECT COUNT(DISTINCT patient_id) as count FROM appointments 
      WHERE appointment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);
    
    // Messages count
    const [messagesCount] = await connection.execute(`
      SELECT COUNT(*) as count FROM messages
    `);
    
    // Unread messages
    const [unreadMessages] = await connection.execute(`
      SELECT COUNT(*) as count FROM messages WHERE is_read = FALSE
    `);
    
    // Test results pending
    const [pendingResults] = await connection.execute(`
      SELECT COUNT(*) as count FROM results WHERE status = 'pending'
    `);
    
    // Recent registrations (last 7 days)
    const [recentRegistrations] = await connection.execute(`
      SELECT COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `);
    
    connection.release();
    
    // Transform user counts to object
    const usersByRole = {};
    userCounts.forEach(u => { usersByRole[u.role] = u.count; });
    
    res.json({
      success: true,
      stats: {
        totalUsers: Object.values(usersByRole).reduce((a, b) => a + b, 0),
        totalDoctors: usersByRole.doctor || 0,
        totalStaff: (usersByRole.staff || 0) + (usersByRole.nurse || 0),
        totalPatients: usersByRole.patient || 0,
        todayAppointments: todayAppointments[0].count,
        pendingAppointments: pendingAppointments[0].count,
        activePatients: activePatients[0].count,
        totalMessages: messagesCount[0].count,
        unreadMessages: unreadMessages[0].count,
        pendingResults: pendingResults[0].count,
        recentRegistrations: recentRegistrations[0].count
      }
    });
  } catch (err) {
    console.error('Error in dashboard-stats:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== USER MANAGEMENT ====================

/**
 * GET /api/admin/users
 * Get all users (doctors, staff, patients, admins)
 * Requires VIEW_ALL_USERS permission (allows customer_care, staff, etc. to view users)
 */
router.get('/users', checkPermission(PERMISSIONS.VIEW_ALL_USERS), async (req, res) => {
  try {
    const { role, search, patient_status, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT id, name, email, role, is_active, patient_status, created_at FROM users WHERE 1=1
    `;
    const params = [];
    
    if (role && role !== 'all') {
      query += ' AND role = ?';
      params.push(role);
    }
    
    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (patient_status && patient_status !== 'all') {
      query += ' AND patient_status = ?';
      params.push(patient_status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    const [rows] = await connection.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    const countParams = [];
    if (role && role !== 'all') {
      countQuery += ' AND role = ?';
      countParams.push(role);
    }
    if (search) {
      countQuery += ' AND (name LIKE ? OR email LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }
    if (patient_status && patient_status !== 'all') {
      countQuery += ' AND patient_status = ?';
      countParams.push(patient_status);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({ 
      success: true, 
      users: rows, 
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching users list:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/users/:id
 * Get specific user details
 */
router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    
    const [users] = await connection.execute(`
      SELECT id, name, email, role, created_at, is_active, patient_status FROM users WHERE id = ?
    `, [id]);
    
    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = users[0];
    
    // Get additional info based on role
    let additionalInfo = {};
    
    if (user.role === 'doctor') {
      const [doctors] = await connection.execute(`
        SELECT * FROM doctors WHERE user_id = ?
      `, [id]);
      if (doctors.length > 0) {
        additionalInfo.doctor = doctors[0];
      }
    }
    
    connection.release();
    
    res.json({ success: true, user: { ...user, ...additionalInfo } });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create a new user with a role (doctor or staff only)
router.post('/create-user', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, specialization, experience_years } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'name, email, password and role are required' });
    }

    if (!['doctor', 'staff', 'nurse', 'patient', 'admin', 'customer_care', 'diagnostic', 'pharmacist'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      connection.release();
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await connection.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, role]
    );

    // If creating a doctor, create doctor profile row
    if (role === 'doctor') {
      await connection.execute(
        'INSERT INTO doctors (user_id, specialization, qualification, experience_years, consultation_fee, bio) VALUES (?, ?, ?, ?, ?, ?)',
        [result.insertId, specialization || 'General Medicine', '', experience_years || 0, 0.00, '']
      );
    }

    connection.release();

    const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';
    const welcomeHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .detail { margin: 10px 0; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; }
          .footer { background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; font-size: 12px; }
          .cta-button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Welcome to PrediaCare Clinic</h2>
          </div>
          <div class="content">
            <p>Dear <strong>${name}</strong>,</p>
            <p>Welcome aboard! Your account has been created at <strong>PrediaCare Clinic</strong> as a <strong>${roleLabel}</strong>.</p>
            <p>You can now log in to your dashboard to start managing appointments, patient records, and clinic operations.</p>
            <p style="text-align: center;">
              <a href="#" class="cta-button">Proceed to Login</a>
            </p>
            <p>If you have any questions or need assistance getting started, please contact the clinic administration.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from PrediaCare Clinic.</p>
            <p>© 2026 PrediaCare Clinic. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    sendEmail(email, 'Welcome to PrediaCare Clinic', welcomeHtml).catch(() => {});

    res.status(201).json({ success: true, message: 'User created', userId: result.insertId });
  } catch (err) {
    console.error('Error in admin create-user:', err);
    console.error('Error details:', err.stack);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Update a user's role
router.post('/set-role', requireAdmin, async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (!userId || !role) {
      return res.status(400).json({ success: false, message: 'userId and role are required' });
    }
    if (!['doctor', 'staff', 'nurse', 'patient', 'admin', 'customer_care', 'diagnostic', 'pharmacist'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const connection = await pool.getConnection();
    const [users] = await connection.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await connection.execute('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
    connection.release();

    res.json({ success: true, message: 'Role updated' });
  } catch (err) {
    console.error('Error in admin set-role:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Toggle user active status
router.post('/toggle-user-status', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const connection = await pool.getConnection();
    const [users] = await connection.execute('SELECT is_active FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const newStatus = !users[0].is_active;
    await connection.execute('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, userId]);
    connection.release();

    res.json({ success: true, message: `User ${newStatus ? 'activated' : 'deactivated'}` });
  } catch (err) {
    console.error('Error toggling user status:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update user information
router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, is_active } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ success: false, message: 'Name, email, and role are required' });
    }

    if (!['doctor', 'staff', 'nurse', 'patient', 'admin', 'customer_care', 'diagnostic', 'pharmacist'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id, email FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [emailConflict] = await connection.execute('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
    if (emailConflict.length > 0) {
      connection.release();
      return res.status(409).json({ success: false, message: 'Email is already used by another user' });
    }

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (email) { updates.push('email = ?'); params.push(email); }
    if (role) { updates.push('role = ?'); params.push(role); }
    if (typeof is_active !== 'undefined') { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    params.push(id);

    await connection.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    connection.release();

    res.json({ success: true, message: 'User updated successfully' });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete a user (doctor or staff)
router.delete('/delete-user', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const connection = await pool.getConnection();
    // prevent deleting admins
    const [users] = await connection.execute('SELECT role FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (users[0].role === 'admin') {
      connection.release();
      return res.status(403).json({ success: false, message: 'Cannot delete admin users' });
    }

    await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
    connection.release();

    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error('Error in admin delete-user:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== APPOINTMENTS MANAGEMENT ====================

/**
 * GET /api/admin/appointments
 * Get all appointments
 */
router.get('/appointments', requireAdmin, async (req, res) => {
  try {
    const { status, date, doctor_id, patient_id, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        a.*,
        u_patient.name as patient_name,
        u_patient.email as patient_email,
        d.id as doctor_id,
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
    
    // Get count
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
 * POST /api/admin/appointments/:id/update-status
 * Update appointment status
 */
router.post('/appointments/:id/update-status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }
    
    const connection = await pool.getConnection();
    
    const [appointments] = await connection.execute('SELECT id FROM appointments WHERE id = ?', [id]);
    if (appointments.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    
    let query = 'UPDATE appointments SET status = ?';
    const params = [status];
    
    if (notes) {
      query += ', notes = ?';
      params.push(notes);
    }
    
    query += ' WHERE id = ?';
    params.push(id);
    
    await connection.execute(query, params);
    connection.release();
    
    res.json({ success: true, message: 'Appointment updated' });
  } catch (err) {
    console.error('Error updating appointment:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/admin/appointments/:id
 * Cancel/delete an appointment
 */
router.delete('/appointments/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [appointments] = await connection.execute('SELECT id FROM appointments WHERE id = ?', [id]);
    if (appointments.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    
    await connection.execute('DELETE FROM appointments WHERE id = ?', [id]);
    connection.release();
    
    res.json({ success: true, message: 'Appointment deleted' });
  } catch (err) {
    console.error('Error deleting appointment:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== MESSAGES MANAGEMENT ====================

/**
 * GET /api/admin/messages
 * Get all messages
 */
router.get('/messages', requireAdmin, async (req, res) => {
  try {
    const { type = 'all', limit = 50, offset = 0, unread_only = false } = req.query;
    
    let query = '';
    let params = [];
    
    if (type === 'received') {
      query = `
        SELECT m.*, 
          sender.name as sender_name, sender.role as sender_role,
          receiver.name as receiver_name, receiver.role as receiver_role
        FROM messages m
        JOIN users sender ON m.sender_id = sender.id
        JOIN users receiver ON m.receiver_id = receiver.id
        WHERE m.receiver_id = ?
      `;
      params = [req.session.userId];
    } else if (type === 'sent') {
      query = `
        SELECT m.*, 
          sender.name as sender_name, sender.role as sender_role,
          receiver.name as receiver_name, receiver.role as receiver_role
        FROM messages m
        JOIN users sender ON m.sender_id = sender.id
        JOIN users receiver ON m.receiver_id = receiver.id
        WHERE m.sender_id = ?
      `;
      params = [req.session.userId];
    } else {
      query = `
        SELECT m.*, 
          sender.name as sender_name, sender.role as sender_role,
          receiver.name as receiver_name, receiver.role as receiver_role
        FROM messages m
        JOIN users sender ON m.sender_id = sender.id
        JOIN users receiver ON m.receiver_id = receiver.id
        WHERE m.sender_id = ? OR m.receiver_id = ?
      `;
      params = [req.session.userId, req.session.userId];
    }
    
    if (unread_only === 'true') {
      query += ' AND m.is_read = FALSE';
    }
    
    query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    const [messages] = await connection.query(query, params);
    
    // Get unread count for admin's inbox
    const [unreadCount] = await connection.execute(`
      SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = FALSE
    `, [req.session.userId]);
    
    connection.release();
    
    res.json({
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        subject: m.subject,
        message: m.message,
        isRead: m.is_read,
        createdAt: m.created_at,
        sender: { id: m.sender_id, name: m.sender_name, role: m.sender_role },
        receiver: { id: m.receiver_id, name: m.receiver_name, role: m.receiver_role }
      })),
      unreadCount: unreadCount[0].count
    });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/admin/messages
 * Send a message
 */
router.post('/messages', requireAdmin, async (req, res) => {
  try {
    const { receiver_id, subject, message } = req.body;
    
    if (!receiver_id || !subject || !message) {
      return res.status(400).json({ success: false, message: 'receiver_id, subject and message are required' });
    }
    
    const connection = await pool.getConnection();
    
    const [result] = await connection.execute(
      'INSERT INTO messages (sender_id, receiver_id, subject, message) VALUES (?, ?, ?, ?)',
      [req.session.userId, receiver_id, subject, message]
    );
    
    connection.release();
    
    res.status(201).json({ success: true, message: 'Message sent', messageId: result.insertId });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== RESULTS/TESTS MANAGEMENT ====================

/**
 * GET /api/admin/results
 * Get all test results
 */
router.get('/results', requireAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT r.*, 
        u_patient.name as patient_name, u_patient.email as patient_email,
        u_doctor.name as doctor_name, d.specialization
      FROM results r
      JOIN users u_patient ON r.patient_id = u_patient.id
      JOIN doctors d ON r.doctor_id = d.id
      JOIN users u_doctor ON d.user_id = u_doctor.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status && status !== 'all') {
      query += ' AND r.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    const [results] = await connection.query(query, params);
    
    // Get count
    let countQuery = 'SELECT COUNT(*) as total FROM results WHERE 1=1';
    const countParams = [];
    if (status && status !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({
      success: true,
      results: results.map(r => ({
        id: r.id,
        testName: r.test_name,
        testType: r.test_type,
        resultData: r.result_data,
        status: r.status,
        notes: r.notes,
        resultDate: r.result_date,
        createdAt: r.created_at,
        patient: { id: r.patient_id, name: r.patient_name, email: r.patient_email },
        doctor: { id: r.doctor_id, name: r.doctor_name, specialization: r.specialization }
      })),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching results:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== DOCTORS MANAGEMENT ====================

/**
 * GET /api/admin/doctors
 * Get all doctors with their profiles
 */
router.get('/doctors', requireAdmin, async (req, res) => {
  try {
    const { is_active, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT d.*, u.name, u.email, u.role, u.created_at, u.is_active as user_active
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (is_active !== undefined) {
      query += ' AND d.is_active = ?';
      params.push(is_active === 'true');
    }
    
    query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    const [doctors] = await connection.query(query, params);
    
    // Get count
    let countQuery = 'SELECT COUNT(*) as total FROM doctors';
    const [countResult] = await connection.execute(countQuery);
    
    connection.release();
    
    res.json({
      success: true,
      doctors: doctors.map(d => ({
        id: d.id,
        userId: d.user_id,
        name: d.name,
        email: d.email,
        role: d.role,
        specialization: d.specialization,
        qualification: d.qualification,
        experienceYears: d.experience_years,
        consultationFee: d.consultation_fee,
        bio: d.bio,
        isActive: d.is_active,
        availableDays: d.available_days,
        availableTimeStart: d.available_time_start,
        availableTimeEnd: d.available_time_end,
        createdAt: d.created_at,
        userActive: d.user_active
      })),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching doctors:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/admin/doctors/:id
 * Update doctor profile
 */
router.put('/doctors/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { specialization, qualification, experience_years, consultation_fee, bio, available_days, available_time_start, available_time_end, is_active } = req.body;
    
    const connection = await pool.getConnection();
    
    const [doctors] = await connection.execute('SELECT id FROM doctors WHERE id = ?', [id]);
    if (doctors.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const updateParts = [];
    const updateParams = [];
    
    if (specialization !== undefined) { updateParts.push('specialization = ?'); updateParams.push(specialization); }
    if (qualification !== undefined) { updateParts.push('qualification = ?'); updateParams.push(qualification); }
    if (experience_years !== undefined) { updateParts.push('experience_years = ?'); updateParams.push(experience_years); }
    if (consultation_fee !== undefined) { updateParts.push('consultation_fee = ?'); updateParams.push(consultation_fee); }
    if (bio !== undefined) { updateParts.push('bio = ?'); updateParams.push(bio); }
    if (available_days !== undefined) { updateParts.push('available_days = ?'); updateParams.push(available_days); }
    if (available_time_start !== undefined) { updateParts.push('available_time_start = ?'); updateParams.push(available_time_start); }
    if (available_time_end !== undefined) { updateParts.push('available_time_end = ?'); updateParams.push(available_time_end); }
    if (is_active !== undefined) { updateParts.push('is_active = ?'); updateParams.push(is_active); }
    
    if (updateParts.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    
    updateParams.push(id);
    await connection.execute(`UPDATE doctors SET ${updateParts.join(', ')} WHERE id = ?`, updateParams);
    
    connection.release();
    
    res.json({ success: true, message: 'Doctor updated' });
  } catch (err) {
    console.error('Error updating doctor:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== HEALTH SUMMARIES ====================

/**
 * GET /api/admin/health-summaries
 * Get all health summaries
 */
router.get('/health-summaries', requireAdmin, async (req, res) => {
  try {
    const { summary_type, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT h.*, 
        u_patient.name as patient_name, u_patient.email as patient_email,
        u_doctor.name as doctor_name, d.specialization
      FROM health_summaries h
      JOIN users u_patient ON h.patient_id = u_patient.id
      JOIN doctors d ON h.doctor_id = d.id
      JOIN users u_doctor ON d.user_id = u_doctor.id
      WHERE 1=1
    `;
    const params = [];
    
    if (summary_type) {
      query += ' AND h.summary_type = ?';
      params.push(summary_type);
    }
    
    query += ' ORDER BY h.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    const [summaries] = await connection.query(query, params);
    
    // Get count
    let countQuery = 'SELECT COUNT(*) as total FROM health_summaries';
    const [countResult] = await connection.execute(countQuery);
    
    connection.release();
    
    res.json({
      success: true,
      summaries: summaries.map(h => ({
        id: h.id,
        summaryType: h.summary_type,
        chiefComplaint: h.chief_complaint,
        vitalSigns: h.vital_signs,
        diagnosis: h.diagnosis,
        treatmentPlan: h.treatment_plan,
        recommendations: h.recommendations,
        nextVisitDate: h.next_visit_date,
        createdAt: h.created_at,
        patient: { id: h.patient_id, name: h.patient_name, email: h.patient_email },
        doctor: { id: h.doctor_id, name: h.doctor_name, specialization: h.specialization }
      })),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching health summaries:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== MEDICATIONS ====================

/**
 * GET /api/admin/medications
 * Get all prescribed medications
 */
router.get('/medications', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const connection = await pool.getConnection();
    
    const [medications] = await connection.execute(`
      SELECT m.*, 
        u_patient.name as patient_name,
        u_doctor.name as doctor_name
      FROM medications m
      JOIN users u_patient ON m.patient_id = u_patient.id
      JOIN users u_doctor ON m.doctor_id = u_doctor.id
      ORDER BY m.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `);
    
    const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM medications');
    
    connection.release();
    
    res.json({
      success: true,
      medications: medications.map(m => ({
        id: m.id,
        name: m.medication_name,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions,
        status: m.status,
        prescribedAt: m.created_at,
        patient: { id: m.patient_id, name: m.patient_name },
        doctor: { id: m.doctor_id, name: m.doctor_name }
      })),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching medications:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== TEST REFERRALS ====================

/**
 * GET /api/admin/test-referrals
 * Get all test referrals
 */
router.get('/test-referrals', requireAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT tr.*, 
        u_patient.name as patient_name, u_patient.email as patient_email,
        u_doctor.name as doctor_name,
        u_staff.name as staff_name
      FROM test_referrals tr
      JOIN users u_patient ON tr.patient_id = u_patient.id
      JOIN users u_doctor ON tr.doctor_id = u_doctor.id
      LEFT JOIN users u_staff ON tr.assigned_to_staff_id = u_staff.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status && status !== 'all') {
      query += ' AND tr.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY tr.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    const [referrals] = await connection.query(query, params);
    
    // Get count
    let countQuery = 'SELECT COUNT(*) as total FROM test_referrals';
    const countParams = [];
    if (status && status !== 'all') {
      countQuery += ' WHERE status = ?';
      countParams.push(status);
    }
    const [countResult] = await connection.execute(countQuery, countParams);
    
    connection.release();
    
    res.json({
      success: true,
      referrals: referrals.map(tr => ({
        id: tr.id,
        testName: tr.test_name,
        testType: tr.test_type,
        reasonForTest: tr.reason_for_test,
        urgency: tr.urgency,
        status: tr.status,
        notes: tr.notes,
        createdAt: tr.created_at,
        patient: { id: tr.patient_id, name: tr.patient_name, email: tr.patient_email },
        doctor: { id: tr.doctor_id, name: tr.doctor_name },
        staff: tr.assigned_to_staff_id ? { id: tr.assigned_to_staff_id, name: tr.staff_name } : null
      })),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching test referrals:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== REPORTS ====================

/**
 * GET /api/admin/reports
 * Get all reports
 */
router.get('/reports', requireAdmin, async (req, res) => {
  try {
    const { status, report_type, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT r.*, 
        u_patient.name as patient_name, u_patient.email as patient_email,
        u_doctor.name as doctor_name
      FROM reports r
      JOIN users u_patient ON r.patient_id = u_patient.id
      JOIN doctors d ON r.doctor_id = d.id
      JOIN users u_doctor ON d.user_id = u_doctor.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status && status !== 'all') {
      query += ' AND r.status = ?';
      params.push(status);
    }
    
    if (report_type) {
      query += ' AND r.report_type = ?';
      params.push(report_type);
    }
    
    query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    const [reports] = await connection.query(query, params);
    
    // Get count
    let countQuery = 'SELECT COUNT(*) as total FROM reports';
    const [countResult] = await connection.execute(countQuery);
    
    connection.release();
    
    res.json({
      success: true,
      reports: reports.map(r => ({
        id: r.id,
        reportType: r.report_type,
        reportTitle: r.report_title,
        reportDescription: r.report_description,
        urgency: r.urgency,
        status: r.status,
        isTestReferral: r.is_test_referral,
        fileName: r.file_name,
        filePath: r.file_path,
        createdAt: r.created_at,
        patient: { id: r.patient_id, name: r.patient_name, email: r.patient_email },
        doctor: { id: r.doctor_id, name: r.doctor_name }
      })),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/reports/:id/file
 * Get the report file
 */
router.get('/reports/:id/file', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [reports] = await connection.execute(`
      SELECT file_path, file_name FROM reports WHERE id = ?
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

// ==================== PERMISSIONS MANAGEMENT ====================

// Set custom permissions for a user (overrides)
router.post('/set-user-permissions', requireAdmin, async (req, res) => {
  try {
    const { userId, permissions } = req.body; // permissions: array of permission keys (strings)
    if (!userId || !Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: 'userId and permissions[] are required' });
    }

    // Validate permissions
    const validPerms = Object.values(PERMISSIONS);
    const invalid = permissions.filter(p => !validPerms.includes(p));
    if (invalid.length > 0) {
      return res.status(400).json({ success: false, message: 'Invalid permissions: ' + invalid.join(', ') });
    }

    setUserPermissions(userId, permissions);

    res.json({ success: true, message: 'User permissions set' });
  } catch (err) {
    console.error('Error in admin set-user-permissions:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Clear user overrides
router.post('/clear-user-permissions', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }
    clearUserPermissions(userId);
    res.json({ success: true, message: 'User permission overrides cleared' });
  } catch (err) {
    console.error('Error in admin clear-user-permissions:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get effective permissions for a user
router.get('/user-permissions/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const connection = await pool.getConnection();
    const [users] = await connection.execute('SELECT id, role FROM users WHERE id = ?', [userId]);
    connection.release();
    if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const user = users[0];
    const rolePerms = require('../config/permissions').getRolePermissions(user.role);
    const userOverrides = getUserPermissions(userId);
    const effective = Array.from(new Set([...(rolePerms || []), ...(userOverrides || [])]));

    res.json({ success: true, role: user.role, overrides: userOverrides, effectivePermissions: effective });
  } catch (err) {
    console.error('Error fetching user permissions:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/discharged-patients
 * Get all discharged patients with admission/discharge details
 */
router.get('/discharged-patients', requireAdmin, async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        a.id as admission_id,
        a.patient_id,
        u.name as patient_name,
        u.email as patient_email,
        u.phone as patient_phone,
        doc_user.name as doctor_name,
        a.room_number,
        a.bed_number,
        a.reason_for_admission,
        a.admitting_diagnosis,
        a.admission_date,
        a.discharge_date,
        a.discharge_data,
        a.status,
        a.notes,
        a.created_at
      FROM admissions a
      JOIN users u ON a.patient_id = u.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      LEFT JOIN users doc_user ON d.user_id = doc_user.id
      WHERE a.status = 'discharged'
    `;
    const params = [];

    if (search) {
      query += ` AND (u.name LIKE ? OR u.email LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    query += ` ORDER BY a.discharge_date DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(query, params);

    let countQuery = `
      SELECT COUNT(*) as total
      FROM admissions a
      JOIN users u ON a.patient_id = u.id
      WHERE a.status = 'discharged'
    `;
    const countParams = [];
    if (search) {
      countQuery += ` AND (u.name LIKE ? OR u.email LIKE ?)`;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern);
    }
    const [countResult] = await connection.execute(countQuery, countParams);

    connection.release();

    res.json({
      success: true,
      patients: rows.map(p => ({
        admission_id: p.admission_id,
        patient_id: p.patient_id,
        patient_name: p.patient_name,
        patient_email: p.patient_email,
        patient_phone: p.patient_phone,
        doctor_name: p.doctor_name,
        room_number: p.room_number,
        bed_number: p.bed_number,
        reason_for_admission: p.reason_for_admission,
        admitting_diagnosis: p.admitting_diagnosis,
        admission_date: p.admission_date,
        discharge_date: p.discharge_date,
        discharge_data: p.discharge_data,
        status: p.status,
        notes: p.notes,
        created_at: p.created_at
      })),
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching discharged patients:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/patients/:id/discharge-history
 * Get full discharge history for a specific patient
 */
router.get('/patients/:id/discharge-history', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [rows] = await connection.execute(`
      SELECT
        a.id as admission_id,
        a.patient_id,
        u.name as patient_name,
        u.email as patient_email,
        u.phone as patient_phone,
        u.patient_status,
        doc_user.name as doctor_name,
        doc.specialization,
        a.room_number,
        a.bed_number,
        a.admission_type,
        a.reason_for_admission,
        a.admitting_diagnosis,
        a.admission_date,
        a.discharge_date,
        a.discharge_data,
        a.status,
        a.notes,
        a.created_at,
        a.updated_at
      FROM admissions a
      JOIN users u ON a.patient_id = u.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      LEFT JOIN users doc_user ON d.user_id = doc_user.id
      WHERE a.patient_id = ?
      ORDER BY a.admission_date DESC
    `, [id]);

    connection.release();

    res.json({
      success: true,
      patient: rows[0] || null,
      admissions: rows.map(a => ({
        admission_id: a.admission_id,
        patient_id: a.patient_id,
        patient_name: a.patient_name,
        patient_email: a.patient_email,
        patient_phone: a.patient_phone,
        patient_status: a.patient_status,
        doctor_name: a.doctor_name,
        specialization: a.specialization,
        room_number: a.room_number,
        bed_number: a.bed_number,
        admission_type: a.admission_type,
        reason_for_admission: a.reason_for_admission,
        admitting_diagnosis: a.admitting_diagnosis,
        admission_date: a.admission_date,
        discharge_date: a.discharge_date,
        discharge_data: a.discharge_data,
        status: a.status,
        notes: a.notes,
        created_at: a.created_at,
        updated_at: a.updated_at
      }))
    });
  } catch (err) {
    console.error('Error fetching patient discharge history:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/admin/patients/:id/history
 * Get full activity history for any patient (including discharged)
 */
router.get('/patients/:id/history', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [patients] = await connection.execute(`
      SELECT id, name, email, phone, address, created_at, patient_status, is_active
      FROM users WHERE id = ? AND role = 'patient'
    `, [id]);

    if (patients.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const patient = patients[0];

    const [appointments] = await connection.execute(`
      SELECT id, appointment_date, appointment_time, status, reason, notes, created_at
      FROM appointments
      WHERE patient_id = ?
      ORDER BY appointment_date DESC
      LIMIT 20
    `, [id]);

    const [admissions] = await connection.execute(`
      SELECT
        a.id, a.admission_type, a.admission_date, a.discharge_date,
        a.room_number, a.bed_number, a.reason_for_admission,
        a.admitting_diagnosis, a.discharge_data, a.status, a.notes, a.created_at,
        d.name as doctor_name
      FROM admissions a
      LEFT JOIN doctors doc ON a.doctor_id = doc.id
      LEFT JOIN users d ON doc.user_id = d.id
      WHERE a.patient_id = ?
      ORDER BY a.admission_date DESC
      LIMIT 20
    `, [id]);

    const [medications] = await connection.execute(`
      SELECT m.id, m.medication_name, m.dosage, m.frequency, m.duration, m.instructions,
             m.status, m.prescribed_date, u.name as doctor_name
      FROM medications m
      JOIN doctors d ON m.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE m.patient_id = ?
      ORDER BY m.prescribed_date DESC
      LIMIT 20
    `, [id]);

    const [examinations] = await connection.execute(`
      SELECT id, examination_date, vital_signs, chief_complaint, examination_notes,
             findings, diagnosis, treatment_plan, status
      FROM examinations
      WHERE patient_id = ?
      ORDER BY examination_date DESC
      LIMIT 20
    `, [id]);

    const [testReferrals] = await connection.execute(`
      SELECT tr.id, tr.test_type, tr.test_name, tr.urgency, tr.status, tr.created_at,
             u.name as doctor_name
      FROM test_referrals tr
      JOIN doctors d ON tr.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE tr.patient_id = ?
      ORDER BY tr.created_at DESC
      LIMIT 20
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
        patientStatus: patient.patient_status,
        isActive: patient.is_active
      },
      appointments: appointments,
      admissions: admissions.map(a => ({
        ...a,
        dischargeData: a.discharge_data ? (typeof a.discharge_data === 'string' ? JSON.parse(a.discharge_data) : a.discharge_data) : null
      })),
      medications: medications,
      examinations: examinations,
      testReferrals: testReferrals
    });
  } catch (err) {
    console.error('Error fetching patient history:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

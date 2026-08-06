/**
 * Messages API Routes
 * Provides endpoints for patients to send and view messages
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { checkPermission, PERMISSIONS } = require('../config/permissions');

/**
 * GET /api/messages
 * Get all messages for the logged-in patient (both sent and received)
 * Permission: VIEW_OWN_MESSAGES (patient)
 */
router.get('/', checkPermission(PERMISSIONS.VIEW_OWN_MESSAGES), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { type = 'all', limit = 50, offset = 0, unread_only = false } = req.query;
    
    let query = '';
    let params = [];
    
    if (type === 'received') {
      // Messages received by patient
      query = `
        SELECT 
          m.id,
          m.sender_id,
          m.receiver_id,
          m.subject,
          m.message,
          m.is_read,
          m.created_at,
          u.name as sender_name,
          u.role as sender_role
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.receiver_id = ?
      `;
      params = [patientId];
      
      if (unread_only === 'true') {
        query += ' AND m.is_read = FALSE';
      }
    } else if (type === 'sent') {
      // Messages sent by patient
      query = `
        SELECT 
          m.id,
          m.sender_id,
          m.receiver_id,
          m.subject,
          m.message,
          m.is_read,
          m.created_at,
          u.name as receiver_name,
          u.role as receiver_role
        FROM messages m
        JOIN users u ON m.receiver_id = u.id
        WHERE m.sender_id = ?
      `;
      params = [patientId];
    } else {
      // All messages (both sent and received)
      query = `
        SELECT 
          m.id,
          m.sender_id,
          m.receiver_id,
          m.subject,
          m.message,
          m.is_read,
          m.created_at,
          sender.name as sender_name,
          sender.role as sender_role,
          receiver.name as receiver_name,
          receiver.role as receiver_role
        FROM messages m
        JOIN users sender ON m.sender_id = sender.id
        JOIN users receiver ON m.receiver_id = receiver.id
        WHERE m.sender_id = ? OR m.receiver_id = ?
      `;
      params = [patientId, patientId];
    }
    
    query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const connection = await pool.getConnection();
    // Use query() instead of execute() to avoid MySQL prepared statement LIMIT issues
    const [messages] = await connection.query(query, params);
    
    // Get unread count
    const [unreadCount] = await connection.execute(`
      SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = FALSE
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: messages.length,
      unreadCount: unreadCount[0].count,
      messages: messages.map(msg => ({
        id: msg.id,
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        subject: msg.subject,
        message: msg.message,
        isRead: msg.is_read,
        createdAt: msg.created_at,
        senderName: msg.sender_name || msg.receiver_name,
        senderRole: msg.sender_role || msg.receiver_role,
        direction: msg.sender_id === patientId ? 'sent' : 'received'
      }))
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch messages' 
    });
  }
});

/**
 * GET /api/messages/unread-count-generic
 * Get unread message count for the logged-in user (any role)
 * Public for authenticated users - no specific permission required
 * Must be placed BEFORE /:id route to avoid route parameter conflict
 */
router.get('/unread-count-generic', async (req, res) => {
  const userId = req.session.userId;
  const userRole = req.session.userRole;

  if (!userId) {
    return res.json({
      success: true,
      unreadMessages: 0,
      unreadNotifications: 0,
      total: 0,
      message: 'Not authenticated'
    });
  }

  try {
    const connection = await pool.getConnection();

    let unreadCount = 0;
    if (userRole === 'admin' || userRole === 'staff' || userRole === 'nurse' || userRole === 'customer_care') {
      const [result] = await connection.execute(
        'SELECT COUNT(*) as count FROM messages WHERE is_read = FALSE'
      );
      unreadCount = result[0].count;
    } else {
      const [result] = await connection.execute(
        'SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = FALSE',
        [userId]
      );
      unreadCount = result[0].count;
    }

    let notificationCount = 0;
    if (userRole === 'admin' || userRole === 'staff' || userRole === 'nurse' || userRole === 'customer_care') {
      const [aptResult] = await connection.execute(
        'SELECT COUNT(*) as count FROM appointments WHERE status IN (\'pending\', \'scheduled\') AND appointment_date >= CURDATE()'
      );
      notificationCount = aptResult[0].count;
    } else if (userRole === 'doctor') {
      const [aptResult] = await connection.execute(
        'SELECT COUNT(*) as count FROM appointments a JOIN doctors d ON a.doctor_id = d.id WHERE d.user_id = ? AND a.status IN (\'pending\', \'scheduled\', \'confirmed\') AND a.appointment_date >= CURDATE()',
        [userId]
      );
      notificationCount = aptResult[0].count;
    }

    connection.release();

    res.json({
      success: true,
      unreadMessages: unreadCount,
      unreadNotifications: notificationCount,
      total: unreadCount + notificationCount
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count'
    });
  }
});

/**
 * GET /api/messages/unread-count
 * Get unread message count for the logged-in patient
 * Permission: VIEW_OWN_MESSAGES (patient)
 */
router.get('/unread-count', checkPermission(PERMISSIONS.VIEW_OWN_MESSAGES), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const connection = await pool.getConnection();
    
    const [result] = await connection.execute(`
      SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = FALSE
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      unreadCount: result[0].count
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch unread count' 
    });
  }
});

/**
 * POST /api/messages
 * Send a new message to a doctor
 * Permission: MESSAGE_DOCTOR (patient)
 */
router.post('/', checkPermission(PERMISSIONS.MESSAGE_DOCTOR), async (req, res) => {
  try {
    const senderId = req.session.userId;
    const { receiver_id, subject, message, parent_message_id, appointment_id, category } = req.body;
    
    // Validate required fields
    if (!receiver_id || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Receiver ID and message are required' 
      });
    }
    
    // Verify receiver exists and is a doctor
    const connection = await pool.getConnection();
    const [users] = await connection.execute(`
      SELECT id, name, role FROM users WHERE id = ?
    `, [receiver_id]);
    
    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Recipient not found' 
      });
    }
    
    const recipient = users[0];
    
    // Check if recipient is a doctor, staff, or nurse
    const isDoctorOrStaff = recipient.role === 'doctor' || recipient.role === 'staff' || recipient.role === 'nurse';
    
    // If not doctor/staff, check if there's an appointment relationship
    let actualDoctorId = null;
    if (recipient.role === 'doctor') {
      // Get the doctor's ID from doctors table
      const [doctorRec] = await connection.execute(`
        SELECT id FROM doctors WHERE user_id = ?
      `, [receiver_id]);
      
      if (doctorRec.length > 0) {
        actualDoctorId = doctorRec[0].id;
      }
    }
    
    if (!isDoctorOrStaff && !actualDoctorId) {
      // Verify there's an appointment between sender and receiver
      const [appointments] = await connection.execute(`
        SELECT id FROM appointments 
        WHERE patient_id = ? AND doctor_id = ? 
        AND status IN ('scheduled', 'confirmed', 'pending', 'completed')
        LIMIT 1
      `, [senderId, receiver_id]);
      
      if (appointments.length === 0) {
        connection.release();
        return res.status(400).json({ 
          success: false, 
          message: 'You can only message doctors you have an appointment with' 
        });
      }
    } else if (actualDoctorId) {
      // For doctors, also verify there's an appointment
      const [appointments] = await connection.execute(`
        SELECT id FROM appointments 
        WHERE patient_id = ? AND doctor_id = ? 
        AND status IN ('scheduled', 'confirmed', 'pending', 'completed')
        LIMIT 1
      `, [senderId, actualDoctorId]);
      
      if (appointments.length === 0) {
        connection.release();
        return res.status(400).json({ 
          success: false, 
          message: 'You can only message doctors you have an appointment with' 
        });
      }
    }
    
    // Create the message with appointment_id and category
    const [result] = await connection.execute(`
      INSERT INTO messages (sender_id, receiver_id, subject, message, parent_message_id, appointment_id, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [senderId, receiver_id, subject || null, message, parent_message_id || null, appointment_id || null, category || 'General']);
    
    connection.release();
    
    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      messageId: result.insertId
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send message' 
    });
  }
});

/**
 * POST /api/messages/:id/read
 * Mark a message as read
 * Permission: VIEW_OWN_MESSAGES (patient)
 */
router.post('/:id/read', checkPermission(PERMISSIONS.VIEW_OWN_MESSAGES), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    // Verify message exists and belongs to this patient
    const [messages] = await connection.execute(`
      SELECT id, is_read FROM messages WHERE id = ? AND receiver_id = ?
    `, [id, patientId]);
    
    if (messages.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Message not found' 
      });
    }
    
    // Mark as read if not already
    if (!messages[0].is_read) {
      await connection.execute(`
        UPDATE messages SET is_read = TRUE WHERE id = ?
      `, [id]);
    }
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark message as read' 
    });
  }
});

/**
 * POST /api/messages/read-all
 * Mark all messages as read for the logged-in patient
 * Permission: VIEW_OWN_MESSAGES (patient)
 */
router.post('/read-all', checkPermission(PERMISSIONS.VIEW_OWN_MESSAGES), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const connection = await pool.getConnection();
    
    await connection.execute(`
      UPDATE messages SET is_read = TRUE WHERE receiver_id = ? AND is_read = FALSE
    `, [patientId]);
    
    connection.release();
    
    res.json({
      success: true,
      message: 'All messages marked as read'
    });
  } catch (error) {
    console.error('Error marking all messages as read:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark messages as read' 
    });
  }
});

/**
 * GET /api/messages/:id
 * Get specific message details
 * Permission: VIEW_OWN_MESSAGES (patient)
 */
router.get('/:id', checkPermission(PERMISSIONS.VIEW_OWN_MESSAGES), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { id } = req.params;
    
    const connection = await pool.getConnection();
    
    const [messages] = await connection.execute(`
      SELECT 
        m.id,
        m.sender_id,
        m.receiver_id,
        m.subject,
        m.message,
        m.is_read,
        m.created_at,
        m.parent_message_id,
        sender.name as sender_name,
        sender.role as sender_role,
        receiver.name as receiver_name,
        receiver.role as receiver_role
      FROM messages m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id
      WHERE m.id = ? AND (m.sender_id = ? OR m.receiver_id = ?)
    `, [id, patientId, patientId]);
    
    if (messages.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Message not found' 
      });
    }
    
    const msg = messages[0];
    
    // Mark as read if not already
    if (!msg.is_read && msg.receiver_id === patientId) {
      await connection.execute(`
        UPDATE messages SET is_read = TRUE WHERE id = ?
      `, [id]);
    }
    
    connection.release();
    
    res.json({
      success: true,
      message: {
        id: msg.id,
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        subject: msg.subject,
        message: msg.message,
        isRead: msg.is_read,
        createdAt: msg.created_at,
        parentMessageId: msg.parent_message_id,
        senderName: msg.sender_name,
        senderRole: msg.sender_role,
        receiverName: msg.receiver_name,
        receiverRole: msg.receiver_role
      }
    });
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch message' 
    });
  }
});

/**
 * GET /api/messages/conversation/:doctorId
 * Get conversation history with a specific doctor
 * Permission: VIEW_OWN_MESSAGES (patient)
 */
router.get('/conversation/:doctorId', checkPermission(PERMISSIONS.VIEW_OWN_MESSAGES), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { doctorId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const connection = await pool.getConnection();
    
    const [messages] = await connection.query(`
      SELECT 
        m.id,
        m.sender_id,
        m.receiver_id,
        m.subject,
        m.message,
        m.is_read,
        m.created_at,
        sender.name as sender_name,
        receiver.name as receiver_name
      FROM messages m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id
      WHERE (m.sender_id = ? AND m.receiver_id = ?) 
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at ASC
      LIMIT ? OFFSET ?
    `, [patientId, doctorId, doctorId, patientId, parseInt(limit), parseInt(offset)]);
    
    connection.release();
    
    res.json({
      success: true,
      count: messages.length,
      doctorId: doctorId,
      messages: messages.map(msg => ({
        id: msg.id,
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        subject: msg.subject,
        message: msg.message,
        isRead: msg.is_read,
        createdAt: msg.created_at,
        senderName: msg.sender_name,
        direction: msg.sender_id === patientId ? 'sent' : 'received'
      }))
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch conversation' 
    });
  }
});

/**
 * GET /api/messages/doctor/inbox
 * Get all messages received by a doctor from their patients
 * Permission: VIEW_PATIENT_MESSAGES (doctor)
 */
router.get('/doctor/inbox', checkPermission(PERMISSIONS.VIEW_PATIENT_MESSAGES), async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const { limit = 50, offset = 0, unread_only = false } = req.query;
    
    const connection = await pool.getConnection();
    
    let query = `
      SELECT 
        m.id,
        m.sender_id,
        m.receiver_id,
        m.subject,
        m.message,
        m.is_read,
        m.appointment_id,
        m.category,
        m.created_at,
        u.name as patient_name,
        u.email as patient_email,
        a.appointment_date,
        a.appointment_time,
        a.reason
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN appointments a ON m.appointment_id = a.id
      WHERE m.receiver_id = ?
    `;
    
    const params = [doctorId];
    
    if (unread_only === 'true') {
      query += ' AND m.is_read = FALSE';
    }
    
    query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [messages] = await connection.query(query, params);
    
    // Get unread count
    const [unreadCount] = await connection.execute(`
      SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = FALSE
    `, [doctorId]);
    
    connection.release();
    
    res.json({
      success: true,
      count: messages.length,
      unreadCount: unreadCount[0].count,
      messages: messages.map(msg => ({
        id: msg.id,
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        subject: msg.subject,
        message: msg.message,
        isRead: msg.is_read,
        category: msg.category,
        appointmentId: msg.appointment_id,
        appointmentDate: msg.appointment_date,
        appointmentTime: msg.appointment_time,
        appointmentReason: msg.reason,
        createdAt: msg.created_at,
        patientName: msg.patient_name,
        patientEmail: msg.patient_email
      }))
    });
  } catch (error) {
    console.error('Error fetching doctor inbox:', error);
    if (connection) {
      connection.release();
    }
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch messages' 
    });
  }
});

/**
 * POST /api/messages/doctor/:messageId/read
 * Mark a message as read (for doctor)
 * Permission: VIEW_PATIENT_MESSAGES (doctor)
 */
router.post('/doctor/:messageId/read', checkPermission(PERMISSIONS.VIEW_PATIENT_MESSAGES), async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const { messageId } = req.params;
    
    const connection = await pool.getConnection();
    
    // Verify message belongs to this doctor
    const [messages] = await connection.execute(`
      SELECT id, is_read FROM messages WHERE id = ? AND receiver_id = ?
    `, [messageId, doctorId]);
    
    if (messages.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Message not found' 
      });
    }
    
    // Mark as read
    await connection.execute(`
      UPDATE messages SET is_read = TRUE WHERE id = ?
    `, [messageId]);
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark message as read' 
    });
  }
});

/**
 * POST /api/messages/doctor/reply/:messageId
 * Reply to a patient message (doctor)
 * Permission: REPLY_MESSAGES (doctor)
 */
router.post('/doctor/reply/:messageId', checkPermission(PERMISSIONS.REPLY_MESSAGES), async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const { messageId } = req.params;
    const { message, subject } = req.body;
    
    // Validate required fields
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Reply message is required' 
      });
    }
    
    const connection = await pool.getConnection();
    
    // Get the original message to find the patient
    const [originalMessages] = await connection.execute(`
      SELECT id, sender_id, receiver_id, subject 
      FROM messages 
      WHERE id = ? AND receiver_id = ?
    `, [messageId, doctorId]);
    
    if (originalMessages.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Original message not found' 
      });
    }
    
    const originalMessage = originalMessages[0];
    const patientId = originalMessage.sender_id;
    
    // Create the reply message
    const [result] = await connection.execute(`
      INSERT INTO messages (sender_id, receiver_id, subject, message, parent_message_id, category)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      doctorId, 
      patientId, 
      subject || `Re: ${originalMessage.subject || 'Message'}`,
      message, 
      messageId,
      'Doctor Reply'
    ]);
    
    // Mark the original message as read
    await connection.execute(`
      UPDATE messages SET is_read = TRUE WHERE id = ?
    `, [messageId]);
    
    connection.release();
    
    res.status(201).json({
      success: true,
      message: 'Reply sent successfully',
      messageId: result.insertId
    });
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send reply' 
    });
  }
});

/**
 * POST /api/messages/patient/reply/:messageId
 * Reply to a doctor message (patient)
 * Permission: MESSAGE_DOCTOR (patient)
 */
router.post('/patient/reply/:messageId', checkPermission(PERMISSIONS.MESSAGE_DOCTOR), async (req, res) => {
  try {
    const patientId = req.session.userId;
    const { messageId } = req.params;
    const { message, subject } = req.body;
    
    // Validate required fields
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Reply message is required' 
      });
    }
    
    const connection = await pool.getConnection();
    
    // Get the original message to find the doctor
    const [originalMessages] = await connection.execute(`
      SELECT id, sender_id, receiver_id, subject 
      FROM messages 
      WHERE id = ? AND sender_id = ?
    `, [messageId, patientId]);
    
    // Also check if patient received a message from doctor
    const [receivedMessages] = await connection.execute(`
      SELECT id, sender_id, receiver_id, subject 
      FROM messages 
      WHERE id = ? AND receiver_id = ?
    `, [messageId, patientId]);
    
    if (originalMessages.length === 0 && receivedMessages.length === 0) {
      connection.release();
      return res.status(404).json({ 
        success: false, 
        message: 'Original message not found' 
      });
    }
    
    // Determine the doctor (sender if received, receiver if sent)
    let doctorId;
    let originalSubject;
    if (receivedMessages.length > 0) {
      // Patient received a message from doctor
      doctorId = receivedMessages[0].sender_id;
      originalSubject = receivedMessages[0].subject;
    } else {
      // Patient sent a message to doctor, reply to that thread
      doctorId = originalMessages[0].receiver_id;
      originalSubject = originalMessages[0].subject;
    }
    
    // Verify there's an appointment between patient and doctor
    const [appointments] = await connection.execute(`
      SELECT id FROM appointments 
      WHERE patient_id = ? AND doctor_id = ? 
      AND status IN ('scheduled', 'confirmed', 'pending', 'completed')
      LIMIT 1
    `, [patientId, doctorId]);
    
    if (appointments.length === 0) {
      connection.release();
      return res.status(400).json({ 
        success: false, 
        message: 'You can only reply to doctors you have an appointment with' 
      });
    }
    
    // Create the reply message
    const [result] = await connection.execute(`
      INSERT INTO messages (sender_id, receiver_id, subject, message, parent_message_id, category)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      patientId, 
      doctorId, 
      subject || `Re: ${originalSubject || 'Message'}`,
      message, 
      messageId,
      'Patient Reply'
    ]);
    
    connection.release();
    
    res.status(201).json({
      success: true,
      message: 'Reply sent successfully',
      messageId: result.insertId
    });
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send reply' 
    });
  }
});

module.exports = router;


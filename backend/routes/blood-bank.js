/**
 * Blood Bank API Routes
 * Endpoints for blood bank inventory, donors, issues, and transfusions
 */

const express = require('express');
const pool = require('../config/database');
const router = express.Router();
const { checkPermission, PERMISSIONS } = require('../config/permissions');

// ==================== BLOOD BANK STATS ====================

router.get('/stats', checkPermission(PERMISSIONS.VIEW_BLOOD_BANK), async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [totalUnits] = await connection.execute('SELECT COUNT(*) as count FROM blood_bank_inventory');
    const [availableUnits] = await connection.execute("SELECT COUNT(*) as count FROM blood_bank_inventory WHERE status = 'available'");
    const [reservedUnits] = await connection.execute("SELECT COUNT(*) as count FROM blood_bank_inventory WHERE status = 'reserved'");
    const [issuedUnits] = await connection.execute("SELECT COUNT(*) as count FROM blood_bank_inventory WHERE status = 'issued'");
    const [expiredUnits] = await connection.execute("SELECT COUNT(*) as count FROM blood_bank_inventory WHERE status = 'expired'");
    const [expiringSoon] = await connection.execute("SELECT COUNT(*) as count FROM blood_bank_inventory WHERE status = 'available' AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)");
    const [totalDonors] = await connection.execute('SELECT COUNT(*) as count FROM blood_donors WHERE status = \'active\'');
    const [pendingIssues] = await connection.execute("SELECT COUNT(*) as count FROM blood_issues WHERE status = 'issued'");
    const [transfusionsToday] = await connection.execute("SELECT COUNT(*) as count FROM blood_transfusions WHERE DATE(transfusion_date) = CURDATE()");

    connection.release();

    res.json({
      success: true,
      stats: {
        totalUnits: totalUnits[0].count,
        availableUnits: availableUnits[0].count,
        reservedUnits: reservedUnits[0].count,
        issuedUnits: issuedUnits[0].count,
        expiredUnits: expiredUnits[0].count,
        expiringSoon: expiringSoon[0].count,
        totalDonors: totalDonors[0].count,
        pendingIssues: pendingIssues[0].count,
        transfusionsToday: transfusionsToday[0].count
      }
    });
  } catch (err) {
    console.error('Error in blood bank stats:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== BLOOD INVENTORY ====================

router.get('/inventory', checkPermission(PERMISSIONS.VIEW_BLOOD_BANK), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const { status, blood_group, component, search } = req.query;

    let query = 'SELECT * FROM blood_bank_inventory WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (blood_group) {
      query += ' AND blood_group = ?';
      params.push(blood_group);
    }
    if (component) {
      query += ' AND component = ?';
      params.push(component);
    }
    if (search) {
      query += ' AND (donor_name LIKE ? OR storage_location LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, params);
    connection.release();

    res.json({
      success: true,
      inventory: rows.map(row => ({
        id: row.id,
        bloodGroup: row.blood_group,
        component: row.component,
        quantity: row.quantity,
        unitType: row.unit_type,
        donorId: row.donor_id,
        donorName: row.donor_name,
        collectionDate: row.collection_date,
        expiryDate: row.expiry_date,
        status: row.status,
        storageLocation: row.storage_location,
        notes: row.notes,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (err) {
    console.error('Error fetching blood inventory:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/inventory/:id', checkPermission(PERMISSIONS.VIEW_BLOOD_BANK), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [rows] = await connection.execute('SELECT * FROM blood_bank_inventory WHERE id = ?', [id]);
    connection.release();

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Blood unit not found' });
    }

    const row = rows[0];
    res.json({
      success: true,
      inventory: {
        id: row.id,
        bloodGroup: row.blood_group,
        component: row.component,
        quantity: row.quantity,
        unitType: row.unit_type,
        donorId: row.donor_id,
        donorName: row.donor_name,
        collectionDate: row.collection_date,
        expiryDate: row.expiry_date,
        status: row.status,
        storageLocation: row.storage_location,
        notes: row.notes,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    console.error('Error fetching blood unit:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/inventory', checkPermission(PERMISSIONS.MANAGE_BLOOD_BANK), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      blood_group,
      component,
      quantity,
      unit_type,
      donor_id,
      donor_name,
      collection_date,
      expiry_date,
      storage_location,
      notes
    } = req.body;

    if (!blood_group || !component || !collection_date || !expiry_date) {
      connection.release();
      return res.status(400).json({ success: false, message: 'blood_group, component, collection_date and expiry_date are required' });
    }

    const [result] = await connection.execute(
      `INSERT INTO blood_bank_inventory (blood_group, component, quantity, unit_type, donor_id, donor_name, collection_date, expiry_date, storage_location, notes, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
      [
        blood_group,
        component,
        quantity || 1,
        unit_type || 'unit',
        donor_id || null,
        donor_name || null,
        collection_date,
        expiry_date,
        storage_location || null,
        notes || null,
        req.session.userId
      ]
    );

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Blood unit added to inventory',
      id: result.insertId
    });
  } catch (err) {
    connection.release();
    console.error('Error adding blood unit:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/inventory/:id', checkPermission(PERMISSIONS.MANAGE_BLOOD_BANK), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const {
      blood_group,
      component,
      quantity,
      unit_type,
      donor_id,
      donor_name,
      collection_date,
      expiry_date,
      status,
      storage_location,
      notes
    } = req.body;

    const [existing] = await connection.execute('SELECT * FROM blood_bank_inventory WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Blood unit not found' });
    }

    const updateFields = [];
    const updateValues = [];

    if (blood_group) { updateFields.push('blood_group = ?'); updateValues.push(blood_group); }
    if (component) { updateFields.push('component = ?'); updateValues.push(component); }
    if (quantity !== undefined) { updateFields.push('quantity = ?'); updateValues.push(quantity); }
    if (unit_type) { updateFields.push('unit_type = ?'); updateValues.push(unit_type); }
    if (donor_id !== undefined) { updateFields.push('donor_id = ?'); updateValues.push(donor_id); }
    if (donor_name !== undefined) { updateFields.push('donor_name = ?'); updateValues.push(donor_name); }
    if (collection_date) { updateFields.push('collection_date = ?'); updateValues.push(collection_date); }
    if (expiry_date) { updateFields.push('expiry_date = ?'); updateValues.push(expiry_date); }
    if (status) { updateFields.push('status = ?'); updateValues.push(status); }
    if (storage_location !== undefined) { updateFields.push('storage_location = ?'); updateValues.push(storage_location); }
    if (notes !== undefined) { updateFields.push('notes = ?'); updateValues.push(notes); }

    updateValues.push(id);

    await connection.execute(`UPDATE blood_bank_inventory SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    connection.release();

    res.json({ success: true, message: 'Blood unit updated successfully' });
  } catch (err) {
    connection.release();
    console.error('Error updating blood unit:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/inventory/:id', checkPermission(PERMISSIONS.MANAGE_BLOOD_BANK), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const [existing] = await connection.execute('SELECT * FROM blood_bank_inventory WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Blood unit not found' });
    }

    await connection.execute('DELETE FROM blood_bank_inventory WHERE id = ?', [id]);
    connection.release();

    res.json({ success: true, message: 'Blood unit deleted successfully' });
  } catch (err) {
    connection.release();
    console.error('Error deleting blood unit:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== BLOOD DONORS ====================

router.get('/donors', checkPermission(PERMISSIONS.VIEW_BLOOD_BANK), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const { search, blood_group, status } = req.query;

    let query = 'SELECT * FROM blood_donors WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (blood_group) {
      query += ' AND blood_group = ?';
      params.push(blood_group);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, params);
    connection.release();

    res.json({
      success: true,
      donors: rows.map(row => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        gender: row.gender,
        bloodGroup: row.blood_group,
        phone: row.phone,
        email: row.email,
        address: row.address,
        emergencyContact: row.emergency_contact,
        medicalConditions: row.medical_conditions,
        lastDonationDate: row.last_donation_date,
        totalDonations: row.total_donations,
        status: row.status,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (err) {
    console.error('Error fetching blood donors:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/donors/:id', checkPermission(PERMISSIONS.VIEW_BLOOD_BANK), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [rows] = await connection.execute('SELECT * FROM blood_donors WHERE id = ?', [id]);
    connection.release();

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Donor not found' });
    }

    const row = rows[0];
    res.json({
      success: true,
      donor: {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        gender: row.gender,
        bloodGroup: row.blood_group,
        phone: row.phone,
        email: row.email,
        address: row.address,
        emergencyContact: row.emergency_contact,
        medicalConditions: row.medical_conditions,
        lastDonationDate: row.last_donation_date,
        totalDonations: row.total_donations,
        status: row.status,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    console.error('Error fetching donor:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/donors', checkPermission(PERMISSIONS.MANAGE_BLOOD_BANK), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      first_name,
      last_name,
      date_of_birth,
      gender,
      blood_group,
      phone,
      email,
      address,
      emergency_contact,
      medical_conditions,
      notes
    } = req.body;

    if (!first_name || !last_name || !blood_group) {
      connection.release();
      return res.status(400).json({ success: false, message: 'first_name, last_name and blood_group are required' });
    }

    const [result] = await connection.execute(
      `INSERT INTO blood_donors (first_name, last_name, date_of_birth, gender, blood_group, phone, email, address, emergency_contact, medical_conditions, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        first_name,
        last_name,
        date_of_birth || null,
        gender || null,
        blood_group,
        phone || null,
        email || null,
        address || null,
        emergency_contact || null,
        medical_conditions || null,
        notes || null
      ]
    );

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Donor added successfully',
      id: result.insertId
    });
  } catch (err) {
    connection.release();
    console.error('Error adding donor:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/donors/:id', checkPermission(PERMISSIONS.MANAGE_BLOOD_BANK), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const {
      first_name,
      last_name,
      date_of_birth,
      gender,
      blood_group,
      phone,
      email,
      address,
      emergency_contact,
      medical_conditions,
      last_donation_date,
      total_donations,
      status,
      notes
    } = req.body;

    const [existing] = await connection.execute('SELECT * FROM blood_donors WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Donor not found' });
    }

    const updateFields = [];
    const updateValues = [];

    if (first_name) { updateFields.push('first_name = ?'); updateValues.push(first_name); }
    if (last_name) { updateFields.push('last_name = ?'); updateValues.push(last_name); }
    if (date_of_birth !== undefined) { updateFields.push('date_of_birth = ?'); updateValues.push(date_of_birth); }
    if (gender) { updateFields.push('gender = ?'); updateValues.push(gender); }
    if (blood_group) { updateFields.push('blood_group = ?'); updateValues.push(blood_group); }
    if (phone !== undefined) { updateFields.push('phone = ?'); updateValues.push(phone); }
    if (email !== undefined) { updateFields.push('email = ?'); updateValues.push(email); }
    if (address !== undefined) { updateFields.push('address = ?'); updateValues.push(address); }
    if (emergency_contact !== undefined) { updateFields.push('emergency_contact = ?'); updateValues.push(emergency_contact); }
    if (medical_conditions !== undefined) { updateFields.push('medical_conditions = ?'); updateValues.push(medical_conditions); }
    if (last_donation_date !== undefined) { updateFields.push('last_donation_date = ?'); updateValues.push(last_donation_date); }
    if (total_donations !== undefined) { updateFields.push('total_donations = ?'); updateValues.push(total_donations); }
    if (status) { updateFields.push('status = ?'); updateValues.push(status); }
    if (notes !== undefined) { updateFields.push('notes = ?'); updateValues.push(notes); }

    updateValues.push(id);

    await connection.execute(`UPDATE blood_donors SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    connection.release();

    res.json({ success: true, message: 'Donor updated successfully' });
  } catch (err) {
    connection.release();
    console.error('Error updating donor:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/donors/:id', checkPermission(PERMISSIONS.MANAGE_BLOOD_BANK), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const [existing] = await connection.execute('SELECT * FROM blood_donors WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Donor not found' });
    }

    await connection.execute('DELETE FROM blood_donors WHERE id = ?', [id]);
    connection.release();

    res.json({ success: true, message: 'Donor deleted successfully' });
  } catch (err) {
    connection.release();
    console.error('Error deleting donor:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== BLOOD ISSUES ====================

router.get('/issues', checkPermission(PERMISSIONS.VIEW_BLOOD_BANK), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const { status, patient_id } = req.query;

    let query = `
      SELECT bi.*, bbi.blood_group, bbi.component, bbi.unit_type
      FROM blood_issues bi
      LEFT JOIN blood_bank_inventory bbi ON bi.blood_unit_id = bbi.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND bi.status = ?';
      params.push(status);
    }
    if (patient_id) {
      query += ' AND bi.patient_id = ?';
      params.push(patient_id);
    }

    query += ' ORDER BY bi.issued_at DESC';
    const [rows] = await connection.execute(query, params);
    connection.release();

    res.json({
      success: true,
      issues: rows.map(row => ({
        id: row.id,
        bloodUnitId: row.blood_unit_id,
        bloodGroup: row.blood_group,
        component: row.component,
        unitType: row.unit_type,
        patientId: row.patient_id,
        patientName: row.patient_name,
        recipientName: row.recipient_name,
        recipientType: row.recipient_type,
        bloodType: row.blood_type,
        units: row.units,
        department: row.department,
        doctorId: row.doctor_id,
        issueDate: row.issue_date,
        emergency: row.emergency,
        issueReason: row.issue_reason,
        issuedBy: row.issued_by,
        issuedAt: row.issued_at,
        status: row.status,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (err) {
    console.error('Error fetching blood issues:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/issues', checkPermission(PERMISSIONS.MANAGE_BLOOD_BANK), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      blood_unit_id,
      patient_id,
      patient_name,
      recipient_name,
      recipient_type,
      blood_type,
      units,
      department,
      doctor_id,
      issue_date,
      emergency,
      issue_reason,
      notes
    } = req.body;

    if (!blood_unit_id) {
      connection.release();
      return res.status(400).json({ success: false, message: 'blood_unit_id is required' });
    }

    const [unit] = await connection.execute('SELECT * FROM blood_bank_inventory WHERE id = ?', [blood_unit_id]);
    if (unit.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Blood unit not found' });
    }

    if (unit[0].status !== 'available') {
      connection.release();
      return res.status(400).json({ success: false, message: 'Blood unit is not available for issue' });
    }

    await connection.execute('UPDATE blood_bank_inventory SET status = \'issued\' WHERE id = ?', [blood_unit_id]);

    const [result] = await connection.execute(
      `INSERT INTO blood_issues (blood_unit_id, patient_id, patient_name, recipient_name, recipient_type, blood_type, units, department, doctor_id, issue_date, emergency, issue_reason, issued_by, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')`,
      [
        blood_unit_id,
        patient_id || null,
        patient_name || null,
        recipient_name || null,
        recipient_type || 'patient',
        blood_type || unit[0].blood_group,
        units || 1,
        department || null,
        doctor_id || null,
        issue_date || new Date().toISOString().split('T')[0],
        emergency ? 1 : 0,
        issue_reason || null,
        req.session.userId,
        notes || null
      ]
    );

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Blood unit issued successfully',
      id: result.insertId
    });
  } catch (err) {
    connection.release();
    console.error('Error issuing blood unit:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/issues/:id/return', checkPermission(PERMISSIONS.MANAGE_BLOOD_BANK), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const [issue] = await connection.execute('SELECT * FROM blood_issues WHERE id = ?', [id]);
    if (issue.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Blood issue not found' });
    }

    if (issue[0].status !== 'issued') {
      connection.release();
      return res.status(400).json({ success: false, message: 'Only issued blood units can be returned' });
    }

    await connection.execute('UPDATE blood_issues SET status = \'returned\', updated_at = NOW() WHERE id = ?', [id]);
    await connection.execute('UPDATE blood_bank_inventory SET status = \'available\' WHERE id = ?', [issue[0].blood_unit_id]);

    connection.release();

    res.json({ success: true, message: 'Blood unit returned successfully' });
  } catch (err) {
    connection.release();
    console.error('Error returning blood unit:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/issues/:id/cancel', checkPermission(PERMISSIONS.MANAGE_BLOOD_BANK), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const [issue] = await connection.execute('SELECT * FROM blood_issues WHERE id = ?', [id]);
    if (issue.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Blood issue not found' });
    }

    if (issue[0].status !== 'issued') {
      connection.release();
      return res.status(400).json({ success: false, message: 'Only issued blood units can be cancelled' });
    }

    await connection.execute('UPDATE blood_issues SET status = \'cancelled\', updated_at = NOW() WHERE id = ?', [id]);
    await connection.execute('UPDATE blood_bank_inventory SET status = \'available\' WHERE id = ?', [issue[0].blood_unit_id]);

    connection.release();

    res.json({ success: true, message: 'Blood issue cancelled successfully' });
  } catch (err) {
    connection.release();
    console.error('Error cancelling blood issue:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== BLOOD TRANSFUSIONS ====================

router.get('/transfusions', checkPermission(PERMISSIONS.VIEW_BLOOD_BANK), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const { patient_id, blood_issue_id } = req.query;

    let query = `
      SELECT bt.*, bbi.blood_group, bbi.component
      FROM blood_transfusions bt
      LEFT JOIN blood_bank_inventory bbi ON bt.blood_unit_id = bbi.id
      WHERE 1=1
    `;
    const params = [];

    if (patient_id) {
      query += ' AND bt.patient_id = ?';
      params.push(patient_id);
    }
    if (blood_issue_id) {
      query += ' AND bt.blood_issue_id = ?';
      params.push(blood_issue_id);
    }

    query += ' ORDER BY bt.transfusion_date DESC';
    const [rows] = await connection.execute(query, params);
    connection.release();

    res.json({
      success: true,
      transfusions: rows.map(row => ({
        id: row.id,
        bloodIssueId: row.blood_issue_id,
        bloodUnitId: row.blood_unit_id,
        bloodGroup: row.blood_group,
        component: row.component,
        patientId: row.patient_id,
        patientName: row.patient_name,
        transfusionDate: row.transfusion_date,
        administeredBy: row.administered_by,
        volumeIssued: row.volume_issued,
        reaction: row.reaction,
        status: row.status,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (err) {
    console.error('Error fetching transfusions:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/transfusions', checkPermission(PERMISSIONS.MANAGE_BLOOD_BANK), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      blood_issue_id,
      blood_unit_id,
      patient_id,
      patient_name,
      transfusion_date,
      administered_by,
      volume_issued,
      reaction,
      status,
      notes
    } = req.body;

    if (!blood_issue_id || !blood_unit_id || !transfusion_date) {
      connection.release();
      return res.status(400).json({ success: false, message: 'blood_issue_id, blood_unit_id and transfusion_date are required' });
    }

    const [issue] = await connection.execute('SELECT * FROM blood_issues WHERE id = ?', [blood_issue_id]);
    if (issue.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Blood issue not found' });
    }

    const [result] = await connection.execute(
      `INSERT INTO blood_transfusions (blood_issue_id, blood_unit_id, patient_id, patient_name, transfusion_date, administered_by, volume_issued, reaction, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        blood_issue_id,
        blood_unit_id,
        patient_id || null,
        patient_name || null,
        transfusion_date,
        administered_by || req.session.userId,
        volume_issued || null,
        reaction || null,
        status || 'completed',
        notes || null
      ]
    );

    await connection.execute('UPDATE blood_issues SET status = \'transfused\' WHERE id = ?', [blood_issue_id]);
    await connection.execute('UPDATE blood_bank_inventory SET status = \'issued\' WHERE id = ?', [blood_unit_id]);

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Transfusion recorded successfully',
      id: result.insertId
    });
  } catch (err) {
    connection.release();
    console.error('Error recording transfusion:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

/**
 * Birth Records API Routes
 * Endpoints for managing birth records
 */

const express = require('express');
const pool = require('../config/database');
const router = express.Router();
const { checkPermission, PERMISSIONS } = require('../config/permissions');

// ==================== BIRTH RECORDS STATS ====================

router.get('/stats', checkPermission(PERMISSIONS.VIEW_BIRTH_RECORDS), async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [totalBirths] = await connection.execute('SELECT COUNT(*) as count FROM birth_records WHERE status = \'active\'');
    const [thisYearBirths] = await connection.execute("SELECT COUNT(*) as count FROM birth_records WHERE YEAR(child_dob) = YEAR(CURDATE())");
    const [maleBirths] = await connection.execute("SELECT COUNT(*) as count FROM birth_records WHERE child_gender = 'Male'");
    const [femaleBirths] = await connection.execute("SELECT COUNT(*) as count FROM birth_records WHERE child_gender = 'Female'");
    const [otherBirths] = await connection.execute("SELECT COUNT(*) as count FROM birth_records WHERE child_gender = 'Other'");

    connection.release();

    res.json({
      success: true,
      stats: {
        totalBirths: totalBirths[0].count,
        thisYearBirths: thisYearBirths[0].count,
        maleBirths: maleBirths[0].count,
        femaleBirths: femaleBirths[0].count,
        otherBirths: otherBirths[0].count
      }
    });
  } catch (err) {
    console.error('Error in birth records stats:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== BIRTH RECORDS CRUD ====================

router.get('/', checkPermission(PERMISSIONS.VIEW_BIRTH_RECORDS), async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    const connection = await pool.getConnection();

    let query = `SELECT * FROM birth_records WHERE 1=1`;
    const params = [];

    if (search) {
      query += ' AND (child_first_name LIKE ? OR child_last_name LIKE ? OR father_first_name LIKE ? OR father_last_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countQuery = `SELECT COUNT(*) as total FROM birth_records WHERE 1=1`;
    const countParams = [];

    const [[countResult]] = await connection.execute(countQuery, countParams);

    query += ` ORDER BY created_at DESC LIMIT ${Number(limit) || 50} OFFSET ${Number(offset) || 0}`;
    const [records] = await connection.execute(query, params);

    connection.release();

    res.json({
      success: true,
      data: records,
      total: countResult.total
    });
  } catch (err) {
    console.error('Error fetching birth records:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', checkPermission(PERMISSIONS.VIEW_BIRTH_RECORDS), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [records] = await connection.execute('SELECT * FROM birth_records WHERE id = ?', [id]);
    connection.release();

    if (records.length === 0) {
      return res.status(404).json({ success: false, message: 'Birth record not found' });
    }

    res.json({ success: true, data: records[0] });
  } catch (err) {
    console.error('Error fetching birth record:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', checkPermission(PERMISSIONS.MANAGE_BIRTH_RECORDS), async (req, res) => {
  try {
    const {
      child_first_name, child_middle_name, child_last_name, child_gender,
      child_dob, child_time_of_birth, place_of_birth, child_weight, child_length,
      mother_first_name, mother_middle_name, mother_last_name, mother_dob,
      mother_nationality, mother_occupation,
      father_first_name, father_middle_name, father_last_name, father_dob,
      father_nationality, father_occupation,
      attending_doctor, hospital_facility, additional_remarks
    } = req.body;

    if (!child_first_name || !child_last_name) {
      return res.status(400).json({ success: false, message: 'Child first name and last name are required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(
      `INSERT INTO birth_records (
        child_first_name, child_middle_name, child_last_name, child_gender,
        child_dob, child_time_of_birth, place_of_birth, child_weight, child_length,
        mother_first_name, mother_middle_name, mother_last_name, mother_dob,
        mother_nationality, mother_occupation,
        father_first_name, father_middle_name, father_last_name, father_dob,
        father_nationality, father_occupation,
        attending_doctor, hospital_facility, additional_remarks, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        child_first_name, child_middle_name || null, child_last_name, child_gender || 'Male',
        child_dob || null, child_time_of_birth || null, place_of_birth || null, child_weight || null, child_length || null,
        mother_first_name || null, mother_middle_name || null, mother_last_name || null, mother_dob || null,
        mother_nationality || null, mother_occupation || null,
        father_first_name || null, father_middle_name || null, father_last_name || null, father_dob || null,
        father_nationality || null, father_occupation || null,
        attending_doctor || null, hospital_facility || null, additional_remarks || null,
        req.session.userId || null
      ]
    );

    connection.release();

    res.status(201).json({ success: true, message: 'Birth record added successfully', recordId: result.insertId });
  } catch (err) {
    console.error('Error adding birth record:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', checkPermission(PERMISSIONS.MANAGE_BIRTH_RECORDS), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      child_first_name, child_middle_name, child_last_name, child_gender,
      child_dob, child_time_of_birth, place_of_birth, child_weight, child_length,
      mother_first_name, mother_middle_name, mother_last_name, mother_dob,
      mother_nationality, mother_occupation,
      father_first_name, father_middle_name, father_last_name, father_dob,
      father_nationality, father_occupation,
      attending_doctor, hospital_facility, additional_remarks
    } = req.body;

    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM birth_records WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Birth record not found' });
    }

    const updateParts = [];
    const updateValues = [];

    if (child_first_name !== undefined) { updateParts.push('child_first_name = ?'); updateValues.push(child_first_name); }
    if (child_middle_name !== undefined) { updateParts.push('child_middle_name = ?'); updateValues.push(child_middle_name || null); }
    if (child_last_name !== undefined) { updateParts.push('child_last_name = ?'); updateValues.push(child_last_name); }
    if (child_gender !== undefined) { updateParts.push('child_gender = ?'); updateValues.push(child_gender); }
    if (child_dob !== undefined) { updateParts.push('child_dob = ?'); updateValues.push(child_dob || null); }
    if (child_time_of_birth !== undefined) { updateParts.push('child_time_of_birth = ?'); updateValues.push(child_time_of_birth || null); }
    if (place_of_birth !== undefined) { updateParts.push('place_of_birth = ?'); updateValues.push(place_of_birth || null); }
    if (child_weight !== undefined) { updateParts.push('child_weight = ?'); updateValues.push(child_weight || null); }
    if (child_length !== undefined) { updateParts.push('child_length = ?'); updateValues.push(child_length || null); }
    if (mother_first_name !== undefined) { updateParts.push('mother_first_name = ?'); updateValues.push(mother_first_name || null); }
    if (mother_middle_name !== undefined) { updateParts.push('mother_middle_name = ?'); updateValues.push(mother_middle_name || null); }
    if (mother_last_name !== undefined) { updateParts.push('mother_last_name = ?'); updateValues.push(mother_last_name || null); }
    if (mother_dob !== undefined) { updateParts.push('mother_dob = ?'); updateValues.push(mother_dob || null); }
    if (mother_nationality !== undefined) { updateParts.push('mother_nationality = ?'); updateValues.push(mother_nationality || null); }
    if (mother_occupation !== undefined) { updateParts.push('mother_occupation = ?'); updateValues.push(mother_occupation || null); }
    if (father_first_name !== undefined) { updateParts.push('father_first_name = ?'); updateValues.push(father_first_name || null); }
    if (father_middle_name !== undefined) { updateParts.push('father_middle_name = ?'); updateValues.push(father_middle_name || null); }
    if (father_last_name !== undefined) { updateParts.push('father_last_name = ?'); updateValues.push(father_last_name || null); }
    if (father_dob !== undefined) { updateParts.push('father_dob = ?'); updateValues.push(father_dob || null); }
    if (father_nationality !== undefined) { updateParts.push('father_nationality = ?'); updateValues.push(father_nationality || null); }
    if (father_occupation !== undefined) { updateParts.push('father_occupation = ?'); updateValues.push(father_occupation || null); }
    if (attending_doctor !== undefined) { updateParts.push('attending_doctor = ?'); updateValues.push(attending_doctor || null); }
    if (hospital_facility !== undefined) { updateParts.push('hospital_facility = ?'); updateValues.push(hospital_facility || null); }
    if (additional_remarks !== undefined) { updateParts.push('additional_remarks = ?'); updateValues.push(additional_remarks || null); }

    if (updateParts.length === 0) {
      connection.release();
      return res.json({ success: true, message: 'No changes to update' });
    }

    updateValues.push(id);
    await connection.execute(`UPDATE birth_records SET ${updateParts.join(', ')} WHERE id = ?`, updateValues);

    connection.release();
    res.json({ success: true, message: 'Birth record updated successfully' });
  } catch (err) {
    console.error('Error updating birth record:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', checkPermission(PERMISSIONS.MANAGE_BIRTH_RECORDS), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM birth_records WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Birth record not found' });
    }

    await connection.execute('DELETE FROM birth_records WHERE id = ?', [id]);
    connection.release();

    res.json({ success: true, message: 'Birth record deleted successfully' });
  } catch (err) {
    console.error('Error deleting birth record:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

/**
 * Death Records API Routes
 * Endpoints for managing death records
 */

const express = require('express');
const pool = require('../config/database');
const router = express.Router();
const { checkPermission, PERMISSIONS } = require('../config/permissions');

// ==================== DEATH RECORDS STATS ====================

router.get('/stats', checkPermission(PERMISSIONS.VIEW_DEATH_RECORDS), async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [totalDeaths] = await connection.execute('SELECT COUNT(*) as count FROM death_records WHERE status = \'active\'');
    const [thisYearDeaths] = await connection.execute("SELECT COUNT(*) as count FROM death_records WHERE YEAR(date_of_death) = YEAR(CURDATE())");
    const [maleDeaths] = await connection.execute("SELECT COUNT(*) as count FROM death_records WHERE gender = 'Male'");
    const [femaleDeaths] = await connection.execute("SELECT COUNT(*) as count FROM death_records WHERE gender = 'Female'");
    const [otherDeaths] = await connection.execute("SELECT COUNT(*) as count FROM death_records WHERE gender = 'Other'");

    connection.release();

    res.json({
      success: true,
      stats: {
        totalDeaths: totalDeaths[0].count,
        thisYearDeaths: thisYearDeaths[0].count,
        maleDeaths: maleDeaths[0].count,
        femaleDeaths: femaleDeaths[0].count,
        otherDeaths: otherDeaths[0].count
      }
    });
  } catch (err) {
    console.error('Error in death records stats:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== DEATH RECORDS CRUD ====================

router.get('/', checkPermission(PERMISSIONS.VIEW_DEATH_RECORDS), async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    const connection = await pool.getConnection();

    let query = `SELECT * FROM death_records WHERE 1=1`;
    const params = [];

    if (search) {
      query += ' AND (full_name LIKE ? OR attending_physician LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countQuery = `SELECT COUNT(*) as total FROM death_records WHERE 1=1`;
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
    console.error('Error fetching death records:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', checkPermission(PERMISSIONS.VIEW_DEATH_RECORDS), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [records] = await connection.execute('SELECT * FROM death_records WHERE id = ?', [id]);
    connection.release();

    if (records.length === 0) {
      return res.status(404).json({ success: false, message: 'Death record not found' });
    }

    res.json({ success: true, data: records[0] });
  } catch (err) {
    console.error('Error fetching death record:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', checkPermission(PERMISSIONS.MANAGE_DEATH_RECORDS), async (req, res) => {
  try {
    const {
      full_name, gender, date_of_birth, age_at_death, place_of_birth,
      nationality, last_known_address, marital_status, occupation,
      date_of_death, time_of_death, place_of_death, immediate_cause_of_death,
      manner_of_death, attending_physician, medical_examiner,
      autopsy_performed, autopsy_findings,
      informant_name, informant_relationship, informant_contact, additional_notes
    } = req.body;

    if (!full_name) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(
      `INSERT INTO death_records (
        full_name, gender, date_of_birth, age_at_death, place_of_birth,
        nationality, last_known_address, marital_status, occupation,
        date_of_death, time_of_death, place_of_death, immediate_cause_of_death,
        manner_of_death, attending_physician, medical_examiner,
        autopsy_performed, autopsy_findings,
        informant_name, informant_relationship, informant_contact, additional_notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        full_name, gender || 'Male', date_of_birth || null, age_at_death || null, place_of_birth || null,
        nationality || null, last_known_address || null, marital_status || null, occupation || null,
        date_of_death || null, time_of_death || null, place_of_death || null, immediate_cause_of_death || null,
        manner_of_death || null, attending_physician || null, medical_examiner || null,
        autopsy_performed || 'No', autopsy_findings || null,
        informant_name || null, informant_relationship || null, informant_contact || null, additional_notes || null,
        req.session.userId || null
      ]
    );

    connection.release();

    res.status(201).json({ success: true, message: 'Death record added successfully', recordId: result.insertId });
  } catch (err) {
    console.error('Error adding death record:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', checkPermission(PERMISSIONS.MANAGE_DEATH_RECORDS), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name, gender, date_of_birth, age_at_death, place_of_birth,
      nationality, last_known_address, marital_status, occupation,
      date_of_death, time_of_death, place_of_death, immediate_cause_of_death,
      manner_of_death, attending_physician, medical_examiner,
      autopsy_performed, autopsy_findings,
      informant_name, informant_relationship, informant_contact, additional_notes
    } = req.body;

    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM death_records WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Death record not found' });
    }

    const updateParts = [];
    const updateValues = [];

    if (full_name !== undefined) { updateParts.push('full_name = ?'); updateValues.push(full_name); }
    if (gender !== undefined) { updateParts.push('gender = ?'); updateValues.push(gender); }
    if (date_of_birth !== undefined) { updateParts.push('date_of_birth = ?'); updateValues.push(date_of_birth || null); }
    if (age_at_death !== undefined) { updateParts.push('age_at_death = ?'); updateValues.push(age_at_death || null); }
    if (place_of_birth !== undefined) { updateParts.push('place_of_birth = ?'); updateValues.push(place_of_birth || null); }
    if (nationality !== undefined) { updateParts.push('nationality = ?'); updateValues.push(nationality || null); }
    if (last_known_address !== undefined) { updateParts.push('last_known_address = ?'); updateValues.push(last_known_address || null); }
    if (marital_status !== undefined) { updateParts.push('marital_status = ?'); updateValues.push(marital_status || null); }
    if (occupation !== undefined) { updateParts.push('occupation = ?'); updateValues.push(occupation || null); }
    if (date_of_death !== undefined) { updateParts.push('date_of_death = ?'); updateValues.push(date_of_death || null); }
    if (time_of_death !== undefined) { updateParts.push('time_of_death = ?'); updateValues.push(time_of_death || null); }
    if (place_of_death !== undefined) { updateParts.push('place_of_death = ?'); updateValues.push(place_of_death || null); }
    if (immediate_cause_of_death !== undefined) { updateParts.push('immediate_cause_of_death = ?'); updateValues.push(immediate_cause_of_death || null); }
    if (manner_of_death !== undefined) { updateParts.push('manner_of_death = ?'); updateValues.push(manner_of_death || null); }
    if (attending_physician !== undefined) { updateParts.push('attending_physician = ?'); updateValues.push(attending_physician || null); }
    if (medical_examiner !== undefined) { updateParts.push('medical_examiner = ?'); updateValues.push(medical_examiner || null); }
    if (autopsy_performed !== undefined) { updateParts.push('autopsy_performed = ?'); updateValues.push(autopsy_performed || null); }
    if (autopsy_findings !== undefined) { updateParts.push('autopsy_findings = ?'); updateValues.push(autopsy_findings || null); }
    if (informant_name !== undefined) { updateParts.push('informant_name = ?'); updateValues.push(informant_name || null); }
    if (informant_relationship !== undefined) { updateParts.push('informant_relationship = ?'); updateValues.push(informant_relationship || null); }
    if (informant_contact !== undefined) { updateParts.push('informant_contact = ?'); updateValues.push(informant_contact || null); }
    if (additional_notes !== undefined) { updateParts.push('additional_notes = ?'); updateValues.push(additional_notes || null); }

    if (updateParts.length === 0) {
      connection.release();
      return res.json({ success: true, message: 'No changes to update' });
    }

    updateValues.push(id);
    await connection.execute(`UPDATE death_records SET ${updateParts.join(', ')} WHERE id = ?`, updateValues);

    connection.release();
    res.json({ success: true, message: 'Death record updated successfully' });
  } catch (err) {
    console.error('Error updating death record:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', checkPermission(PERMISSIONS.MANAGE_DEATH_RECORDS), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM death_records WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Death record not found' });
    }

    await connection.execute('DELETE FROM death_records WHERE id = ?', [id]);
    connection.release();

    res.json({ success: true, message: 'Death record deleted successfully' });
  } catch (err) {
    console.error('Error deleting death record:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

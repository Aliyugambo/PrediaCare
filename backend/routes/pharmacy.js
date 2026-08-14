/**
 * Pharmacy API Routes
 * Endpoints for pharmacy medicine inventory management
 */

const express = require('express');
const pool = require('../config/database');
const router = express.Router();
const { checkPermission, PERMISSIONS } = require('../config/permissions');

// ==================== PHARMACY DASHBOARD STATS ====================

/**
 * GET /api/pharmacy/stats
 * Get pharmacy dashboard statistics
 */
router.get('/stats', checkPermission(PERMISSIONS.VIEW_PHARMACY), async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [totalMedicines] = await connection.execute(
      'SELECT COUNT(*) as count FROM pharmacy_medicines'
    );

    const [activeMedicines] = await connection.execute(
      'SELECT COUNT(*) as count FROM pharmacy_medicines WHERE status = \'active\' OR status IS NULL'
    );

    const [lowStock] = await connection.execute(
      'SELECT COUNT(*) as count FROM pharmacy_medicines WHERE (status = \'active\' OR status IS NULL) AND stock_quantity <= reorder_level'
    );

    const [expiredMedicines] = await connection.execute(
      'SELECT COUNT(*) as count FROM pharmacy_medicines WHERE (status = \'active\' OR status IS NULL) AND expiry_date < CURDATE()'
    );

    const [expiringSoon] = await connection.execute(
      'SELECT COUNT(*) as count FROM pharmacy_medicines WHERE (status = \'active\' OR status IS NULL) AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)'
    );

    const [totalStockValue] = await connection.execute(
      'SELECT COALESCE(SUM(unit_price * stock_quantity), 0) as total FROM pharmacy_medicines WHERE status = \'active\' OR status IS NULL'
    );

    const [categories] = await connection.execute(
      'SELECT COUNT(DISTINCT category) as count FROM pharmacy_medicines'
    );

    const [todaySales] = await connection.execute(
      'SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total FROM pharmacy_sales WHERE DATE(sale_date) = CURDATE()'
    );

    connection.release();

    res.json({
      success: true,
      stats: {
        totalMedicines: totalMedicines[0].count,
        activeMedicines: activeMedicines[0].count,
        lowStock: lowStock[0].count,
        expiredMedicines: expiredMedicines[0].count,
        expiringSoon: expiringSoon[0].count,
        totalStockValue: totalStockValue[0].total,
        categories: categories[0].count,
        todaySales: todaySales[0].count,
        todaySalesAmount: todaySales[0].total
      }
    });
  } catch (err) {
    console.error('Error in pharmacy stats:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== MEDICINE INVENTORY ====================

/**
 * GET /api/pharmacy/medicines
 * Get all medicines with optional filtering
 */
router.get('/medicines', checkPermission(PERMISSIONS.VIEW_PHARMACY), async (req, res) => {
  try {
    const { category, status, search, low_stock, expired, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM pharmacy_medicines WHERE 1=1';
    const params = [];

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (medicine_name LIKE ? OR generic_name LIKE ? OR supplier LIKE ? OR batch_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (low_stock === 'true') {
      query += ' AND stock_quantity <= reorder_level';
    }

    if (expired === 'true') {
      query += ' AND expiry_date < CURDATE()';
    }

    query += ` ORDER BY medicine_name ASC LIMIT ${Math.floor(Number(limit)) || 50} OFFSET ${Math.floor(Number(offset)) || 0}`;
    params.push(parseInt(limit), parseInt(offset));

    const connection = await pool.getConnection();
    const [medicines] = await connection.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM pharmacy_medicines WHERE 1=1';
    const countParams = [];
    if (category && category !== 'all') { countQuery += ' AND category = ?'; countParams.push(category); }
    if (status && status !== 'all') { countQuery += ' AND status = ?'; countParams.push(status); }
    if (search) {
      countQuery += ' AND (medicine_name LIKE ? OR generic_name LIKE ? OR supplier LIKE ? OR batch_number LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (low_stock === 'true') { countQuery += ' AND stock_quantity <= reorder_level'; }
    if (expired === 'true') { countQuery += ' AND expiry_date < CURDATE()'; }

    const [countResult] = await connection.execute(countQuery, countParams);

    // Get categories
    const [categories] = await connection.execute(
      'SELECT DISTINCT category FROM pharmacy_medicines ORDER BY category ASC'
    );

    connection.release();

    res.json({
      success: true,
      medicines: medicines.map(m => ({
        id: m.id,
        medicineName: m.medicine_name,
        genericName: m.generic_name,
        category: m.category,
        dosageForm: m.dosage_form,
        strength: m.strength,
        unitPrice: m.unit_price,
        stockQuantity: m.stock_quantity,
        reorderLevel: m.reorder_level,
        supplier: m.supplier,
        batchNumber: m.batch_number,
        manufacturingDate: m.manufacturing_date,
        expiryDate: m.expiry_date,
        description: m.description,
        sideEffects: m.side_effects,
        storageConditions: m.storage_conditions,
        status: m.status,
        createdBy: m.created_by,
        createdAt: m.created_at,
        updatedAt: m.updated_at
      })),
      categories: categories.map(c => c.category),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching pharmacy medicines:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/pharmacy/medicines/:id
 * Get a single medicine by ID
 */
router.get('/medicines/:id', checkPermission(PERMISSIONS.VIEW_PHARMACY), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [medicines] = await connection.execute(
      'SELECT * FROM pharmacy_medicines WHERE id = ?', [id]
    );

    connection.release();

    if (medicines.length === 0) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    const m = medicines[0];
    res.json({
      success: true,
      medicine: {
        id: m.id,
        medicineName: m.medicine_name,
        genericName: m.generic_name,
        category: m.category,
        dosageForm: m.dosage_form,
        strength: m.strength,
        unitPrice: m.unit_price,
        stockQuantity: m.stock_quantity,
        reorderLevel: m.reorder_level,
        supplier: m.supplier,
        batchNumber: m.batch_number,
        manufacturingDate: m.manufacturing_date,
        expiryDate: m.expiry_date,
        description: m.description,
        sideEffects: m.side_effects,
        storageConditions: m.storage_conditions,
        status: m.status,
        createdBy: m.created_by,
        createdAt: m.created_at,
        updatedAt: m.updated_at
      }
    });
  } catch (err) {
    console.error('Error fetching medicine:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/pharmacy/medicines
 * Add a new medicine to inventory
 */
router.post('/medicines', checkPermission(PERMISSIONS.MANAGE_PHARMACY), async (req, res) => {
  try {
    const {
      medicine_name, generic_name, category, dosage_form, strength,
      unit_price, stock_quantity, reorder_level, supplier, batch_number,
      manufacturing_date, expiry_date, description, side_effects,
      storage_conditions, status
    } = req.body;

    if (!medicine_name || !category || unit_price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'medicine_name, category, and unit_price are required'
      });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(
      `INSERT INTO pharmacy_medicines 
       (medicine_name, generic_name, category, dosage_form, strength, unit_price, stock_quantity, reorder_level, supplier, batch_number, manufacturing_date, expiry_date, description, side_effects, storage_conditions, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        medicine_name,
        generic_name || null,
        category,
        dosage_form || null,
        strength || null,
        parseFloat(unit_price) || 0,
        parseInt(stock_quantity) || 0,
        parseInt(reorder_level) || 10,
        supplier || null,
        batch_number || null,
        manufacturing_date || null,
        expiry_date || null,
        description || null,
        side_effects || null,
        storage_conditions || null,
        status || 'active',
        req.session.userId
      ]
    );

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Medicine added successfully',
      medicineId: result.insertId
    });
  } catch (err) {
    console.error('Error adding medicine:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/pharmacy/medicines/:id
 * Update a medicine
 */
router.put('/medicines/:id', checkPermission(PERMISSIONS.MANAGE_PHARMACY), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      medicine_name, generic_name, category, dosage_form, strength,
      unit_price, stock_quantity, reorder_level, supplier, batch_number,
      manufacturing_date, expiry_date, description, side_effects,
      storage_conditions, status
    } = req.body;

    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM pharmacy_medicines WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    const updateParts = [];
    const updateParams = [];

    if (medicine_name !== undefined) { updateParts.push('medicine_name = ?'); updateParams.push(medicine_name); }
    if (generic_name !== undefined) { updateParts.push('generic_name = ?'); updateParams.push(generic_name); }
    if (category !== undefined) { updateParts.push('category = ?'); updateParams.push(category); }
    if (dosage_form !== undefined) { updateParts.push('dosage_form = ?'); updateParams.push(dosage_form); }
    if (strength !== undefined) { updateParts.push('strength = ?'); updateParams.push(strength); }
    if (unit_price !== undefined) { updateParts.push('unit_price = ?'); updateParams.push(parseFloat(unit_price)); }
    if (stock_quantity !== undefined) { updateParts.push('stock_quantity = ?'); updateParams.push(parseInt(stock_quantity)); }
    if (reorder_level !== undefined) { updateParts.push('reorder_level = ?'); updateParams.push(parseInt(reorder_level)); }
    if (supplier !== undefined) { updateParts.push('supplier = ?'); updateParams.push(supplier); }
    if (batch_number !== undefined) { updateParts.push('batch_number = ?'); updateParams.push(batch_number); }
    if (manufacturing_date !== undefined) { updateParts.push('manufacturing_date = ?'); updateParams.push(manufacturing_date); }
    if (expiry_date !== undefined) { updateParts.push('expiry_date = ?'); updateParams.push(expiry_date); }
    if (description !== undefined) { updateParts.push('description = ?'); updateParams.push(description); }
    if (side_effects !== undefined) { updateParts.push('side_effects = ?'); updateParams.push(side_effects); }
    if (storage_conditions !== undefined) { updateParts.push('storage_conditions = ?'); updateParams.push(storage_conditions); }
    if (status !== undefined) { updateParts.push('status = ?'); updateParams.push(status); }

    if (updateParts.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    updateParams.push(id);
    await connection.execute(`UPDATE pharmacy_medicines SET ${updateParts.join(', ')} WHERE id = ?`, updateParams);

    connection.release();

    res.json({ success: true, message: 'Medicine updated successfully' });
  } catch (err) {
    console.error('Error updating medicine:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/pharmacy/medicines/:id
 * Delete a medicine from inventory
 */
router.delete('/medicines/:id', checkPermission(PERMISSIONS.MANAGE_PHARMACY), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM pharmacy_medicines WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    await connection.execute('DELETE FROM pharmacy_medicines WHERE id = ?', [id]);
    connection.release();

    res.json({ success: true, message: 'Medicine deleted successfully' });
  } catch (err) {
    console.error('Error deleting medicine:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== PHARMACY SALES ====================

/**
 * GET /api/pharmacy/sales
 * Get all pharmacy sales
 */
router.get('/sales', checkPermission(PERMISSIONS.VIEW_PHARMACY), async (req, res) => {
  try {
    const limit = Number.isInteger(parseInt(req.query.limit)) ? parseInt(req.query.limit) : 50;
    const offset = Number.isInteger(parseInt(req.query.offset)) ? parseInt(req.query.offset) : 0;

    const connection = await pool.getConnection();

    const [sales] = await connection.query(`
      SELECT ps.*, 
        pm.medicine_name,
        u_patient.name as patient_name,
        u_staff.name as sold_by_name
      FROM pharmacy_sales ps
      JOIN pharmacy_medicines pm ON ps.medicine_id = pm.id
      LEFT JOIN users u_patient ON ps.patient_id = u_patient.id
      LEFT JOIN users u_staff ON ps.sold_by = u_staff.id
      ORDER BY ps.sale_date DESC
      LIMIT ${Math.floor(Number(limit)) || 50} OFFSET ${Math.floor(Number(offset)) || 0}
    `, [limit, offset]);

    const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM pharmacy_sales');

    connection.release();

    res.json({
      success: true,
      sales: sales.map(s => ({
        id: s.id,
        medicineName: s.medicine_name,
        patientName: s.patient_name || s.customer_name || 'Walk-in',
        customerPhone: s.customer_phone || '',
        quantity: s.quantity,
        unitPrice: s.unit_price,
        totalPrice: s.total_price,
        soldBy: s.sold_by_name,
        notes: s.notes,
        saleDate: s.sale_date
      })),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching pharmacy sales:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/pharmacy/sales
 * Record a medicine sale (dispense)
 */
router.post('/sales', checkPermission(PERMISSIONS.DISPENSE_MEDICINE), async (req, res) => {
  try {
    const { medicine_id, patient_id, customer_name, customer_phone, quantity, notes } = req.body;

    if (!medicine_id || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'medicine_id and quantity are required'
      });
    }

    const connection = await pool.getConnection();

    // Check medicine exists and has enough stock
    const [medicines] = await connection.execute(
      'SELECT id, medicine_name, unit_price, stock_quantity, status FROM pharmacy_medicines WHERE id = ?',
      [medicine_id]
    );

    if (medicines.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    const medicine = medicines[0];

    if (medicine.status !== 'active') {
      connection.release();
      return res.status(400).json({ success: false, message: 'Medicine is not active' });
    }

    if (medicine.stock_quantity < parseInt(quantity)) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${medicine.stock_quantity}`
      });
    }

    const unitPrice = parseFloat(medicine.unit_price);
    const totalPrice = unitPrice * parseInt(quantity);

    // Record the sale
    const [result] = await connection.execute(
      'INSERT INTO pharmacy_sales (medicine_id, patient_id, customer_name, customer_phone, quantity, unit_price, total_price, sold_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [medicine_id, patient_id || null, customer_name || null, customer_phone || null, parseInt(quantity), unitPrice, totalPrice, req.session.userId, notes || null]
    );

    // Update stock
    await connection.execute(
      'UPDATE pharmacy_medicines SET stock_quantity = stock_quantity - ? WHERE id = ?',
      [parseInt(quantity), medicine_id]
    );

    connection.release();

    res.status(201).json({
      success: true,
      message: 'Medicine dispensed successfully',
      saleId: result.insertId,
      totalPrice: totalPrice
    });
  } catch (err) {
    console.error('Error recording pharmacy sale:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== DISCHARGE MEDICATIONS ====================

/**
 * POST /api/pharmacy/discharge-medications
 * Create discharge medication queue entries from doctor discharge form
 * Permission: DISPENSE_MEDICINE (doctor/pharmacist)
 */
router.post('/discharge-medications', checkPermission(PERMISSIONS.DISPENSE_MEDICINE), async (req, res) => {
  try {
    const { admission_id, patient_id, patient_name, medications, created_by } = req.body;

    if (!admission_id || !patient_id || !patient_name || !Array.isArray(medications)) {
      return res.status(400).json({ success: false, message: 'admission_id, patient_id, patient_name and medications array are required' });
    }

    const connection = await pool.getConnection();

    const insertPromises = medications.map(med => {
      return connection.execute(`
        INSERT INTO discharge_medications (admission_id, patient_id, patient_name, medicine_name, dosage, frequency, amount, end_date, notes, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `, [
        admission_id,
        patient_id,
        patient_name,
        med.name || med.medicine_name || '',
        med.dosage || '',
        med.frequency || '',
        med.amount || '',
        med.end_date || null,
        med.notes || '',
        created_by || req.session.userId
      ]);
    });

    await Promise.all(insertPromises);
    connection.release();

    res.status(201).json({ success: true, message: 'Discharge medications sent to pharmacy queue' });
  } catch (err) {
    console.error('Error creating discharge medications:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/pharmacy/discharge-medications
 * Get pending discharge medications for pharmacist
 * Permission: VIEW_PHARMACY (pharmacist)
 */
router.get('/discharge-medications', checkPermission(PERMISSIONS.VIEW_PHARMACY), async (req, res) => {
  try {
    const { status = 'pending', patient_id, admission_id } = req.query;
    const connection = await pool.getConnection();

    let query = `
      SELECT dm.*, u.name as created_by_name
      FROM discharge_medications dm
      LEFT JOIN users u ON dm.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND dm.status = ?';
      params.push(status);
    }
    if (patient_id) {
      query += ' AND dm.patient_id = ?';
      params.push(patient_id);
    }
    if (admission_id) {
      query += ' AND dm.admission_id = ?';
      params.push(admission_id);
    }

    query += ' ORDER BY dm.created_at DESC';
    const [rows] = await connection.execute(query, params);
    connection.release();

    res.json({
      success: true,
      dischargeMedications: rows.map(row => ({
        id: row.id,
        admissionId: row.admission_id,
        patientId: row.patient_id,
        patientName: row.patient_name,
        medicineName: row.medicine_name,
        dosage: row.dosage,
        frequency: row.frequency,
        amount: row.amount,
        endDate: row.end_date,
        notes: row.notes,
        status: row.status,
        dispensedBy: row.dispensed_by,
        dispensedAt: row.dispensed_at,
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (err) {
    console.error('Error fetching discharge medications:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/pharmacy/discharge-medications/:id/dispense
 * Mark discharge medication as dispensed
 * Permission: DISPENSE_MEDICINE (pharmacist)
 */
router.post('/discharge-medications/:id/dispense', checkPermission(PERMISSIONS.DISPENSE_MEDICINE), async (req, res) => {
  try {
    const { id } = req.params;
    const { medicine_id, quantity } = req.body;
    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT * FROM discharge_medications WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Discharge medication not found' });
    }

    const dischargeMed = existing[0];
    if (dischargeMed.status === 'dispensed') {
      connection.release();
      return res.status(400).json({ success: false, message: 'This medication has already been dispensed' });
    }

    await connection.execute(`
      UPDATE discharge_medications
      SET status = 'dispensed', dispensed_by = ?, dispensed_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `, [req.session.userId, id]);

    if (medicine_id && quantity) {
      const unitPriceRes = await connection.execute('SELECT unit_price FROM pharmacy_medicines WHERE id = ?', [medicine_id]);
      if (unitPriceRes[0].length > 0) {
        const unitPrice = parseFloat(unitPriceRes[0][0].unit_price);
        const totalPrice = unitPrice * parseInt(quantity);

        await connection.execute(`
          INSERT INTO pharmacy_sales (medicine_id, patient_id, customer_name, customer_phone, quantity, unit_price, total_price, sold_by, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          medicine_id,
          dischargeMed.patient_id,
          dischargeMed.patient_name,
          null,
          parseInt(quantity),
          unitPrice,
          totalPrice,
          req.session.userId,
          'Discharge medication dispensed'
        ]);

        await connection.execute(`
          UPDATE pharmacy_medicines SET stock_quantity = stock_quantity - ? WHERE id = ?
        `, [parseInt(quantity), medicine_id]);
      }
    }

    connection.release();

    res.json({ success: true, message: 'Discharge medication marked as dispensed' });
  } catch (err) {
    console.error('Error dispensing discharge medication:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/pharmacy/discharge-medications/:id/cancel
 * Cancel a pending discharge medication
 * Permission: DISPENSE_MEDICINE (pharmacist)
 */
router.post('/discharge-medications/:id/cancel', checkPermission(PERMISSIONS.DISPENSE_MEDICINE), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, status = 'cancelled' } = req.body;
    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT * FROM discharge_medications WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Discharge medication not found' });
    }

    const dischargeMed = existing[0];
    if (dischargeMed.status !== 'pending') {
      connection.release();
      return res.status(400).json({ success: false, message: 'Only pending discharge medications can be cancelled' });
    }

    const newStatus = status === 'not_available' ? 'not_available' : 'cancelled';

    await connection.execute(`
      UPDATE discharge_medications
      SET status = ?, notes = ?, updated_at = NOW()
      WHERE id = ?
    `, [newStatus, reason || dischargeMed.notes, id]);

    connection.release();

    res.json({ success: true, message: newStatus === 'not_available' ? 'Discharge medication marked as not available' : 'Discharge medication cancelled' });
  } catch (err) {
    console.error('Error cancelling discharge medication:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

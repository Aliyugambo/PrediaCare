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
      'SELECT COUNT(*) as count FROM pharmacy_medicines WHERE status != "discontinued"'
    );

    const [activeMedicines] = await connection.execute(
      'SELECT COUNT(*) as count FROM pharmacy_medicines WHERE status = "active"'
    );

    const [lowStock] = await connection.execute(
      'SELECT COUNT(*) as count FROM pharmacy_medicines WHERE stock_quantity <= reorder_level AND status = "active"'
    );

    const [expiredMedicines] = await connection.execute(
      'SELECT COUNT(*) as count FROM pharmacy_medicines WHERE expiry_date < CURDATE() AND status = "active"'
    );

    const [expiringSoon] = await connection.execute(
      'SELECT COUNT(*) as count FROM pharmacy_medicines WHERE expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND status = "active"'
    );

    const [totalStockValue] = await connection.execute(
      'SELECT COALESCE(SUM(unit_price * stock_quantity), 0) as total FROM pharmacy_medicines WHERE status = "active"'
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

    query += ' ORDER BY medicine_name ASC LIMIT ? OFFSET ?';
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
      LIMIT ? OFFSET ?
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

// ==================== CATEGORIES ====================

/**
 * GET /api/pharmacy/categories
 * Get all medicine categories
 */
router.get('/categories', checkPermission(PERMISSIONS.VIEW_PHARMACY), async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [categories] = await connection.execute(
      'SELECT DISTINCT category, COUNT(*) as medicine_count FROM pharmacy_medicines GROUP BY category ORDER BY category ASC'
    );

    connection.release();

    res.json({
      success: true,
      categories: categories.map(c => ({
        name: c.category,
        medicineCount: c.medicine_count
      }))
    });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

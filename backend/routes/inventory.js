/**
 * Inventory API Routes
 * Endpoints for clinic inventory, supplies, equipment, and stock management
 */

const express = require('express');
const pool = require('../config/database');
const router = express.Router();
const { checkPermission, PERMISSIONS } = require('../config/permissions');
const ExcelJS = require('exceljs');

// ==================== INVENTORY DASHBOARD STATS ====================

router.get('/stats', checkPermission(PERMISSIONS.VIEW_INVENTORY), async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [totalItems] = await connection.execute('SELECT COUNT(*) as count FROM inventory_items');
    const [lowStock] = await connection.execute('SELECT COUNT(*) as count FROM inventory_items WHERE stock_quantity <= reorder_point AND status = \'active\'');
    const [outOfStock] = await connection.execute('SELECT COUNT(*) as count FROM inventory_items WHERE stock_quantity = 0 AND status = \'active\'');
    const [expiringSoon] = await connection.execute('SELECT COUNT(*) as count FROM inventory_items WHERE expiry_date IS NOT NULL AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND status = \'active\'');
    const [pendingOrders] = await connection.execute('SELECT COUNT(*) as count FROM inventory_orders WHERE status IN (\'pending\', \'ordered\')');
    const [totalValue] = await connection.execute('SELECT COALESCE(SUM(unit_cost * stock_quantity), 0) as total FROM inventory_items WHERE status = \'active\'');

    connection.release();

    res.json({
      success: true,
      stats: {
        totalItems: totalItems[0].count,
        lowStock: lowStock[0].count,
        outOfStock: outOfStock[0].count,
        expiringSoon: expiringSoon[0].count,
        pendingOrders: pendingOrders[0].count,
        totalValue: totalValue[0].total
      }
    });
  } catch (err) {
    console.error('Error in inventory stats:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== INVENTORY ITEMS CRUD ====================

router.get('/items', checkPermission(PERMISSIONS.VIEW_INVENTORY), async (req, res) => {
  try {
    const { category, subcategory, search, stock_filter, limit = 50, offset = 0 } = req.query;

    const connection = await pool.getConnection();

    let query = `SELECT i.*, c.name as category_name, sc.name as subcategory_name,
      s.name as primary_supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN inventory_categories sc ON i.subcategory_id = sc.id
      LEFT JOIN inventory_suppliers s ON i.primary_supplier_id = s.id
      WHERE 1=1`;
    const params = [];

    if (category && category !== 'all') {
      query += ' AND i.category_id = ?';
      params.push(Number(category));
    }

    if (subcategory && subcategory !== 'all') {
      query += ' AND i.subcategory_id = ?';
      params.push(Number(subcategory));
    }

    if (search) {
      query += ' AND (i.item_name LIKE ? OR i.item_id LIKE ? OR i.description LIKE ? OR i.manufacturer LIKE ? OR i.brand LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (stock_filter === 'low_stock') {
      query += ' AND i.stock_quantity <= i.reorder_point AND i.status = \'active\'';
    } else if (stock_filter === 'out_of_stock') {
      query += ' AND i.stock_quantity = 0 AND i.status = \'active\'';
    } else if (stock_filter === 'expiring_soon') {
      query += ' AND i.expiry_date IS NOT NULL AND i.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND i.status = \'active\'';
    }

    const countQuery = `SELECT COUNT(*) as total FROM inventory_items i WHERE 1=1`;
    const countParams = [];
    let countWhere = '';
    if (category && category !== 'all') {
      countWhere += ' AND i.category_id = ?';
      countParams.push(Number(category));
    }
    if (subcategory && subcategory !== 'all') {
      countWhere += ' AND i.subcategory_id = ?';
      countParams.push(Number(subcategory));
    }
    if (search) {
      countWhere += ' AND (i.item_name LIKE ? OR i.item_id LIKE ? OR i.description LIKE ? OR i.manufacturer LIKE ? OR i.brand LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (stock_filter === 'low_stock') {
      countWhere += ' AND i.stock_quantity <= i.reorder_point AND i.status = \'active\'';
    } else if (stock_filter === 'out_of_stock') {
      countWhere += ' AND i.stock_quantity = 0 AND i.status = \'active\'';
    } else if (stock_filter === 'expiring_soon') {
      countWhere += ' AND i.expiry_date IS NOT NULL AND i.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND i.status = \'active\'';
    }

    const [[countResult]] = await connection.execute(countQuery + countWhere, countParams);

    const [categories] = await connection.execute('SELECT id, name FROM inventory_categories WHERE parent_id IS NULL ORDER BY name ASC');

    const limitNum = Math.floor(Number(limit)) || 50;
    const offsetNum = Math.floor(Number(offset)) || 0;

    query += ` ORDER BY i.created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const [items] = await connection.execute(query, params);

    connection.release();

    res.json({
      success: true,
      data: items,
      categories: categories,
      total: countResult.total,
      limit: limitNum,
      offset: offsetNum
    });
  } catch (err) {
    console.error('Error fetching inventory items:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/items/:id', checkPermission(PERMISSIONS.VIEW_INVENTORY), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [items] = await connection.execute('SELECT * FROM inventory_items WHERE id = ?', [id]);

    if (items.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    connection.release();
    res.json({ success: true, data: items[0] });
  } catch (err) {
    console.error('Error fetching inventory item:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/items', checkPermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res) => {
  try {
    const {
      item_name, item_id, category_id, subcategory_id, description, unit_of_measure,
      unit_quantity, storage_location, manufacturer, brand, model_version,
      expiry_tracking, expiry_date, requires_refrigeration, controlled_substance, hazardous_material,
      sterile, notes, current_stock, min_stock_level, max_stock_level, reorder_point,
      reorder_quantity, unit_cost, unit_price, primary_supplier_id, supplier_item_code,
      supplier_price, lead_time_days, min_order_quantity, alternative_suppliers,
      status, enable_low_stock_alerts, enable_expiry_alerts
    } = req.body;

    if (!item_name) {
      return res.status(400).json({ success: false, message: 'Item name is required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(
      `INSERT INTO inventory_items (
        item_name, item_id, category_id, subcategory_id, description, unit_of_measure,
        unit_quantity, storage_location, manufacturer, brand, model_version,
        expiry_tracking, expiry_date, requires_refrigeration, controlled_substance, hazardous_material,
        sterile, notes, stock_quantity, min_stock_level, max_stock_level, reorder_point,
        reorder_quantity, unit_cost, unit_price, primary_supplier_id, supplier_item_code,
        supplier_price, lead_time_days, min_order_quantity, alternative_suppliers,
        status, enable_low_stock_alerts, enable_expiry_alerts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item_name, item_id || null, category_id || null, subcategory_id || null, description || null,
        unit_of_measure || null, unit_quantity || null, storage_location || null,
        manufacturer || null, brand || null, model_version || null, expiry_tracking || 'no',
        expiry_date || null, requires_refrigeration ? 1 : 0, controlled_substance ? 1 : 0, hazardous_material ? 1 : 0,
        sterile ? 1 : 0, notes || null, current_stock || 0, min_stock_level || 0, max_stock_level || 0,
        reorder_point || 0, reorder_quantity || 0, unit_cost || 0, unit_price || 0,
        primary_supplier_id || null, supplier_item_code || null, supplier_price || 0,
        lead_time_days || 0, min_order_quantity || 0, alternative_suppliers ? JSON.stringify(alternative_suppliers) : null,
        status || 'active', enable_low_stock_alerts ? 1 : 0, enable_expiry_alerts ? 1 : 0
      ]
    );

    connection.release();

    res.status(201).json({ success: true, message: 'Item added successfully', itemId: result.insertId });
  } catch (err) {
    console.error('Error adding inventory item:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/items/:id', checkPermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      item_name, item_id, category_id, subcategory_id, description, unit_of_measure,
      unit_quantity, storage_location, manufacturer, brand, model_version,
      expiry_tracking, expiry_date, requires_refrigeration, controlled_substance, hazardous_material,
      sterile, notes, current_stock, min_stock_level, max_stock_level, reorder_point,
      reorder_quantity, unit_cost, unit_price, primary_supplier_id, supplier_item_code,
      supplier_price, lead_time_days, min_order_quantity, alternative_suppliers,
      status, enable_low_stock_alerts, enable_expiry_alerts
    } = req.body;

    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM inventory_items WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    await connection.execute(
      `UPDATE inventory_items SET
        item_name = ?, item_id = ?, category_id = ?, subcategory_id = ?, description = ?,
        unit_of_measure = ?, unit_quantity = ?, storage_location = ?, manufacturer = ?,
        brand = ?, model_version = ?, expiry_tracking = ?, expiry_date = ?, requires_refrigeration = ?,
        controlled_substance = ?, hazardous_material = ?, sterile = ?, notes = ?,
        stock_quantity = ?, min_stock_level = ?, max_stock_level = ?, reorder_point = ?,
        reorder_quantity = ?, unit_cost = ?, unit_price = ?, primary_supplier_id = ?,
        supplier_item_code = ?, supplier_price = ?, lead_time_days = ?,
        min_order_quantity = ?, alternative_suppliers = ?, status = ?,
        enable_low_stock_alerts = ?, enable_expiry_alerts = ?
      WHERE id = ?`,
      [
        item_name, item_id || null, category_id || null, subcategory_id || null, description || null,
        unit_of_measure || null, unit_quantity || null, storage_location || null,
        manufacturer || null, brand || null, model_version || null, expiry_tracking || 'no',
        expiry_date || null, requires_refrigeration ? 1 : 0, controlled_substance ? 1 : 0, hazardous_material ? 1 : 0,
        sterile ? 1 : 0, notes || null, current_stock || 0, min_stock_level || 0, max_stock_level || 0,
        reorder_point || 0, reorder_quantity || 0, unit_cost || 0, unit_price || 0,
        primary_supplier_id || null, supplier_item_code || null, supplier_price || 0,
        lead_time_days || 0, min_order_quantity || 0, alternative_suppliers ? JSON.stringify(alternative_suppliers) : null,
        status || 'active', enable_low_stock_alerts ? 1 : 0, enable_expiry_alerts ? 1 : 0, id
      ]
    );

    connection.release();

    res.json({ success: true, message: 'Item updated successfully' });
  } catch (err) {
    console.error('Error updating inventory item:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/items/:id', checkPermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM inventory_items WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    await connection.execute('DELETE FROM inventory_items WHERE id = ?', [id]);
    connection.release();

    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (err) {
    console.error('Error deleting inventory item:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== SUPPLIERS ====================

router.get('/suppliers', checkPermission(PERMISSIONS.VIEW_INVENTORY), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [suppliers] = await connection.execute('SELECT * FROM inventory_suppliers ORDER BY name ASC');
    connection.release();
    res.json({ success: true, data: suppliers });
  } catch (err) {
    console.error('Error fetching suppliers:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/suppliers', checkPermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res) => {
  try {
    const { name, category, description, contact_person, email, phone, location, website,
          payment_terms, avg_lead_time, min_order_value, rating, is_preferred, status } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Supplier name is required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(
      `INSERT INTO inventory_suppliers (
        name, category, description, contact_person, email, phone, location, website,
        payment_terms, avg_lead_time, min_order_value, rating, is_preferred, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, category || 'Medical Supplies', description || null, contact_person || null,
        email || null, phone || null, location || null, website || null,
        payment_terms || 'Net 30', avg_lead_time || 0, min_order_value || 0,
        rating || 3, is_preferred ? 1 : 0, status || 'active'
      ]
    );

    connection.release();

    res.status(201).json({ success: true, message: 'Supplier added successfully', supplierId: result.insertId });
  } catch (err) {
    console.error('Error adding supplier:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/suppliers/:id', checkPermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, description, contact_person, email, phone, location, website,
          payment_terms, avg_lead_time, min_order_value, rating, is_preferred, status } = req.body;

    const connection = await pool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM inventory_suppliers WHERE id = ?', [id]);
    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }

    await connection.execute(
      `UPDATE inventory_suppliers SET
        name = ?, category = ?, description = ?, contact_person = ?, email = ?, phone = ?,
        location = ?, website = ?, payment_terms = ?, avg_lead_time = ?, min_order_value = ?,
        rating = ?, is_preferred = ?, status = ?
      WHERE id = ?`,
      [
        name, category, description, contact_person, email, phone, location, website,
        payment_terms, avg_lead_time, min_order_value, rating, is_preferred ? 1 : 0, status, id
      ]
    );

    connection.release();

    res.json({ success: true, message: 'Supplier updated successfully' });
  } catch (err) {
    console.error('Error updating supplier:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== CATEGORIES ====================

router.get('/categories', checkPermission(PERMISSIONS.VIEW_INVENTORY), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [categories] = await connection.execute(
      `SELECT c1.*, c2.name as parent_name
       FROM inventory_categories c1
       LEFT JOIN inventory_categories c2 ON c1.parent_id = c2.id
       ORDER BY c1.name ASC`
    );
    connection.release();
    res.json({ success: true, data: categories });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/categories', checkPermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res) => {
  try {
    const { name, parent_id, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const connection = await pool.getConnection();
    const [result] = await connection.execute(
      'INSERT INTO inventory_categories (name, parent_id, description) VALUES (?, ?, ?)',
      [name, parent_id || null, description || null]
    );
    connection.release();

    res.status(201).json({ success: true, message: 'Category added', categoryId: result.insertId });
  } catch (err) {
    console.error('Error adding category:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== ALERTS ====================

router.get('/alerts', checkPermission(PERMISSIONS.VIEW_INVENTORY), async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [lowStock] = await connection.execute(
      `SELECT i.id, i.item_name, i.stock_quantity, i.reorder_point, i.min_stock_level,
              'low_stock' as alert_type, i.enable_low_stock_alerts as enabled
       FROM inventory_items i
       WHERE i.status = 'active' AND i.stock_quantity <= i.reorder_point AND i.enable_low_stock_alerts = 1`
    );

    const [outOfStock] = await connection.execute(
      `SELECT i.id, i.item_name, i.stock_quantity, i.min_stock_level,
              'out_of_stock' as alert_type, i.enable_low_stock_alerts as enabled
       FROM inventory_items i
       WHERE i.status = 'active' AND i.stock_quantity = 0 AND i.enable_low_stock_alerts = 1`
    );

    const [expiringSoon] = await connection.execute(
      `SELECT i.id, i.item_name, i.expiry_date,
              'expiring_soon' as alert_type, i.enable_expiry_alerts as enabled
       FROM inventory_items i
       WHERE i.status = 'active' AND i.expiry_date IS NOT NULL
             AND i.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
             AND i.enable_expiry_alerts = 1`
    );

    connection.release();

    res.json({
      success: true,
      data: {
        low_stock: lowStock,
        out_of_stock: outOfStock,
        expiring_soon: expiringSoon
      }
    });
  } catch (err) {
    console.error('Error fetching alerts:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== ORDERS ====================

router.get('/orders', checkPermission(PERMISSIONS.VIEW_INVENTORY), async (req, res) => {
  try {
    const { status } = req.query;
    const connection = await pool.getConnection();

    let query = `SELECT o.*, i.item_name, s.name as supplier_name
                 FROM inventory_orders o
                 LEFT JOIN inventory_items i ON o.item_id = i.id
                 LEFT JOIN inventory_suppliers s ON o.supplier_id = s.id
                 WHERE 1=1`;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND o.status = ?';
      params.push(status);
    }

    query += ' ORDER BY o.created_at DESC';

    const [orders] = await connection.execute(query, params);
    connection.release();

    res.json({ success: true, data: orders });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/orders', checkPermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res) => {
  try {
    const { item_id, supplier_id, quantity, unit_price, expected_delivery, notes } = req.body;
    if (!item_id || !quantity) {
      return res.status(400).json({ success: false, message: 'Item and quantity are required' });
    }

    const totalAmount = (Number(quantity) || 0) * (Number(unit_price) || 0);
    const connection = await pool.getConnection();
    const [result] = await connection.execute(
      `INSERT INTO inventory_orders (item_id, supplier_id, quantity, unit_price, total_amount, expected_delivery, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [item_id, supplier_id || null, quantity, unit_price || 0, totalAmount, expected_delivery || null, notes || null]
    );
    connection.release();

    res.status(201).json({ success: true, message: 'Order created', orderId: result.insertId });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/orders/:id/status', checkPermission(PERMISSIONS.MANAGE_INVENTORY), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const connection = await pool.getConnection();
    await connection.execute('UPDATE inventory_orders SET status = ? WHERE id = ?', [status, id]);
    connection.release();

    res.json({ success: true, message: 'Order status updated' });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== EXPORT ====================

router.get('/export', checkPermission(PERMISSIONS.VIEW_INVENTORY), async (req, res) => {
  try {
    const { type } = req.query;
    const connection = await pool.getConnection();

    let data;
    let sheetName = 'Inventory';
    if (type === 'low_stock') {
      sheetName = 'Low Stock Items';
      [data] = await connection.execute(
        `SELECT i.item_name, i.item_id, i.stock_quantity, i.min_stock_level, i.reorder_point,
                i.unit_cost, c.name as category, s.name as supplier
         FROM inventory_items i
         LEFT JOIN inventory_categories c ON i.category_id = c.id
         LEFT JOIN inventory_suppliers s ON i.primary_supplier_id = s.id
         WHERE i.status = 'active' AND i.stock_quantity <= i.reorder_point
         ORDER BY i.item_name ASC`
      );
    } else if (type === 'out_of_stock') {
      sheetName = 'Out of Stock Items';
      [data] = await connection.execute(
        `SELECT i.item_name, i.item_id, i.stock_quantity, i.min_stock_level,
                i.unit_cost, c.name as category, s.name as supplier
         FROM inventory_items i
         LEFT JOIN inventory_categories c ON i.category_id = c.id
         LEFT JOIN inventory_suppliers s ON i.primary_supplier_id = s.id
         WHERE i.status = 'active' AND i.stock_quantity = 0
         ORDER BY i.item_name ASC`
      );
    } else if (type === 'expiring_soon') {
      sheetName = 'Expiring Soon Items';
      [data] = await connection.execute(
        `SELECT i.item_name, i.item_id, i.expiry_date, i.stock_quantity,
                i.unit_cost, c.name as category, s.name as supplier
         FROM inventory_items i
         LEFT JOIN inventory_categories c ON i.category_id = c.id
         LEFT JOIN inventory_suppliers s ON i.primary_supplier_id = s.id
         WHERE i.status = 'active' AND i.expiry_date IS NOT NULL
              AND i.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
         ORDER BY i.expiry_date ASC`
      );
    } else {
      [data] = await connection.execute(
        `SELECT i.item_name, i.item_id, i.stock_quantity, i.unit_of_measure, i.unit_cost, i.unit_price,
                i.min_stock_level, i.reorder_point, i.reorder_quantity, i.expiry_date,
                i.storage_location, i.manufacturer, i.brand, c.name as category, s.name as supplier
         FROM inventory_items i
         LEFT JOIN inventory_categories c ON i.category_id = c.id
         LEFT JOIN inventory_suppliers s ON i.primary_supplier_id = s.id
         WHERE i.status = 'active'
         ORDER BY i.item_name ASC`
      );
    }

    connection.release();

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, message: 'No data to export' });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    const headers = Object.keys(data[0]);
    const headerRow = sheet.addRow(headers.map(h => {
      const label = String(h).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return { text: label, font: { bold: true } };
    }));

    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    for (const row of data) {
      const sheetRow = sheet.addRow(headers.map(h => row[h] == null ? '' : row[h]));
      sheetRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    headers.forEach((_, index) => {
      sheet.getColumn(index + 1).width = Math.max(12, headers[index].length + 4);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="inventory_${type || 'all'}_${Date.now()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting inventory:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

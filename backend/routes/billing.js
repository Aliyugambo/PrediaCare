/**
 * Billing API Routes
 * Endpoints for billing and invoice management
 */

const express = require('express');
const pool = require('../config/database');
const router = express.Router();
const { checkPermission, PERMISSIONS } = require('../config/permissions');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// ==================== BILLING STATS ====================

/**
 * GET /api/billing/stats
 * Get billing dashboard statistics
 */
router.get('/stats', checkPermission(PERMISSIONS.VIEW_BILLING), async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Total invoices count
    const [totalInvoices] = await connection.execute(
      'SELECT COUNT(*) as count FROM billing_invoices'
    );

    // Paid invoices count
    const [paidInvoices] = await connection.execute(
      'SELECT COUNT(*) as count FROM billing_invoices WHERE status = \'paid\''
    );

    // Pending invoices count
    const [pendingInvoices] = await connection.execute(
      'SELECT COUNT(*) as count FROM billing_invoices WHERE status = \'pending\''
    );

    // Overdue invoices count
    const [overdueInvoices] = await connection.execute(
      'SELECT COUNT(*) as count FROM billing_invoices WHERE status = \'overdue\' OR (status = \'pending\' AND due_date < CURDATE())'
    );

    // Expected Revenue (all invoices total value)
    const [expectedRevenue] = await connection.execute(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM billing_invoices'
    );

    // Inflow Revenue (paid)
    const [inflowRevenue] = await connection.execute(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM billing_invoices WHERE status = \'paid\''
    );

    // Monthly Revenue (this month paid)
    const [monthlyRevenue] = await connection.execute(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM billing_invoices 
       WHERE status = 'paid' AND MONTH(invoice_date) = MONTH(CURDATE()) AND YEAR(invoice_date) = YEAR(CURDATE())`
    );

    // Yearly Revenue (this year paid)
    const [yearlyRevenue] = await connection.execute(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM billing_invoices 
       WHERE status = 'paid' AND YEAR(invoice_date) = YEAR(CURDATE())`
    );

    // Aggregate Revenue (all-time total, same as expected for consistency)
    const [aggregateRevenue] = await connection.execute(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM billing_invoices'
    );

    connection.release();

    res.json({
      success: true,
      stats: {
        totalInvoices: totalInvoices[0].count,
        paidInvoices: paidInvoices[0].count,
        pendingInvoices: pendingInvoices[0].count,
        overdueInvoices: overdueInvoices[0].count,
        expectedRevenue: parseFloat(expectedRevenue[0].total),
        inflowRevenue: parseFloat(inflowRevenue[0].total),
        monthlyRevenue: parseFloat(monthlyRevenue[0].total),
        yearlyRevenue: parseFloat(yearlyRevenue[0].total),
        aggregateRevenue: parseFloat(aggregateRevenue[0].total)
      }
    });

  } catch (err) {
    console.error('Error in billing stats:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== BILLING SERVICES ====================

/**
 * GET /api/billing/services
 * Get all billing services
 */
router.get('/services', checkPermission(PERMISSIONS.VIEW_BILLING), async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [services] = await connection.execute(
      'SELECT * FROM billing_services WHERE is_active = true ORDER BY service_name ASC'
    );

    connection.release();

    res.json({
      success: true,
      services: services.map(s => ({
        id: s.id,
        name: s.service_name,
        description: s.description,
        category: s.category,
        price: parseFloat(s.unit_price)
      }))
    });
  } catch (err) {
    console.error('Error fetching billing services:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== INVOICES ====================

/**
 * GET /api/billing/invoices
 * Get all invoices with optional filtering
 */
router.get('/invoices', checkPermission(PERMISSIONS.VIEW_BILLING), async (req, res) => {
  try {
    const { status, search, date_from, date_to, limit = 20, offset = 0 } = req.query;

    let query = `
      SELECT bi.*, u.name as patient_name, u.email as patient_email
      FROM billing_invoices bi
      LEFT JOIN users u ON bi.patient_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      if (status === 'overdue') {
        query += ' AND (bi.status = \'overdue\' OR (bi.status = \'pending\' AND bi.due_date < CURDATE()))';
      } else {
        query += ' AND bi.status = ?';
        params.push(status);
      }
    }

    if (search) {
      query += ' AND (bi.invoice_number LIKE ? OR u.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (date_from) {
      query += ' AND bi.invoice_date >= ?';
      params.push(date_from);
    }

    if (date_to) {
      query += ' AND bi.invoice_date <= ?';
      params.push(date_to);
    }

    query += ' ORDER BY bi.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const connection = await pool.getConnection();
    const [invoices] = await connection.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM billing_invoices bi LEFT JOIN users u ON bi.patient_id = u.id WHERE 1=1';
    const countParams = [];
    if (status && status !== 'all') {
      if (status === 'overdue') {
        countQuery += ' AND (bi.status = \'overdue\' OR (bi.status = \'pending\' AND bi.due_date < CURDATE()))';
      } else {
        countQuery += ' AND bi.status = ?';
        countParams.push(status);
      }
    }
    if (search) {
      countQuery += ' AND (bi.invoice_number LIKE ? OR u.name LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }
    if (date_from) {
      countQuery += ' AND bi.invoice_date >= ?';
      countParams.push(date_from);
    }
    if (date_to) {
      countQuery += ' AND bi.invoice_date <= ?';
      countParams.push(date_to);
    }

    const [countResult] = await connection.execute(countQuery, countParams);

    connection.release();

    // Get services summary for each invoice
    res.json({
      success: true,
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        patient: {
          id: inv.patient_id,
          name: inv.patient_name,
          email: inv.patient_email
        },
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        subtotal: parseFloat(inv.subtotal),
        tax_amount: parseFloat(inv.tax_amount),
        total_amount: parseFloat(inv.total_amount),
        amount_paid: parseFloat(inv.amount_paid),
        status: inv.status,
        payment_method: inv.payment_method,
        notes: inv.notes,
        created_at: inv.created_at
      })),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/billing/invoices/:id
 * Get a single invoice by ID with items
 */
router.get('/invoices/:id', checkPermission(PERMISSIONS.VIEW_BILLING), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    // Get invoice
    const [invoices] = await connection.query(`
      SELECT bi.*, u.name as patient_name, u.email as patient_email, u.phone as patient_phone
      FROM billing_invoices bi
      LEFT JOIN users u ON bi.patient_id = u.id
      WHERE bi.id = ?
    `, [id]);

    if (invoices.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // Get invoice items
    const [items] = await connection.execute(
      'SELECT * FROM billing_invoice_items WHERE invoice_id = ?',
      [id]
    );

    // Get payment history
    const [payments] = await connection.execute(
      'SELECT bp.*, u.name as received_by_name FROM billing_payments bp LEFT JOIN users u ON bp.received_by = u.id WHERE bp.invoice_id = ? ORDER BY bp.payment_date DESC',
      [id]
    );

    connection.release();

    const inv = invoices[0];
    res.json({
      success: true,
      invoice: {
        id: inv.id,
        invoice_number: inv.invoice_number,
        patient: {
          id: inv.patient_id,
          name: inv.patient_name,
          email: inv.patient_email,
          phone: inv.patient_phone
        },
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        subtotal: parseFloat(inv.subtotal),
        tax_amount: parseFloat(inv.tax_amount),
        total_amount: parseFloat(inv.total_amount),
        amount_paid: parseFloat(inv.amount_paid),
        status: inv.status,
        payment_method: inv.payment_method,
        notes: inv.notes,
        items: items.map(item => ({
          id: item.id,
          service_id: item.service_id,
          service_name: item.service_name,
          description: item.description,
          quantity: item.quantity,
          unit_price: parseFloat(item.unit_price),
          total_price: parseFloat(item.total_price)
        })),
        payments: payments.map(p => ({
          id: p.id,
          payment_date: p.payment_date,
          amount: parseFloat(p.amount),
          payment_method: p.payment_method,
          transaction_reference: p.transaction_reference,
          notes: p.notes,
          received_by: p.received_by_name
        })),
        created_at: inv.created_at,
        updated_at: inv.updated_at
      }
    });
  } catch (err) {
    console.error('Error fetching invoice:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/billing/invoices/:id/pdf
 * Generate and download PDF invoice
 */
router.get('/invoices/:id/pdf', checkPermission(PERMISSIONS.VIEW_BILLING), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [invoices] = await connection.query(`
      SELECT bi.*, u.name as patient_name, u.email as patient_email, u.phone as patient_phone,
             u.address as patient_address,
             du.name as doctor_name, du.email as doctor_email, du.phone as doctor_phone,
             d.location as doctor_location
      FROM billing_invoices bi
      LEFT JOIN users u ON bi.patient_id = u.id
      LEFT JOIN doctors d ON bi.doctor_id = d.id
      LEFT JOIN users du ON d.user_id = du.id
      WHERE bi.id = ?
    `, [id]);

    if (invoices.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const [items] = await connection.execute(
      'SELECT * FROM billing_invoice_items WHERE invoice_id = ?',
      [id]
    );

    connection.release();

    const inv = invoices[0];
    const doc = new PDFDocument({ margin: 40 });

res.setHeader('Content-Type', 'application/pdf');
res.setHeader(
  'Content-Disposition',
  `attachment; filename="invoice-${inv.invoice_number}.pdf"`
);

doc.pipe(res);

/* =========================
   GLOBAL LAYOUT SYSTEM
========================= */
const pageWidth = doc.page.width;
const margin = 50;
const contentWidth = pageWidth - margin * 2;

const colGap = 20;
const colWidth = (contentWidth - colGap) / 2;

const leftX = margin;
const rightX = margin + colWidth + colGap;

const lineGap = 15;

/* =========================
   HEADER
========================= */
const headerY = 40;

try {
  const logoPath = path.join(__dirname, '../../assets/images/logo/logo.png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, leftX, headerY, { width: 60 });
  }
} catch (e) {}

const formatNGN = (amount) => `NGN ${parseFloat(amount || 0).toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

doc
  .fontSize(22)
  .fillColor('#000')
  .text('PREDIACARE CLINIC LTD', leftX + 100, headerY + 15);

doc
  .fontSize(10)
  .fillColor('#555')
  .text('No. 48, Arsenal Street, Suncity Estate, Galadimawa, Abuja. RC 8004554.', leftX, headerY + 45, { width: contentWidth, align: 'center' });

const addressBottomY = headerY + 45 + 12;
doc
  .moveTo(margin, addressBottomY)
  .lineTo(margin + contentWidth, addressBottomY)
  .stroke();

doc.moveDown(4);

/* =========================
   PATIENT INFO
========================= */
const infoY = doc.y;

const patientEmail = inv.patient_email || '';
const patientPhone = inv.patient_phone || '';
const patientAddress = inv.patient_address || '';
const patientName = inv.patient_name || 'N/A';

let patientLineY = infoY;

doc
  .fontSize(13)
  .fillColor('#242222')
  .text('Patient Information', leftX, patientLineY);

patientLineY += lineGap;

if (patientName && patientName !== 'N/A') {
  doc.fontSize(11).fillColor('#000').text(patientName, leftX, patientLineY);
  patientLineY += lineGap;
}

if (patientEmail) {
  doc.fontSize(11).fillColor('#000').text(patientEmail, leftX, patientLineY);
  patientLineY += lineGap;
}

if (patientPhone) {
  doc.fontSize(11).fillColor('#000').text(patientPhone, leftX, patientLineY);
  patientLineY += lineGap;
}

if (patientAddress) {
  doc.fontSize(11).fillColor('#000').text(patientAddress, leftX, patientLineY, {
    width: colWidth,
  });
}

doc.moveDown(4);

/* =========================
   INVOICE INFO GRID
========================= */
const boxY = doc.y;
const boxHeight = 50;
const col4 = contentWidth / 4;

doc.rect(margin, boxY, contentWidth, boxHeight).stroke();

for (let i = 1; i < 4; i++) {
  doc
    .moveTo(margin + col4 * i, boxY)
    .lineTo(margin + col4 * i, boxY + boxHeight)
    .stroke();
}

const labelY = boxY + 10;
const valueY = boxY + 28;

doc.fontSize(10).fillColor('#555');

doc.text('INVOICE NUMBER', margin + 10, labelY);
doc.text('DATE', margin + col4 + 10, labelY);
doc.text('DUE DATE', margin + col4 * 2 + 10, labelY);
doc.text('AMOUNT DUE', margin + col4 * 3 + 10, labelY);

doc.fontSize(11).fillColor('#000');

doc.text(inv.invoice_number, margin + 10, valueY);
doc.text(new Date(inv.invoice_date).toLocaleDateString(), margin + col4 + 10, valueY);
doc.text(new Date(inv.due_date).toLocaleDateString(), margin + col4 * 2 + 10, valueY);
doc.text(formatNGN(inv.total_amount), margin + col4 * 3 + 10, valueY, {
  width: col4 - 20,
  align: 'right',
});

doc.moveDown(3);

/* =========================
   TABLE
========================= */
const tableTop = doc.y;

const itemX = margin;
const descX = margin + 150;
const priceX = margin + contentWidth - 100;

doc.rect(margin, tableTop, contentWidth, 25).fill('#0f0e0e');

doc
  .fillColor('#fff')
  .fontSize(12)
  .text('ITEM', itemX + 5, tableTop + 7)
  .text('DESCRIPTION', descX, tableTop + 7)
  .text('PRICE', priceX, tableTop + 7, { align: 'right', width: 90 });

let rowY = tableTop + 25;

items.forEach((item, i) => {
  const rowHeight = 25;

  if (i % 2 === 0) {
    doc.rect(margin, rowY, contentWidth, rowHeight).fill('#f5f5f5');
  }

  doc.fillColor('#000').fontSize(11);

  doc.text(item.service_name || '-', itemX + 5, rowY + 7, {
    width: 130,
  });

  doc.text(item.description || '-', descX, rowY + 7, {
    width: 200,
    ellipsis: true,
  });

  doc.text(
    formatNGN(item.total_price),
    priceX,
    rowY + 7,
    {
      width: 90,
      align: 'right',
    }
  );

  rowY += rowHeight;
});

doc.moveTo(margin, rowY).lineTo(margin + contentWidth, rowY).stroke();

doc.moveDown(2);

/* =========================
   NOTES + TOTALS
========================= */
const bottomY = doc.y;

const notesWidth = contentWidth * 0.6;
const totalsWidth = contentWidth * 0.35;

doc.rect(margin, bottomY, notesWidth, 90).stroke();

doc
  .fontSize(12)
  .text('NOTES', margin + 10, bottomY + 10);

doc
  .fontSize(11)
  .text(
    inv.notes ||
      'A prescription has been written out for patient, for an acute throat infection.',
    margin + 10,
    bottomY + 30,
    { width: notesWidth - 20 }
  );

/* totals */
const totalsX = margin + notesWidth + 10;

doc.rect(totalsX, bottomY, totalsWidth - 10, 90).stroke();

const rightAlignX = totalsX + totalsWidth - 20;

doc.fontSize(11);

doc.text('SUB TOTAL', totalsX + 10, bottomY + 10);
doc.text(formatNGN(inv.subtotal), rightAlignX - 80, bottomY + 10, {
  width: 80,
  align: 'right',
});

doc.text('TAX', totalsX + 10, bottomY + 30);
doc.text(formatNGN(inv.tax_amount), rightAlignX - 80, bottomY + 30, {
  width: 80,
  align: 'right',
});

doc.fontSize(13).text('TOTAL', totalsX + 10, bottomY + 60);
doc.text(formatNGN(inv.total_amount), rightAlignX - 80, bottomY + 60, {
  width: 80,
  align: 'right',
});

doc.moveDown(5);

/* =========================
   FOOTER
========================= */
const footerY = doc.y;
const footerLinePadding = 8;

doc
  .moveTo(margin, footerY + footerLinePadding)
  .lineTo(margin + contentWidth, footerY + footerLinePadding)
  .stroke();

doc
  .fontSize(10)
  .fillColor('#555')
  .text(
    'Email address: Predicareclincisonsult@gmail.com | Mobile number: 08140032892.',
    margin,
    footerY + footerLinePadding + 6,
    { width: contentWidth, align: 'center' }
  );

const footerBottomY = footerY + footerLinePadding + 6 + 14;
doc
  .moveTo(margin, footerBottomY)
  .lineTo(margin + contentWidth, footerBottomY)
  .stroke();

doc.end();
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ success: false, message: 'Error generating PDF' });
  }
});

/**
 * POST /api/billing/invoices
 * Create a new invoice
 */
router.post('/invoices', checkPermission(PERMISSIONS.CREATE_INVOICE), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { patient_id, invoice_date, due_date, payment_method, service_ids, medication_ids, notes } = req.body;

    if (!patient_id || !due_date) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'patient_id and due_date are required'
      });
    }

    if ((!service_ids || service_ids.length === 0) && (!medication_ids || medication_ids.length === 0)) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'At least one service or medication is required'
      });
    }

    // Generate invoice number
    const [lastInvoice] = await connection.execute(
      'SELECT invoice_number FROM billing_invoices ORDER BY id DESC LIMIT 1'
    );
    
    let invoiceNumber = 'INV-0001';
    if (lastInvoice.length > 0) {
      const lastNum = parseInt(lastInvoice[0].invoice_number.replace('INV-', '')) || 0;
      invoiceNumber = `INV-${String(lastNum + 1).padStart(4, '0')}`;
    }

    // Get service details
    let items = [];
    if (service_ids && service_ids.length > 0) {
      const placeholders = service_ids.map(() => '?').join(',');
      const [services] = await connection.execute(
        `SELECT * FROM billing_services WHERE id IN (${placeholders})`,
        service_ids
      );

      if (services.length === 0) {
        connection.release();
        return res.status(400).json({ success: false, message: 'No valid services found' });
      }

      items = services.map(s => {
        const price = parseFloat(s.unit_price);
        return {
          service_id: s.id,
          medication_id: null,
          service_name: s.service_name,
          description: s.description,
          quantity: 1,
          unit_price: price,
          total_price: price
        };
      });
    }

    // Get medication details
    if (medication_ids && medication_ids.length > 0) {
      const medPlaceholders = medication_ids.map(() => '?').join(',');
      const [medications] = await connection.execute(
        `SELECT * FROM medications WHERE id IN (${medPlaceholders}) AND patient_id = ?`,
        [...medication_ids, patient_id]
      );

      medications.forEach(m => {
        const price = parseFloat(m.unit_price || 0);
        items.push({
          service_id: null,
          medication_id: m.id,
          service_name: m.medication_name,
          description: m.dosage + (m.frequency ? ' - ' + m.frequency : ''),
          quantity: 1,
          unit_price: price,
          total_price: price
        });
      });
    }

    // Calculate totals
    let subtotal = 0;
    items.forEach(item => {
      subtotal += item.total_price;
    });

    const taxRate = 0.05;
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    await connection.beginTransaction();

    // Insert invoice
    const [invoiceResult] = await connection.execute(
      `INSERT INTO billing_invoices 
       (invoice_number, patient_id, invoice_date, due_date, subtotal, tax_amount, total_amount, status, payment_method, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        patient_id,
        invoice_date || new Date().toISOString().split('T')[0],
        due_date,
        subtotal,
        taxAmount,
        totalAmount,
        'pending',
        payment_method || 'cash',
        notes || null,
        req.session.userId
      ]
    );

    const invoiceId = invoiceResult.insertId;

    // Insert invoice items
    for (const item of items) {
      await connection.execute(
        `INSERT INTO billing_invoice_items 
         (invoice_id, service_id, medication_id, service_name, description, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          item.service_id,
          item.medication_id,
          item.service_name,
          item.description,
          item.quantity,
          item.unit_price,
          item.total_price
        ]
      );
    }

    await connection.commit();
    connection.release();

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      invoiceId: invoiceId,
      invoice_number: invoiceNumber,
      total_amount: totalAmount
    });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error('Error creating invoice:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/billing/invoices/:id
 * Update an invoice
 */
router.put('/invoices/:id', checkPermission(PERMISSIONS.MANAGE_BILLING), async (req, res) => {
  try {
    const { id } = req.params;
    const { due_date, payment_method, notes, status } = req.body;

    const connection = await pool.getConnection();

    const [existing] = await connection.execute(
      'SELECT id FROM billing_invoices WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const updateParts = [];
    const updateParams = [];

    if (due_date !== undefined) { updateParts.push('due_date = ?'); updateParams.push(due_date); }
    if (payment_method !== undefined) { updateParts.push('payment_method = ?'); updateParams.push(payment_method); }
    if (notes !== undefined) { updateParts.push('notes = ?'); updateParams.push(notes); }
    if (status !== undefined) { updateParts.push('status = ?'); updateParams.push(status); }

    if (updateParts.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    updateParams.push(id);
    await connection.execute(
      `UPDATE billing_invoices SET ${updateParts.join(', ')} WHERE id = ?`,
      updateParams
    );

    connection.release();

    res.json({ success: true, message: 'Invoice updated successfully' });
  } catch (err) {
    console.error('Error updating invoice:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/billing/invoices/:id/status
 * Update invoice status (e.g., mark as paid)
 */
router.post('/invoices/:id/status', checkPermission(PERMISSIONS.PROCESS_PAYMENT), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { id } = req.params;
    const { status, payment_method, transaction_reference, notes, payment_amount } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const [existing] = await connection.execute(
      'SELECT * FROM billing_invoices WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const invoice = existing[0];
    const amount = payment_amount || invoice.total_amount;

    await connection.beginTransaction();

    // Update invoice status
    let newStatus = status;
    let amountPaid = invoice.amount_paid;

    if (status === 'paid') {
      amountPaid = invoice.total_amount;
      newStatus = 'paid';
    } else if (status === 'partially_paid') {
      amountPaid = invoice.amount_paid + amount;
      newStatus = amountPaid >= invoice.total_amount ? 'paid' : 'partially_paid';
    }

    await connection.execute(
      'UPDATE billing_invoices SET status = ?, amount_paid = ? WHERE id = ?',
      [newStatus, amountPaid, id]
    );

    // Record payment if amount is provided
    if (amount > 0) {
      await connection.execute(
        `INSERT INTO billing_payments 
         (invoice_id, amount, payment_method, transaction_reference, notes, received_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          amount,
          payment_method || invoice.payment_method || 'cash',
          transaction_reference || null,
          notes || null,
          req.session.userId
        ]
      );
    }

    await connection.commit();
    connection.release();

    res.json({ 
      success: true, 
      message: `Invoice marked as ${newStatus}`,
      status: newStatus,
      amount_paid: amountPaid
    });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error('Error updating invoice status:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/billing/invoices/:id
 * Permanently delete an invoice and its items
 */
router.delete('/invoices/:id', checkPermission(PERMISSIONS.MANAGE_BILLING), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    const [existing] = await connection.execute(
      'SELECT id, status FROM billing_invoices WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (existing[0].status === 'paid') {
      connection.release();
      return res.status(400).json({ success: false, message: 'Cannot delete a paid invoice. Cancel it instead.' });
    }

    // Start transaction for data integrity
    await connection.query('START TRANSACTION');

    // Delete invoice items first (foreign key constraint)
    await connection.execute(
      'DELETE FROM billing_invoice_items WHERE invoice_id = ?',
      [id]
    );

    // Delete the invoice
    await connection.execute(
      'DELETE FROM billing_invoices WHERE id = ?',
      [id]
    );

    // Commit transaction
    await connection.query('COMMIT');

    connection.release();

    res.json({ success: true, message: 'Invoice deleted successfully' });
  } catch (err) {
    // Rollback on error
    try {
      await connection.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Error rolling back transaction:', rollbackErr);
    }
    connection.release();

    console.error('Error deleting invoice:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== PATIENT SERVICES ====================

/**
 * GET /api/billing/patient/:id/services
 * Get services for a specific patient (for creating invoices)
 */
router.get('/patient/:id/services', checkPermission(PERMISSIONS.VIEW_BILLING), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    // Check if patient exists
    const [patients] = await connection.execute(
      'SELECT id, name, email FROM users WHERE id = ? AND role = \'patient\'',
      [id]
    );

    if (patients.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    // Get all billing services (in a real app, you'd filter by patient's pending services)
    const [services] = await connection.execute(
      'SELECT * FROM billing_services WHERE is_active = true ORDER BY category, service_name'
    );

    connection.release();

    res.json({
      success: true,
      patient: {
        id: patients[0].id,
        name: patients[0].name,
        email: patients[0].email
      },
      services: services.map(s => ({
        id: s.id,
        name: s.service_name,
        description: s.description,
        category: s.category,
        price: parseFloat(s.unit_price)
      }))
    });
  } catch (err) {
    console.error('Error fetching patient services:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== PATIENT MEDICATIONS FOR BILLING ====================

/**
 * GET /api/billing/patient/:id/medications
 * Get patient's medications for billing/invoice
 */
router.get('/patient/:id/medications', checkPermission(PERMISSIONS.VIEW_BILLING), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [patients] = await connection.execute(
      'SELECT id, name, email FROM users WHERE id = ? AND role = \'patient\'',
      [id]
    );

    if (patients.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const [medications] = await connection.execute(`
      SELECT m.id, m.medication_name, m.dosage, m.frequency, m.duration, m.instructions, m.status, m.prescribed_date, m.unit_price
      FROM medications m
      LEFT JOIN discharge_medications dm ON dm.patient_id = m.patient_id
        AND dm.medicine_name = m.medication_name
        AND dm.status = 'not_available'
      WHERE m.patient_id = ? AND m.status IN ('active', 'completed')
        AND dm.id IS NULL
      ORDER BY m.prescribed_date DESC
    `, [id]);

    connection.release();

    res.json({
      success: true,
      patient: {
        id: patients[0].id,
        name: patients[0].name,
        email: patients[0].email
      },
      medications: medications.map(m => ({
        id: m.id,
        name: m.medication_name,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions,
        status: m.status,
        prescribedDate: m.prescribed_date,
        price: parseFloat(m.unit_price || 0)
      }))
    });
  } catch (err) {
    console.error('Error fetching patient medications for billing:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== PAYMENTS ====================

/**
 * GET /api/billing/payments
 * Get all payment history
 */
router.get('/payments', checkPermission(PERMISSIONS.VIEW_BILLING), async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const connection = await pool.getConnection();

    const [payments] = await connection.query(`
      SELECT bp.*, bi.invoice_number, u.name as patient_name, u_staff.name as received_by_name
      FROM billing_payments bp
      LEFT JOIN billing_invoices bi ON bp.invoice_id = bi.id
      LEFT JOIN users u ON bi.patient_id = u.id
      LEFT JOIN users u_staff ON bp.received_by = u_staff.id
      ORDER BY bp.payment_date DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);

    const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM billing_payments');

    connection.release();

    res.json({
      success: true,
      payments: payments.map(p => ({
        id: p.id,
        invoice_id: p.invoice_id,
        invoice_number: p.invoice_number,
        patient_name: p.patient_name,
        amount: parseFloat(p.amount),
        payment_method: p.payment_method,
        transaction_reference: p.transaction_reference,
        notes: p.notes,
        received_by: p.received_by_name,
        payment_date: p.payment_date
      })),
      total: countResult[0].total
    });
  } catch (err) {
    console.error('Error fetching payments:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

/**
 * Newsletter API Routes
 * Handles newsletter subscriptions and health news for the weekly health newspaper
 * Public endpoints - no authentication required for subscription
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { sendEmail } = require('../config/email');

/**
 * POST /api/newsletter/subscribe
 * Subscribe an email address to the weekly health newspaper
 * Public - no authentication required
 */
router.post('/subscribe', async (req, res) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid email address'
    });
  }

  try {
    const connection = await pool.getConnection();

    // Check if already subscribed (and active)
    const [existing] = await connection.execute(
      'SELECT id, is_active FROM newsletter_subscribers WHERE email = ?',
      [email.toLowerCase()]
    );

    if (existing.length > 0) {
      if (existing[0].is_active) {
        connection.release();
        return res.status(200).json({
          success: true,
          message: 'You are already subscribed to our health newsletter',
          alreadySubscribed: true
        });
      } else {
        // Reactivate subscription
        await connection.execute(
          'UPDATE newsletter_subscribers SET is_active = 1, subscribed_at = CURRENT_TIMESTAMP WHERE id = ?',
          [existing[0].id]
        );
        connection.release();
        return res.status(200).json({
          success: true,
          message: 'Welcome back! Your subscription has been reactivated.'
        });
      }
    }

    // Insert new subscriber
    await connection.execute(
      'INSERT INTO newsletter_subscribers (email, name) VALUES (?, ?)',
      [email.toLowerCase(), name || null]
    );
    connection.release();

    res.status(201).json({
      success: true,
      message: 'Thank you for subscribing! You will receive our weekly health newspaper every week.'
    });
  } catch (error) {
    console.error('Error subscribing email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to subscribe. Please try again later.'
    });
  }
});

/**
 * GET /api/newsletter/health-news
 * Get random health news articles (public endpoint)
 * Query params: limit (default 3)
 */
router.get('/health-news', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 3;

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(`
      SELECT id, title, summary, category, author, created_at
      FROM health_news
      WHERE status = 'published'
      ORDER BY RAND()
      LIMIT ${limit}
    `);
    connection.release();

    res.json({
      success: true,
      count: rows.length,
      news: rows
    });
  } catch (error) {
    console.error('Error fetching health news:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch health news'
    });
  }
});

/**
 * GET /api/newsletter/subscribers
 * Get all active newsletter subscribers
 * Admin only
 */
router.get('/subscribers', async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(`
      SELECT id, email, name, subscribed_at, is_active
      FROM newsletter_subscribers
      ORDER BY subscribed_at DESC
    `);
    connection.release();

    res.json({
      success: true,
      count: rows.length,
      subscribers: rows
    });
  } catch (error) {
    console.error('Error fetching subscribers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscribers'
    });
  }
});

module.exports = router;

/**
 * Health Tips API Routes
 * Provides dynamic health tips for patients
 * Public endpoint - no authentication required
 */

const express = require('express');
const router = express.Router();

// Dynamic health tips data - can be extended or fetched from external API
const healthTips = [
  {
    id: 1,
    title: 'Stay Hydrated',
    content: 'Drink at least 8 glasses of water daily for optimal health. Water helps regulate body temperature, transport nutrients, and flush out toxins.',
    icon: 'fa-apple-alt',
    category: 'nutrition'
  },
  {
    id: 2,
    title: 'Regular Exercise',
    content: 'Aim for at least 30 minutes of moderate exercise each day. Regular physical activity helps maintain a healthy weight, strengthens bones, and improves mental health.',
    icon: 'fa-walking',
    category: 'fitness'
  },
  {
    id: 3,
    title: 'Quality Sleep',
    content: 'Get 7-9 hours of quality sleep each night. Adequate sleep is essential for physical health, mental clarity, and emotional well-being.',
    icon: 'fa-bed',
    category: 'wellness'
  },
  {
    id: 4,
    title: 'Balanced Diet',
    content: 'Eat a variety of fruits, vegetables, lean proteins, and whole grains. A balanced diet provides essential nutrients for optimal body function.',
    icon: 'fa-carrot',
    category: 'nutrition'
  },
  {
    id: 5,
    title: 'Stress Management',
    content: 'Practice stress-reducing techniques like meditation, deep breathing, or yoga. Chronic stress can lead to serious health issues if not managed.',
    icon: 'fa-spa',
    category: 'mental-health'
  },
  {
    id: 6,
    title: 'Regular Check-ups',
    content: 'Schedule regular health check-ups with your doctor. Early detection of health issues leads to better treatment outcomes.',
    icon: 'fa-stethoscope',
    category: 'prevention'
  },
  {
    id: 7,
    title: 'Hand Hygiene',
    content: 'Wash your hands frequently with soap and water for at least 20 seconds. Proper hand hygiene prevents the spread of germs and infections.',
    icon: 'fa-hands-wash',
    category: 'prevention'
  },
  {
    id: 8,
    title: 'Sun Safety',
    content: 'Protect your skin from harmful UV rays by using sunscreen, wearing protective clothing, and avoiding excessive sun exposure.',
    icon: 'fa-sun',
    category: 'prevention'
  },
  {
    id: 9,
    title: 'Limit Screen Time',
    content: 'Take regular breaks from screens to reduce eye strain and maintain good posture. Follow the 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20 seconds.',
    icon: 'fa-laptop',
    category: 'wellness'
  },
  {
    id: 10,
    title: 'Stay Connected',
    content: 'Maintain social connections with friends and family. Social interaction is vital for mental health and can improve longevity.',
    icon: 'fa-users',
    category: 'mental-health'
  },
  {
    id: 11,
    title: 'Posture Matters',
    content: 'Good posture helps prevent back pain and other musculoskeletal problems. Sit and stand with your shoulders back and spine aligned.',
    icon: 'fa-user',
    category: 'fitness'
  },
  {
    id: 12,
    title: 'Breathing Exercises',
    content: 'Practice deep breathing exercises to reduce anxiety and improve lung capacity. Deep breaths can help calm your mind and body.',
    icon: 'fa-wind',
    category: 'mental-health'
  }
];

/**
 * GET /api/health-tips
 * Get random health tips
 * Query params:
 *   - limit: number of tips to return (default: 3)
 *   - category: filter by category
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 3, category } = req.query;
    
    let filteredTips = [...healthTips];
    
    // Filter by category if specified
    if (category) {
      filteredTips = filteredTips.filter(tip => 
        tip.category.toLowerCase() === category.toLowerCase()
      );
    }
    
    // Shuffle and limit the results for variety
    const shuffled = filteredTips.sort(() => 0.5 - Math.random());
    const selectedTips = shuffled.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      count: selectedTips.length,
      tips: selectedTips
    });
  } catch (error) {
    console.error('Error fetching health tips:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch health tips'
    });
  }
});

/**
 * GET /api/health-tips/categories
 * Get available health tip categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = [...new Set(healthTips.map(tip => tip.category))];
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
});

module.exports = router;

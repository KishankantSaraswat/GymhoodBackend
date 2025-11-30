
import express from 'express';
const router = express.Router();

router.get('/healthcheck', (req, res) => {
  try {   
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      // database: dbStatus,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      details: 'Health check failed'
    });
  }
});

export default router; 
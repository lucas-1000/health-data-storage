import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Database, HealthSample } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize database
const db = new Database(process.env.DATABASE_URL || '');

/**
 * Authentication middleware
 */
function authenticateRequest(req: Request, res: Response, next: NextFunction) {
  const apiSecret = req.headers['x-api-secret'];

  if (!apiSecret || apiSecret !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'health-data-storage',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Bulk insert health samples
 * POST /api/samples
 *
 * Body:
 * {
 *   "userId": "user-identifier",
 *   "samples": [
 *     {
 *       "type": "BloodGlucose",
 *       "value": 95,
 *       "unit": "mg/dL",
 *       "startDate": "2025-10-22T10:30:00Z",
 *       "endDate": "2025-10-22T10:30:00Z",
 *       "source": "Lingo",
 *       "metadata": {}
 *     }
 *   ]
 * }
 */
app.post('/api/samples', authenticateRequest, async (req: Request, res: Response) => {
  try {
    const { userId, samples } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: 'samples array is required and must not be empty' });
    }

    // Transform samples to database format
    const healthSamples: HealthSample[] = samples.map((sample: any) => ({
      user_id: userId,
      type: sample.type,
      value: parseFloat(sample.value),
      unit: sample.unit,
      start_date: new Date(sample.startDate),
      end_date: new Date(sample.endDate),
      source: sample.source || 'Unknown',
      metadata: sample.metadata,
    }));

    // Store samples
    const insertedCount = await db.storeSamples(healthSamples);

    console.log(`✅ Stored ${insertedCount} new samples for user ${userId} (${samples.length} total submitted)`);

    res.json({
      success: true,
      inserted: insertedCount,
      total: samples.length,
    });
  } catch (error: any) {
    console.error('❌ Error storing samples:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * Query health samples with filters
 * GET /api/samples?userId=xxx&type=BloodGlucose&startDate=xxx&endDate=xxx&limit=100
 */
app.get('/api/samples', authenticateRequest, async (req: Request, res: Response) => {
  try {
    const { userId, type, startDate, endDate, limit } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const samples = await db.querySamples({
      userId: userId as string,
      type: type as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      count: samples.length,
      samples,
    });
  } catch (error: any) {
    console.error('❌ Error querying samples:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * Get latest sample for a specific type
 * GET /api/samples/latest?userId=xxx&type=BloodGlucose
 */
app.get('/api/samples/latest', authenticateRequest, async (req: Request, res: Response) => {
  try {
    const { userId, type } = req.query;

    if (!userId || !type) {
      return res.status(400).json({ error: 'userId and type are required' });
    }

    const sample = await db.getLatestSample(userId as string, type as string);

    if (!sample) {
      return res.status(404).json({ error: 'No samples found' });
    }

    res.json(sample);
  } catch (error: any) {
    console.error('❌ Error getting latest sample:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * Get summary statistics for a data type
 * GET /api/samples/stats?userId=xxx&type=BloodGlucose&startDate=xxx&endDate=xxx
 */
app.get('/api/samples/stats', authenticateRequest, async (req: Request, res: Response) => {
  try {
    const { userId, type, startDate, endDate } = req.query;

    if (!userId || !type) {
      return res.status(400).json({ error: 'userId and type are required' });
    }

    const stats = await db.getSummaryStats({
      userId: userId as string,
      type: type as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    if (!stats) {
      return res.status(404).json({ error: 'No data found' });
    }

    res.json(stats);
  } catch (error: any) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 8080;

async function start() {
  try {
    // Initialize database
    await db.initialize();
    console.log('✅ Database initialized');

    app.listen(PORT, () => {
      console.log(`🚀 Health Data Storage API listening on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📥 POST /api/samples - Store health samples`);
      console.log(`📤 GET  /api/samples - Query health samples`);
      console.log(`📤 GET  /api/samples/latest - Get latest sample`);
      console.log(`📊 GET  /api/samples/stats - Get statistics`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();

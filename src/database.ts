import pg from 'pg';

export interface HealthSample {
  id?: number;
  user_id: string;
  type: string;
  value: number;
  unit: string;
  start_date: Date;
  end_date: Date;
  source: string;
  metadata?: any;
  created_at?: Date;
}

export interface QueryParams {
  userId: string;
  type?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface SummaryStats {
  count: number;
  average: number;
  min: number;
  max: number;
  unit: string;
}

export class Database {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    // Check if using Cloud SQL Unix socket (no SSL needed)
    const isCloudSQLSocket = connectionString.includes('/cloudsql/');

    this.pool = new pg.Pool({
      connectionString,
      // Only use SSL for non-Cloud SQL connections
      ssl: !isCloudSQLSocket && process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    });
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS health_samples (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          type VARCHAR(100) NOT NULL,
          value NUMERIC NOT NULL,
          unit VARCHAR(50) NOT NULL,
          start_date TIMESTAMPTZ NOT NULL,
          end_date TIMESTAMPTZ NOT NULL,
          source VARCHAR(255),
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(user_id, type, start_date, source)
        );

        CREATE INDEX IF NOT EXISTS idx_health_samples_user_id ON health_samples(user_id);
        CREATE INDEX IF NOT EXISTS idx_health_samples_type ON health_samples(type);
        CREATE INDEX IF NOT EXISTS idx_health_samples_start_date ON health_samples(start_date);
        CREATE INDEX IF NOT EXISTS idx_health_samples_user_type_date ON health_samples(user_id, type, start_date DESC);
      `);
      console.log('✅ Database schema initialized');
    } finally {
      client.release();
    }
  }

  /**
   * Store health samples (bulk insert with conflict handling)
   */
  async storeSamples(samples: HealthSample[]): Promise<number> {
    if (samples.length === 0) return 0;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      let insertedCount = 0;
      for (const sample of samples) {
        const result = await client.query(
          `
          INSERT INTO health_samples (user_id, type, value, unit, start_date, end_date, source, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id, type, start_date, source) DO NOTHING
          RETURNING id
          `,
          [
            sample.user_id,
            sample.type,
            sample.value,
            sample.unit,
            sample.start_date,
            sample.end_date,
            sample.source,
            sample.metadata ? JSON.stringify(sample.metadata) : null,
          ]
        );
        if (result.rowCount && result.rowCount > 0) insertedCount++;
      }

      await client.query('COMMIT');
      return insertedCount;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Query health samples with filters
   */
  async querySamples(params: QueryParams): Promise<HealthSample[]> {
    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [params.userId];
    let paramIndex = 2;

    if (params.type) {
      conditions.push(`type = $${paramIndex}`);
      values.push(params.type);
      paramIndex++;
    }

    if (params.startDate) {
      conditions.push(`start_date >= $${paramIndex}`);
      values.push(params.startDate);
      paramIndex++;
    }

    if (params.endDate) {
      conditions.push(`end_date <= $${paramIndex}`);
      values.push(params.endDate);
      paramIndex++;
    }

    const limit = params.limit || 1000;
    const query = `
      SELECT * FROM health_samples
      WHERE ${conditions.join(' AND ')}
      ORDER BY start_date DESC
      LIMIT ${limit}
    `;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Get latest sample for a specific type
   */
  async getLatestSample(userId: string, type: string): Promise<HealthSample | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM health_samples
      WHERE user_id = $1 AND type = $2
      ORDER BY start_date DESC
      LIMIT 1
      `,
      [userId, type]
    );

    return result.rows[0] || null;
  }

  /**
   * Get summary statistics for a type
   */
  async getSummaryStats(params: {
    userId: string;
    type: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<SummaryStats | null> {
    const conditions: string[] = ['user_id = $1', 'type = $2'];
    const values: any[] = [params.userId, params.type];
    let paramIndex = 3;

    if (params.startDate) {
      conditions.push(`start_date >= $${paramIndex}`);
      values.push(params.startDate);
      paramIndex++;
    }

    if (params.endDate) {
      conditions.push(`end_date <= $${paramIndex}`);
      values.push(params.endDate);
      paramIndex++;
    }

    const query = `
      SELECT
        COUNT(*) as count,
        AVG(value) as average,
        MIN(value) as min,
        MAX(value) as max,
        unit
      FROM health_samples
      WHERE ${conditions.join(' AND ')}
      GROUP BY unit
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

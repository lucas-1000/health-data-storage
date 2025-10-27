import pg from 'pg';

export interface FoodLog {
  id?: number;
  user_id: string;
  timestamp: Date;
  photo_url?: string;
  net_carbs: number;
  protein: number;
  fat: number;
  calories: number;
  foods: string[];
  confidence: number;
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  manual_override: boolean;
  notes?: string;
  created_at?: Date;
}

export interface MealSummary {
  date: string;
  total_net_carbs: number;
  total_protein: number;
  total_fat: number;
  total_calories: number;
  meal_count: number;
}

export class FoodDatabase {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  /**
   * Initialize food_logs table
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS food_logs (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL,
          photo_url TEXT,
          net_carbs DECIMAL NOT NULL,
          protein DECIMAL NOT NULL,
          fat DECIMAL NOT NULL,
          calories DECIMAL NOT NULL,
          foods JSONB NOT NULL,
          confidence DECIMAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
          meal_type VARCHAR(50),
          manual_override BOOLEAN DEFAULT false,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_food_logs_user_timestamp
          ON food_logs(user_id, timestamp DESC);
      `);
      console.log('✅ Food logs table initialized');
    } finally {
      client.release();
    }
  }

  /**
   * Store a food log
   */
  async storeFoodLog(log: FoodLog): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO food_logs (
        user_id, timestamp, photo_url, net_carbs, protein, fat, calories,
        foods, confidence, meal_type, manual_override, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
      `,
      [
        log.user_id,
        log.timestamp,
        log.photo_url || null,
        log.net_carbs,
        log.protein,
        log.fat,
        log.calories,
        JSON.stringify(log.foods),
        log.confidence,
        log.meal_type || null,
        log.manual_override,
        log.notes || null,
      ]
    );
    return result.rows[0].id;
  }

  /**
   * Update a food log (for manual corrections)
   */
  async updateFoodLog(id: number, updates: Partial<FoodLog>): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.net_carbs !== undefined) {
      fields.push(`net_carbs = $${paramIndex++}`);
      values.push(updates.net_carbs);
    }
    if (updates.protein !== undefined) {
      fields.push(`protein = $${paramIndex++}`);
      values.push(updates.protein);
    }
    if (updates.fat !== undefined) {
      fields.push(`fat = $${paramIndex++}`);
      values.push(updates.fat);
    }
    if (updates.calories !== undefined) {
      fields.push(`calories = $${paramIndex++}`);
      values.push(updates.calories);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(updates.notes);
    }
    if (updates.manual_override !== undefined) {
      fields.push(`manual_override = $${paramIndex++}`);
      values.push(updates.manual_override);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const result = await this.pool.query(
      `UPDATE food_logs SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Delete a food log
   */
  async deleteFoodLog(id: number, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM food_logs WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Get food logs for a date range
   */
  async getFoodLogs(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    mealType?: string,
    limit: number = 100
  ): Promise<FoodLog[]> {
    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [userId];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex}`);
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex}`);
      values.push(endDate);
      paramIndex++;
    }

    if (mealType) {
      conditions.push(`meal_type = $${paramIndex}`);
      values.push(mealType);
      paramIndex++;
    }

    const query = `
      SELECT * FROM food_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    const result = await this.pool.query(query, values);
    return result.rows.map(row => ({
      ...row,
      foods: row.foods as string[],
    }));
  }

  /**
   * Get daily nutrition summary
   * Uses America/Los_Angeles timezone for consistent day boundaries
   */
  async getDailySummary(userId: string, date: Date): Promise<MealSummary | null> {
    // Format date as YYYY-MM-DD string for comparison
    const dateString = date.toISOString().split('T')[0];

    const result = await this.pool.query(
      `
      SELECT
        DATE(timestamp AT TIME ZONE 'America/Los_Angeles') as date,
        SUM(net_carbs) as total_net_carbs,
        SUM(protein) as total_protein,
        SUM(fat) as total_fat,
        SUM(calories) as total_calories,
        COUNT(*) as meal_count
      FROM food_logs
      WHERE user_id = $1
        AND DATE(timestamp AT TIME ZONE 'America/Los_Angeles') = $2
      GROUP BY DATE(timestamp AT TIME ZONE 'America/Los_Angeles')
      `,
      [userId, dateString]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      date: row.date,
      total_net_carbs: parseFloat(row.total_net_carbs),
      total_protein: parseFloat(row.total_protein),
      total_fat: parseFloat(row.total_fat),
      total_calories: parseFloat(row.total_calories),
      meal_count: parseInt(row.meal_count),
    };
  }
}

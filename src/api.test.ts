/**
 * Integration tests for the deployed API
 * Tests the live Cloud Run service
 */

// @ts-nocheck - Integration tests with dynamic API responses

const API_URL = 'https://health-data-storage-835031330028.us-central1.run.app';
const API_SECRET = process.env.API_SECRET || 'aVOueQd1GXVNUXvcVChJAb/9dkfqZzf4BqXX/nXw4j8=';
const TEST_USER_ID = 'test-user@example.com';

describe('Health Data Storage API - Integration Tests', () => {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Secret': API_SECRET,
  };

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.service).toBe('health-data-storage');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Food Logging API', () => {
    let testMealId: number;

    it('should log a manual meal', async () => {
      const meal = {
        userId: TEST_USER_ID,
        timestamp: new Date().toISOString(),
        macros: {
          netCarbs: 2,
          protein: 28,
          fat: 24,
          calories: 340,
        },
        foods: ['4 eggs', 'spinach', 'butter'],
        confidence: 1.0,
        mealType: 'breakfast',
        manualOverride: true,
        notes: 'Test meal from automated tests',
      };

      const response = await fetch(`${API_URL}/api/food/log`, {
        method: 'POST',
        headers,
        body: JSON.stringify(meal),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.mealId).toBeDefined();

      testMealId = data.mealId;
      console.log(`✅ Created test meal with ID: ${testMealId}`);
    });

    it('should retrieve meals', async () => {
      const today = new Date();
      const startDate = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endDate = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      const url = new URL(`${API_URL}/api/food`);
      url.searchParams.set('userId', TEST_USER_ID);
      url.searchParams.set('startDate', startDate);
      url.searchParams.set('endDate', endDate);
      url.searchParams.set('limit', '10');

      const response = await fetch(url.toString(), { headers });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(data.meals)).toBe(true);

      console.log(`✅ Retrieved ${data.count} meals for today`);
    });

    it('should get daily summary', async () => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const url = new URL(`${API_URL}/api/food/summary/daily`);
      url.searchParams.set('userId', TEST_USER_ID);
      url.searchParams.set('date', today);

      const response = await fetch(url.toString(), { headers });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.date).toBeDefined();
      expect(typeof data.total_net_carbs).toBe('number');
      expect(typeof data.total_protein).toBe('number');
      expect(typeof data.total_fat).toBe('number');
      expect(typeof data.meal_count).toBe('number');

      console.log(`✅ Daily summary: ${data.meal_count} meals, ${data.total_net_carbs}g carbs, ${data.total_protein}g protein`);
    });

    it('should update a meal', async () => {
      if (!testMealId) {
        console.log('⏭️  Skipping update test - no meal ID');
        return;
      }

      const updates = {
        macros: {
          netCarbs: 3,
          protein: 30,
          fat: 25,
          calories: 350,
        },
        notes: 'Updated by automated tests',
      };

      const response = await fetch(`${API_URL}/api/food/${testMealId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      console.log(`✅ Updated meal ${testMealId}`);
    });

    it('should delete a meal', async () => {
      if (!testMealId) {
        console.log('⏭️  Skipping delete test - no meal ID');
        return;
      }

      const url = new URL(`${API_URL}/api/food/${testMealId}`);
      url.searchParams.set('userId', TEST_USER_ID);

      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      console.log(`✅ Deleted test meal ${testMealId}`);
    });

    it('should reject requests without API secret', async () => {
      const response = await fetch(`${API_URL}/api/food`, {
        headers: {
          'Content-Type': 'application/json',
          // No X-API-Secret header
        },
      });

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid API secret', async () => {
      const response = await fetch(`${API_URL}/api/food`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Secret': 'invalid-secret',
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Health Samples API (Existing)', () => {
    it('should query existing health samples', async () => {
      const url = new URL(`${API_URL}/api/samples`);
      url.searchParams.set('userId', 'lucas@example.com');
      url.searchParams.set('type', 'BloodGlucose');
      url.searchParams.set('limit', '5');

      const response = await fetch(url.toString(), { headers });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(data.samples)).toBe(true);

      console.log(`✅ Retrieved ${data.count} health samples`);
    });
  });
});

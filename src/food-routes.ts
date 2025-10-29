import { Router, Request, Response } from 'express';
import { FoodDatabase } from './food-database.js';
import { OpenAIAnalyzer } from './openai-analyzer.js';
import { PhotoStorage } from './storage.js';

export function createFoodRoutes(
  foodDb: FoodDatabase,
  analyzer: OpenAIAnalyzer,
  storage: PhotoStorage
): Router {
  const router = Router();

  /**
   * Analyze a food photo
   * POST /api/food/analyze
   * Body: { image: base64, voiceNote?: string, userId: string }
   */
  router.post('/analyze', async (req: Request, res: Response) => {
    try {
      const { image, voiceNote, userId } = req.body;

      if (!image || !userId) {
        return res.status(400).json({ error: 'image and userId are required' });
      }

      console.log(`🔍 Analyzing meal photo for user ${userId}...`);

      // Analyze with OpenAI Vision
      const analysis = await analyzer.analyzeFoodPhoto(image, voiceNote);

      console.log(`✅ Analysis complete: ${analysis.foods.join(', ')} (confidence: ${analysis.confidence})`);

      res.json(analysis);
    } catch (error: any) {
      console.error('❌ Error analyzing food photo:', error);
      res.status(500).json({ error: 'Failed to analyze photo', message: error.message });
    }
  });

  /**
   * Analyze text description of food (without photo)
   * POST /api/food/analyze-text
   * Body: { description: string, userId: string }
   */
  router.post('/analyze-text', async (req: Request, res: Response) => {
    try {
      const { description, userId } = req.body;

      if (!description || !userId) {
        return res.status(400).json({ error: 'description and userId are required' });
      }

      console.log(`📝 Analyzing text description for user ${userId}: "${description}"`);

      // Analyze with OpenAI (text only)
      const analysis = await analyzer.parseVoiceNote(description);

      console.log(`✅ Text analysis complete: ${analysis.foods.join(', ')} (confidence: ${analysis.confidence})`);

      res.json(analysis);
    } catch (error: any) {
      console.error('❌ Error analyzing text description:', error);
      res.status(500).json({ error: 'Failed to analyze description', message: error.message });
    }
  });

  /**
   * Log a meal (with or without photo)
   * POST /api/food/log
   * Body: {
   *   userId: string,
   *   timestamp: string,
   *   image?: base64,
   *   voiceNote?: string,
   *   macros: { netCarbs, protein, fat, calories },
   *   foods: string[],
   *   confidence: number,
   *   mealType?: string,
   *   manualOverride?: boolean,
   *   notes?: string
   * }
   */
  router.post('/log', async (req: Request, res: Response) => {
    try {
      const {
        userId,
        timestamp,
        image,
        macros,
        foods,
        confidence,
        mealType,
        manualOverride = false,
        notes,
      } = req.body;

      if (!userId || !timestamp || !macros || !foods) {
        return res.status(400).json({
          error: 'userId, timestamp, macros, and foods are required',
        });
      }

      console.log(`📝 Logging meal for user ${userId} at ${timestamp}...`);

      // Store the meal in database (without photo URL first)
      const mealId = await foodDb.storeFoodLog({
        user_id: userId,
        timestamp: new Date(timestamp),
        net_carbs: macros.netCarbs,
        protein: macros.protein,
        fat: macros.fat,
        calories: macros.calories,
        foods,
        confidence,
        meal_type: mealType,
        manual_override: manualOverride,
        notes,
      });

      // If photo was provided, upload it and update the record
      let photoUrl: string | undefined;
      if (image) {
        console.log(`📸 Uploading photo for meal ${mealId}...`);
        photoUrl = await storage.uploadPhoto(userId, image, mealId);

        // Update the food log with photo URL
        await foodDb.updateFoodLog(mealId, { photo_url: photoUrl } as any);
        console.log(`✅ Photo uploaded: ${photoUrl}`);
      }

      console.log(`✅ Meal logged successfully (ID: ${mealId})`);

      res.json({
        success: true,
        mealId,
        photoUrl,
      });
    } catch (error: any) {
      console.error('❌ Error logging meal:', error);
      res.status(500).json({ error: 'Failed to log meal', message: error.message });
    }
  });

  /**
   * Update a meal (manual corrections)
   * PUT /api/food/:mealId
   * Body: { macros?: {...}, notes?: string, foods?: string[], mealType?: string }
   */
  router.put('/:mealId', async (req: Request, res: Response) => {
    try {
      const mealId = parseInt(req.params.mealId);
      const { macros, notes, foods, mealType } = req.body;

      const updates: any = {
        manual_override: true,
      };

      if (macros) {
        if (macros.netCarbs !== undefined) updates.net_carbs = macros.netCarbs;
        if (macros.protein !== undefined) updates.protein = macros.protein;
        if (macros.fat !== undefined) updates.fat = macros.fat;
        if (macros.calories !== undefined) updates.calories = macros.calories;
      }

      if (notes !== undefined) {
        updates.notes = notes;
      }

      if (foods !== undefined) {
        updates.foods = foods;
      }

      if (mealType !== undefined) {
        updates.meal_type = mealType;
      }

      const updated = await foodDb.updateFoodLog(mealId, updates);

      if (!updated) {
        return res.status(404).json({ error: 'Meal not found' });
      }

      console.log(`✅ Meal ${mealId} updated`);

      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ Error updating meal:', error);
      res.status(500).json({ error: 'Failed to update meal', message: error.message });
    }
  });

  /**
   * Delete a meal
   * DELETE /api/food/:mealId?userId=xxx
   */
  router.delete('/:mealId', async (req: Request, res: Response) => {
    try {
      const mealId = parseInt(req.params.mealId);
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
      }

      const deleted = await foodDb.deleteFoodLog(mealId, userId as string);

      if (!deleted) {
        return res.status(404).json({ error: 'Meal not found' });
      }

      console.log(`✅ Meal ${mealId} deleted`);

      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ Error deleting meal:', error);
      res.status(500).json({ error: 'Failed to delete meal', message: error.message });
    }
  });

  /**
   * Get meals for a date range
   * GET /api/food?userId=xxx&startDate=xxx&endDate=xxx&mealType=xxx&limit=100
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { userId, startDate, endDate, mealType, limit } = req.query;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const meals = await foodDb.getFoodLogs(
        userId as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined,
        mealType as string | undefined,
        limit ? parseInt(limit as string) : 100
      );

      // Get signed URLs for photos
      const mealsWithSignedUrls = await Promise.all(
        meals.map(async (meal) => {
          if (meal.photo_url) {
            try {
              const signedUrl = await storage.getSignedUrl(meal.photo_url);
              return { ...meal, photo_signed_url: signedUrl };
            } catch (error) {
              console.error(`Failed to get signed URL for ${meal.photo_url}:`, error);
              return meal;
            }
          }
          return meal;
        })
      );

      res.json({
        count: meals.length,
        meals: mealsWithSignedUrls,
      });
    } catch (error: any) {
      console.error('❌ Error querying meals:', error);
      res.status(500).json({ error: 'Failed to query meals', message: error.message });
    }
  });

  /**
   * Get daily nutrition summary
   * GET /api/food/summary/daily?userId=xxx&date=2025-10-26
   */
  router.get('/summary/daily', async (req: Request, res: Response) => {
    try {
      const { userId, date } = req.query;

      if (!userId || !date) {
        return res.status(400).json({ error: 'userId and date are required' });
      }

      const summary = await foodDb.getDailySummary(
        userId as string,
        new Date(date as string)
      );

      if (!summary) {
        return res.json({
          date: date as string,
          total_net_carbs: 0,
          total_protein: 0,
          total_fat: 0,
          total_calories: 0,
          meal_count: 0,
        });
      }

      res.json(summary);
    } catch (error: any) {
      console.error('❌ Error getting daily summary:', error);
      res.status(500).json({ error: 'Failed to get summary', message: error.message });
    }
  });

  return router;
}

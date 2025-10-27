import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

// Zod schema for structured meal analysis
const MealAnalysisSchema = z.object({
  netCarbs: z.number().describe('Net carbohydrates in grams (total carbs minus fiber)'),
  protein: z.number().describe('Protein in grams'),
  fat: z.number().describe('Total fat in grams'),
  calories: z.number().describe('Total calories'),
  foods: z.array(z.string()).describe('List of identified foods with quantities'),
  confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
  portionEstimate: z.string().describe('Estimated portion sizes for reference'),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).nullable().describe('Type of meal'),
});

export type MealAnalysis = z.infer<typeof MealAnalysisSchema>;

export class OpenAIAnalyzer {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Analyze a food photo and return structured nutrition data
   */
  async analyzeFoodPhoto(
    imageBase64: string,
    voiceNote?: string
  ): Promise<MealAnalysis> {
    const systemPrompt = `You are a nutrition expert analyzing meal photos for ketogenic diet tracking.

Key guidelines:
1. **Net carbs = total carbs - fiber** (critical for keto)
2. Be conservative with carb estimates (better to overestimate)
3. Consider portion sizes carefully - look for visual cues (plate size, utensils, hands)
4. For mixed dishes, estimate individual components
5. If unsure, indicate lower confidence (<0.7)
6. Common keto foods: eggs, meat, fish, leafy greens, nuts, oils, cheese, avocado
7. Hidden carbs: sauces, breading, marinades - account for these

Return precise macro estimates suitable for strict ketogenic tracking (<20g net carbs/day).`;

    const userMessage = voiceNote
      ? `Analyze this meal photo. User notes: "${voiceNote}". Estimate macronutrients.`
      : 'Analyze this meal photo and estimate macronutrients.';

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-2025-04-14', // Latest GPT-4.1 with vision (April 2025)
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        response_format: zodResponseFormat(MealAnalysisSchema, 'meal_analysis'),
        temperature: 0.3, // Lower temperature for consistent estimates
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const analysis = JSON.parse(content) as MealAnalysis;
      return analysis;
    } catch (error: any) {
      console.error('❌ OpenAI analysis error:', error);
      throw new Error(`Failed to analyze food photo: ${error.message}`);
    }
  }

  /**
   * Parse a voice note into structured meal data (without photo)
   */
  async parseVoiceNote(voiceNote: string): Promise<MealAnalysis> {
    const systemPrompt = `You are a nutrition expert parsing meal descriptions for ketogenic diet tracking.

Extract meal information from user's description and estimate macronutrients.
Be conservative with carb estimates. If portion sizes aren't specified, assume standard portions.

Return structured nutrition data based on the description.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-2025-04-14', // Latest GPT-4.1 (April 2025)
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Parse this meal description and estimate macros: "${voiceNote}"`,
          },
        ],
        response_format: zodResponseFormat(MealAnalysisSchema, 'meal_analysis'),
        temperature: 0.3,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(content) as MealAnalysis;
    } catch (error: any) {
      console.error('❌ OpenAI parsing error:', error);
      throw new Error(`Failed to parse voice note: ${error.message}`);
    }
  }
}

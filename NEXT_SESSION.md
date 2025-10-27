# Food Tracker - Next Session TODO

## Session Summary (Oct 26, 2025)

### Completed This Session ✅

1. **Fixed Pre-Analysis Notes Bug**
   - Notes added before photo analysis now properly sent to AI
   - File: `MealAnalysisView.swift:151`

2. **Fixed Backend URL**
   - Corrected Config.swift to use proper Cloud Run URL
   - File: `Config.swift:6`

3. **Fixed Timezone Bug**
   - Daily summaries now use Pacific Time instead of UTC
   - Properly handles meals logged after 5 PM PDT
   - File: `food-database.ts:204-223`

4. **Implemented AI-Powered Manual Entry** (Phase 2.1)
   - Backend: Added `/api/food/analyze-text` endpoint
   - iOS: Added `analyzeText()` method to APIClient
   - iOS: Complete redesign of ManualEntryView with AI workflow
   - Features:
     - User types food description
     - AI estimates macros with GPT-4
     - Shows confidence badge
     - Editable fields before saving
     - Reset and retry option

## Repositories Updated ✅

- **Backend**: `https://github.com/lucas-1000/health-data-storage`
  - Commit: "Add food tracking features and fixes"
  - Deployed to Cloud Run: `health-data-storage-00011-bmw`

- **iOS App**: `https://github.com/lucas-1000/food-tracker-ios`
  - Commit: "Initial commit: Food Tracker iOS App"
  - All Phase 2.1 changes included

## Next Steps (For Next Session)

### Phase 2.2: Daily Summary View with Date Picker
**Priority: HIGH - User explicitly requested this feature**

The user wants to view daily summaries for different dates, not just today.

#### Implementation Plan:

1. **Create DailySummaryView.swift**
   - Date picker to select any date
   - Shows macro totals for selected date
   - Shows meal list for that day
   - Visual progress bars (reuse from ContentView)

2. **Navigation**
   - Option 1: Add tab bar navigation to switch between Today/History/Daily View
   - Option 2: Add button in ContentView to navigate to daily summary
   - Recommendation: Use NavigationLink in ContentView toolbar

3. **Backend** (Already ready!)
   - `/api/food/summary/daily?userId=X&date=YYYY-MM-DD` ✅
   - `/api/food?userId=X&startDate=X&endDate=X` ✅

#### Example Code Structure:
```swift
struct DailySummaryView: View {
    @State private var selectedDate = Date()
    @State private var summary: DailySummary?
    @State private var meals: [FoodLog] = []

    var body: some View {
        VStack {
            DatePicker("Date", selection: $selectedDate, displayedComponents: .date)

            MacroProgressView(consumed: summary?.macros ?? .zero, targets: Config.dailyTargets)

            List(meals) { meal in
                MealRow(meal: meal)
            }
        }
        .onChange(of: selectedDate) { loadData() }
    }
}
```

### Phase 3: Per-Food Editing with Serving Sizes
**Priority: MEDIUM - Requires major architecture changes**

The user wants to edit meals on a per-food basis with serving size adjustments.

#### Blocked Until:
- Need to update AI prompts to return structured food data
- Need to update database schema to store per-food breakdown
- Need to create MealDetailView component

#### User's Original Requests:
1. Edit meals after analysis ❌ (Not started)
2. Serving size editing ❌ (Not started)
3. AI-powered manual entry ✅ (DONE!)
4. Pre-analysis notes ✅ (DONE!)
5. View different days ❌ (Next: Phase 2.2)
6. Dashboard macro updates ✅ (DONE!)

## Testing Recommendations

Before starting Phase 2.2, consider testing:
1. AI-powered manual entry end-to-end
2. Verify timezone fix works for all edge cases
3. Test pre-analysis notes are improving AI accuracy

## Technical Notes

- **Backend URL**: `https://health-data-storage-cd56kiddrq-uc.a.run.app`
- **Database**: PostgreSQL on Cloud SQL
- **Timezone**: All queries use `America/Los_Angeles`
- **AI Model**: GPT-4o (gpt-4.1) with structured outputs (Zod schema)
- **Photo Storage**: Google Cloud Storage with signed URLs

## Known Issues

None currently! All reported bugs have been fixed.

## User Feedback

- Timezone fix confirmed working: "ok, shows the right time now"
- Requested pause for tonight and ensured repos are updated ✅

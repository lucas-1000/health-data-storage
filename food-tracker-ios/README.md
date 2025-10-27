# Food Tracker iOS

Modern iOS app for food logging with AI-powered photo analysis.

## Features
- 📸 Camera capture with live photo analysis
- 🧠 AI-powered macro estimation (OpenAI GPT-4o Vision)
- ✏️ Manual entry and corrections
- 📊 Real-time macro progress tracking
- 🏥 HealthKit integration
- 📱 iOS 18+ with SwiftUI 6

## Setup

1. Open `FoodTracker.xcodeproj` in Xcode 16+
2. Update `Config.swift` with your backend API URL and secret
3. Build and run on device (camera required)

## Architecture

```
iPhone App (Swift/SwiftUI)
    ↓ HTTPS
Backend API (Cloud Run)
    ↓ 
OpenAI Vision API → Analyze photos
    ↓
PostgreSQL → Store meals
```

# Health Data Storage API

A generic, RESTful API for storing and querying health data with PostgreSQL backend. Designed to be consumed by mobile apps, MCP servers, and other health data clients.

## 🎯 Purpose

This service acts as the **single source of truth** for all your health data. It provides a clean, generic API that can:
- Accept health samples from multiple sources (iOS app, wearables, manual entry)
- Store data in a structured PostgreSQL database
- Provide query APIs for retrieving and analyzing data
- Serve multiple consumers (MCP servers, dashboards, analytics tools)

## 🏗️ Architecture Position

```
┌─────────────────┐
│  Data Sources   │
│  - iOS App      │
│  - Wearables    │
│  - Manual Entry │
└────────┬────────┘
         │ POST /api/samples
         ▼
┌──────────────────────┐
│ health-data-storage  │  ← YOU ARE HERE
│  - REST API          │
│  - PostgreSQL        │
└────────┬─────────────┘
         │ GET /api/samples/*
         │
    ┌────┴────┬────────────┐
    ▼         ▼            ▼
┌────────┐ ┌──────┐  ┌──────────┐
│MCP     │ │Web   │  │Analytics │
│Servers │ │Dashboard│  │ Tools    │
└────────┘ └──────┘  └──────────┘
```

## 📊 Database Schema

```sql
CREATE TABLE health_samples (
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
```

**Supported Data Types (examples)**:
- `BloodGlucose` (mg/dL)
- `HeartRate` (bpm)
- `Steps` (count)
- `BodyMass` (kg)
- `ActiveEnergyBurned` (kcal)
- Any other health metric

## 🔌 API Endpoints

### Health Check
```
GET /health
```
Response:
```json
{
  "status": "ok",
  "service": "health-data-storage",
  "timestamp": "2025-10-22T12:00:00Z"
}
```

### Store Health Samples (Bulk Insert)
```
POST /api/samples
Headers: X-API-Secret: your-secret
Body:
{
  "userId": "user@example.com",
  "samples": [
    {
      "type": "BloodGlucose",
      "value": 95,
      "unit": "mg/dL",
      "startDate": "2025-10-22T10:30:00Z",
      "endDate": "2025-10-22T10:30:00Z",
      "source": "Lingo",
      "metadata": {}
    }
  ]
}
```
Response:
```json
{
  "success": true,
  "inserted": 1,
  "total": 1
}
```

### Query Health Samples
```
GET /api/samples?userId=user@example.com&type=BloodGlucose&startDate=2025-10-01T00:00:00Z&endDate=2025-10-22T23:59:59Z&limit=100
Headers: X-API-Secret: your-secret
```
Response:
```json
{
  "count": 10,
  "samples": [...]
}
```

### Get Latest Sample
```
GET /api/samples/latest?userId=user@example.com&type=BloodGlucose
Headers: X-API-Secret: your-secret
```
Response:
```json
{
  "id": 123,
  "user_id": "user@example.com",
  "type": "BloodGlucose",
  "value": 95,
  "unit": "mg/dL",
  "start_date": "2025-10-22T10:30:00Z",
  "end_date": "2025-10-22T10:30:00Z",
  "source": "Lingo",
  "metadata": {},
  "created_at": "2025-10-22T10:31:00Z"
}
```

### Get Summary Statistics
```
GET /api/samples/stats?userId=user@example.com&type=BloodGlucose&startDate=2025-10-01T00:00:00Z&endDate=2025-10-22T23:59:59Z
Headers: X-API-Secret: your-secret
```
Response:
```json
{
  "count": 100,
  "average": 98.5,
  "min": 75,
  "max": 125,
  "unit": "mg/dL"
}
```

## 🚀 Setup

### Prerequisites
- PostgreSQL database (Cloud SQL, Supabase, etc.)
- Node.js 20+
- Google Cloud Platform account (for deployment)

### Environment Variables
```bash
DATABASE_URL=postgresql://user:password@host:5432/dbname
API_SECRET=your-secure-random-secret
PORT=8080
NODE_ENV=production
```

### Local Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server
npm start
```

### Deploy to Cloud Run

```bash
# Set environment variables
export GOOGLE_CLOUD_PROJECT=your-project-id
export DATABASE_URL=postgresql://...
export API_SECRET=$(openssl rand -base64 32)

# Deploy
chmod +x deploy.sh
./deploy.sh
```

After deployment, save the service URL and API_SECRET for use in:
- iOS app configuration
- MCP server configuration
- Other clients

## 🔒 Authentication

API uses a shared secret (`X-API-Secret` header) for authentication. This is simple but effective for:
- Mobile apps (secret stored securely on device)
- MCP servers (secret in environment variables)
- Trusted clients

For multi-tenant or public-facing deployments, consider implementing OAuth2 or JWT authentication.

## 📈 Future Extensions

Easy to add:
- **New data types**: Just start sending them! Schema is generic.
- **Multi-user support**: User management and proper authentication.
- **Webhooks**: Notify consumers when new data arrives.
- **Data export**: CSV, JSON bulk exports.
- **Aggregations**: Daily/weekly/monthly rollups.
- **Data retention**: Automatic cleanup of old data.

## 🔗 Related Projects

- **health-tracking-app**: iOS app that POSTs data to this API
- **mcp-glucose**: MCP server that queries glucose data from this API
- **mcp-activity**: (future) MCP server for activity data
- **mcp-nutrition**: (future) MCP server for food/nutrition data

## 📝 License

MIT

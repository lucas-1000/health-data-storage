# Claude MCP Setup Guide

This guide shows how to add Claude.ai support to your existing OAuth setup **without disrupting ChatGPT**.

---

## 🎯 What We're Doing

Adding Claude's callback URLs to your existing `food-mcp-production` OAuth client so both ChatGPT and Claude can authenticate users.

**Current Setup** (works with ChatGPT):
- Redirect URIs: `https://food-mcp-server-835031330028.us-central1.run.app/oauth/callback`

**After Update** (works with both):
- ✅ ChatGPT: `https://food-mcp-server-835031330028.us-central1.run.app/oauth/callback`
- ✅ Claude: `https://claude.ai/api/mcp/auth_callback`
- ✅ Future Claude: `https://claude.com/api/mcp/auth_callback`

---

## 🔧 Step 1: Update OAuth Client (Choose One Method)

### **Method A: Using Cloud Shell** (Easiest)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click the **Cloud Shell** icon (top right)
3. Run:
```bash
gcloud sql connect health-data-db --user=postgres --database=health_data
```
4. Enter password when prompted (check your .env file)
5. Paste this SQL:
```sql
UPDATE oauth_clients
SET redirect_uris = array_cat(
  redirect_uris,
  ARRAY[
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback'
  ]
)
WHERE client_id = 'food-mcp-production'
  AND NOT ('https://claude.ai/api/mcp/auth_callback' = ANY(redirect_uris));

-- Verify
SELECT client_id, name, redirect_uris
FROM oauth_clients
WHERE client_id = 'food-mcp-production';
```
6. You should see all three callback URLs listed

### **Method B: Using Local Cloud SQL Proxy**

1. Start Cloud SQL Proxy:
```bash
cd /Users/lucashanson/Documents/Github/LifeOS/health-data-storage
./start-cloud-sql-proxy.sh
```

2. In a new terminal, run the update script:
```bash
cd /Users/lucashanson/Documents/Github/LifeOS/health-data-storage
npx tsx scripts/add-claude-callback.ts
```

3. You should see:
```
✅ Successfully added Claude callback URLs!
```

### **Method C: Using gcloud sql execute**

```bash
cd /Users/lucashanson/Documents/Github/LifeOS/health-data-storage

cat scripts/add-claude-callback.sql | gcloud sql connect health-data-db \
  --user=postgres \
  --database=health_data \
  --quiet
```

---

## 📡 Step 2: Verify OAuth Discovery Endpoint

Your MCP server already advertises OAuth capabilities. Verify it's working:

```bash
curl https://food-mcp-server-835031330028.us-central1.run.app/.well-known/oauth-protected-resource
```

**Expected Response:**
```json
{
  "resource": "https://food-mcp-server-835031330028.us-central1.run.app",
  "authorization_servers": [
    "https://health-data-storage-835031330028.us-central1.run.app"
  ],
  "mcp_endpoint": "https://food-mcp-server-835031330028.us-central1.run.app/sse"
}
```

✅ If you see this, your MCP server is properly advertising OAuth support!

---

## 🌐 Step 3: Connect in Claude.ai

1. Go to [Claude.ai](https://claude.ai)
2. Click your profile → **Settings**
3. Navigate to **Custom Connectors** (or **Integrations**)
4. Click **Add custom connector**

### Fill in the form:

**Name:**
```
Food Logger
```

**SSE URL:**
```
https://food-mcp-server-835031330028.us-central1.run.app/sse
```

**Advanced Settings** → Expand

**OAuth Client ID:** (optional - leave empty for DCR)
```
food-mcp-production
```

**OAuth Client Secret:** (optional - leave empty for DCR)
```
0424cda9cef8a0e02c13e0032f9a8db9bcfbff78baff53e36e181e1bf83557cd
```

5. Click **Add** or **Save**

---

## 🔐 Step 4: Authenticate

After adding the connector:

1. Claude will redirect you to Google Sign-In
2. **Sign in with the same Google account** you use in your iOS app
3. Authorize the requested permissions:
   - ✅ read:food
   - ✅ write:food
   - ✅ profile
4. You'll be redirected back to Claude
5. Connection complete! ✅

---

## 🧪 Step 5: Test It

In Claude, try these commands:

```
What did I eat today?
```

```
Show me my recent meals
```

```
Get my nutrition summary for this week
```

```
Search for meals with eggs
```

Claude should respond with your actual meal data from the iOS app!

---

## 🔍 Troubleshooting

### **Issue: "OAuth callback error"**

**Cause**: Callback URL not in allowed list

**Fix**: Make sure you ran the SQL update in Step 1. Verify with:
```sql
SELECT redirect_uris FROM oauth_clients WHERE client_id = 'food-mcp-production';
```

Should include: `https://claude.ai/api/mcp/auth_callback`

---

### **Issue: "Connection failed" or "Cannot connect to server"**

**Cause**: MCP server not running or URL wrong

**Fix**: Verify your MCP server is deployed:
```bash
curl https://food-mcp-server-835031330028.us-central1.run.app/health
```

Should return: `{"status":"ok"}`

---

### **Issue: "Invalid client credentials"**

**Cause**: Wrong OAuth client ID or secret

**Fix**: Double-check the credentials match what's in your database:
```sql
SELECT client_id, client_secret FROM oauth_clients WHERE client_id = 'food-mcp-production';
```

---

### **Issue: "No data returned"**

**Cause**: Authenticated as different user than iOS app

**Fix**: Make sure you sign in to Claude with **the same Google account** you use in the iOS Food Tracker app.

---

## ✅ Verification Checklist

- [ ] OAuth client updated with Claude callback URLs
- [ ] `.well-known/oauth-protected-resource` endpoint returns correct data
- [ ] Connected connector in Claude.ai
- [ ] Authenticated with same Google account as iOS app
- [ ] Test query returns meal data

---

## 📊 Current Architecture

```
┌──────────────┐
│  Claude.ai   │
└──────┬───────┘
       │
       │ 1. OAuth redirect
       ↓
┌────────────────────────┐
│ Food MCP Server        │
│ (SSE + OAuth)          │
└────────┬───────────────┘
         │
         │ 2. Forwards to backend
         ↓
┌─────────────────────────────┐
│ Health Data Storage Backend │
│ (OAuth Provider)            │
└────────┬────────────────────┘
         │
         │ 3. Google Sign-In
         ↓
    ┌─────────┐
    │ Google  │
    │  OAuth  │
    └────┬────┘
         │
         │ 4. Returns google_id
         ↓
┌─────────────────────────────┐
│ PostgreSQL Database         │
│ - Users (matched by         │
│   google_id)                │
│ - OAuth Tokens              │
│ - Samples (meals)           │
└─────────────────────────────┘
```

**User Matching**: Same Google account → same `google_id` → same `user_id` → same meals

---

## 🎉 Success!

Once connected, you can ask Claude about your food in natural language, and it will query your actual meal data from the iOS app!

Both ChatGPT and Claude now work with the same backend - no conflicts!

---

## 📝 Files Modified

- ✅ `scripts/add-claude-callback.ts` - Script to update OAuth client
- ✅ `scripts/add-claude-callback.sql` - SQL to update OAuth client
- ✅ No changes to existing MCP server code (already supports OAuth)
- ✅ No changes to ChatGPT integration (still works)

---

## 🆘 Need Help?

Check these resources:
- **OAuth Discovery**: https://food-mcp-server-835031330028.us-central1.run.app/.well-known/oauth-protected-resource
- **MCP Server Health**: https://food-mcp-server-835031330028.us-central1.run.app/health
- **Backend Health**: https://health-data-storage-835031330028.us-central1.run.app/health
- **Claude Docs**: https://support.claude.com/en/articles/11503834

---

Ready to connect Claude! 🚀

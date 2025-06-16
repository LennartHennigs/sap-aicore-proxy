# AI Hackathon Starter 🚀

Spin up an AI‑powered project in minutes.

---

## ⚡ Quick Start

```bash
# 1. Clone and enter
git clone https://github.com/leanix-sandbox/ai-hackathon-starter.git
cd ai-hackathon-starter

# 2. Install exact deps
npm ci

# 3. Add secrets
cp .env.example .env   # edit values

# 4. Run
npm start
```

---

## 🔑 Environment Vars

Below are example values you can use in your `.env` file.  
**Replace with your real credentials for production.**

```env
ACCESS_TOKEN_BASE_URL=https://your-auth.example.com
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
AI_API_BASE_URL=https://your-ai-api.example.com
SAP_AICORE_DEPLOYMENT_URL=https://your-sap-ai-core-instance.example.com/v2/lm/deployments

# Langfuse example secrets and endpoints
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LANGFUSE_PUBLIC_KEY=pk-lf-yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
LANGFUSE_ENDPOINT=http://localhost:3000
```

---

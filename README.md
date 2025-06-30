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
AICORE_AUTH_URL=https://your-auth.example.com
AICORE_CLIENT_ID=your-client-id
AICORE_CLIENT_SECRET=your-client-secret
AICORE_BASE_URL=https://your-ai-api.example.com
AICORE_DEPLOYMENT_URL=https://your-sap-ai-core-instance.example.com/v2/lm/deployments

# Langfuse example secrets and endpoints
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LANGFUSE_PUBLIC_KEY=pk-lf-yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
LANGFUSE_ENDPOINT=http://localhost:3000
```

---

## How to get the model deployment URL?

To get the model deployment URL, you can use the SAP AI Core API. Here’s how for example to deploy gpt-4.1:

```bash
./scripts/deploy-model.sh gpt-4.1
```

This script will deploy the model and output the deployment URL, which you can then use in your `.env` file with the key `AICORE_DEPLOYMENT_URL`.

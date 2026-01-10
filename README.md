# 🛡️ StreamGuard AI

**Cost-Effective AI Security with Gmail & Telegram Integration.**

StreamGuard turns your cheap specific cameras (XVR/NVR) into smart AI-powered security systems. It listens to email alerts, analyzes images with **Qwen 2.5 VL (via OpenRouter)**, and sends intelligent alerts to Telegram.

## 🚀 Features
- **Real-time Monitoring:** IMAP IDLE (Push Notification) - 0s delay.
- **AI Analysis:** OpenRouter with Qwen 2.5 VL 7B (~$0.2/1M tokens).
- **Smart Filter:** Ignores "Alarm Cleared" emails & filters unwanted objects.
- **Telegram Alerts:** Sends 16:9 resized snapshots with descriptions.
- **Web Dashboard:** View logs & configure filters at `http://localhost:3000`.

## 🛠️ Setup & Run

### 1. Prerequisites
- Node.js 18+
- Gmail Account (with App Password)
- **OpenRouter API Key** - Get at: https://openrouter.ai/keys
  - Recommended model: `qwen/qwen-2.5-vl-7b-instruct`
- Telegram Bot Token

### 2. Install
```bash
npm install
```

### 3. Configure .env
Create `.env` file with:
```env
PORT=3000
HOSTNAME=0.0.0.0

# AI Provider (OpenRouter Only)
AI_PROVIDER=openrouter
OPENROUTER_API_KEYS=sk-or-v1-xxxxxxxxxxxxx
DAILY_QUOTA=200
AI_ENABLED=true

# Telegram
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
TELEGRAM_ADMIN_ID=your_admin_id

# Gmail
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password
GMAIL_SUBJECT_FILTER=Camera Motion Test
```

### 4. Run Locally
```bash
npx tsx server.ts
```

## ☁️ Deploy to Render (Free)
1. Push this folder to **GitHub**.
2. Go to [Render Dashboard](https://dashboard.render.com).
3. New **Web Service** -> Select Repo.
4. Render will auto-detect configuration from `render.yaml`.
5. Add Environment Variables in Render Dashboard.

**Tip:** Use [UptimeRobot](https://uptimerobot.com) to ping your Render URL every 5 minutes to keep it running 24/7 for free.

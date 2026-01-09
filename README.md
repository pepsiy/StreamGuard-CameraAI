# 📸 StreamGuard - AI Camera Monitor

System to monitor XVR Email Alerts, detect people/objects using AI, and send Telegram notifications.

## 🚀 Features
- **Real-time Monitoring:** IMAP IDLE (Push Notification) - 0s delay.
- **AI Analysis:** 🤗 HuggingFace Moondream2 (Free, Recommended) or OpenRouter (Legacy).
- **Smart Filter:** Ignores "Alarm Cleared" emails & filters unwanted objects.
- **Telegram Alerts:** Sends 16:9 resized snapshots with descriptions.
- **Web Dashboard:** View logs & configure filters at `http://localhost:3000`.

## 🛠️ Setup & Run

### 1. Prerequisites
- Node.js 18+
- Gmail Account (with App Password)
- **🤗 HuggingFace Token** (Free) - **Recommended**
  - Get yours at: https://huggingface.co/settings/tokens
  - OR OpenRouter API Key (Legacy)
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

# AI Provider (Recommended: HuggingFace)
AI_PROVIDER=huggingface
HUGGINGFACE_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AI_ENABLED=true

# Legacy: OpenRouter (Optional)
OPENROUTER_API_KEYS=sk-or-v1-key1,sk-or-v1-key2
DAILY_QUOTA=50

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

# 🛡️ StreamGuard AI

**Smart AI Security System for Existing Cameras (IMAP/Email Source)**

StreamGuard turns your standard surveillance cameras (that send email alerts) into a smart AI-powered security system. It listens to email snapshots, analyzes them using a custom **YOLOv8** model (hosted on Hugging Face Spaces or locally), and intelligently filters alerts (Person/Vehicle detection) before sending them to Telegram.

## 🚀 Features
- **Real-time Monitoring:** Uses IMAP IDLE for instant email detection (0s delay).
- **Smart AI Analysis:**
  - **Person Detection:** Filters out false alarms (leaves, shadows, animals).
  - **Vehicle Detection:** Configurable overlap (IOU) filtering for parked cars vs moving cars.
  - **Zone Editor:** Draw exclusion/inclusion zones directly on the dashboard.
- **Smart Filters:**
  - **Ignore Moving Persons:** Option to ignore transient people (e.g. delivery) if needed.
  - **Ignore Stationary:** Logic to ignore parked cars unless they move (IOU check).
- **Telegram Alerts:** Sends a visual snapshot + description to your phone instantly.
- **Privacy First:**
  - **Dashboard:** `http://localhost:3000` to view logs and configure settings locally.
  - **Security:** Your API Keys (if used) are censored in the UI.

---

## 🛠️ Setup & Run

### 1. Prerequisites
- **Node.js 18+**
- **Gmail Account:** Enable 2FA and create an **App Password**.
- **YOLO Service:**
  - **Option A (Cloud - Recommended):** Host on [Hugging Face Spaces](https://huggingface.co/new-space).
  - **Option B (Local):** Run the Python API locally (requires Python 3.9+).
- **Telegram Bot:** Create a bot via [@BotFather](https://t.me/BotFather) and get the Token.

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure .env
Create `.env` file in the root directory:
```env
PORT=3000
HOSTNAME=0.0.0.0

# AI Configuration
AI_ENABLED=true
AI_PROVIDER=huggingface
# URL to your YOLO Service (Hugging Face Space or Local)
# Example: https://your-space-name.hf.space
YOLO_API_URL=https://your-yolo-service.hf.space
YOLO_API_SECRET=your_secret_token

# Gmail Configuration (Source of Camera Snapshots)
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password
GMAIL_SUBJECT_FILTER=Camera Motion

# Telegram Configuration (Alerts)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
TELEGRAM_ADMIN_ID=your_admin_id
```

### 4. Run Locally
```bash
npx tsx server.ts
```
Access dashboard at: [http://localhost:3000](http://localhost:3000)

---

## ☁️ Deployment Guide

### A. Deploy Backend (Render.com)
1. Push this code to **GitHub**.
2. Go to **Render Dashboard** -> New **Web Service**.
3. Connect your Repo. Render will auto-detect config from `render.yaml`.
4. **Environment Variables:** Add the secrets from your `.env` file (Gmail, Telegram, YOLO URL) into the Render Environment settings.

### B. Deploy AI Service (Hugging Face Spaces)
1. Go to **Hugging Face** -> Create New Space (SDK: **Docker**).
2. Upload the contents of the `huggingface_space/` folder:
   - `Dockerfile`
   - `app.py`
   - `requirements.txt`
3. Set the `API_SECRET` in the Space's Settings -> Secrets.
4. Copy the **Space URL** (link) -> Update `YOLO_API_URL` in your Backend Config.

---

## 📂 Project Structure
- `src/`: Backend source code (Gmail polling, Telegram, AI logic).
- `public/`: Frontend Dashboard (HTML/Tailwind/Alpine.js).
- `huggingface_space/`: Python code for the YOLOv8 AI Microservice.
- `zones.json`: Stores user-defined monitoring zones.
- `smart_agent_config.json`: Stores AI filtering rules.

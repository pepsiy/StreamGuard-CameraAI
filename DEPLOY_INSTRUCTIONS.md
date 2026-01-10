# StreamGuard Deployment Guide

## 1. GitHub Setup
1. Create a new repository on GitHub (e.g., `StreamGuard`).
2. Run the following commands in this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <YOUR_GITHUB_REPO_URL>
   git push -u origin main
   ```

## 2. Render.com Deployment (Backend)
1. Go to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Render should auto-detect configuration from `render.yaml`. If not:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npx tsx server.ts`
5. **Environment Variables**:
   Add the following secrets in the "Environment" tab:
   - `GMAIL_USER`: Your Gmail address
   - `GMAIL_APP_PASSWORD`: Your Gmail App Password
   - `TELEGRAM_BOT_TOKEN`: Your Telegram Bot Token
   - `TELEGRAM_ADMIN_ID`: Your Telegram User ID
   - `AI_ENABLED`: true
   - `AI_PROVIDER`: huggingface (or `yolo_hf`)

## 3. Hugging Face Space (YOLO Service)
1. Go to [Hugging Face](https://huggingface.co/new-space).
2. Create a new Space (Select **Docker** as SDK).
3. Upload the contents of `huggingface_space/` to the Space.
   - `Dockerfile`
   - `app.py`
   - `requirements.txt`
4. Copy the Space URL (e.g., `https://username-space-name.hf.space`) and update your Render Environment Variable:
   - `YOLO_API_URL`: `https://username-space-name.hf.space`

---
**Note:** `node_modules` is excluded. It will be re-installed automatically by Render.

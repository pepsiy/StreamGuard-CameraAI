import dotenv from 'dotenv';
// Load env vars immediately
dotenv.config();
console.log('[Startup] AI_ENABLED =', process.env.AI_ENABLED);
console.log('[Startup] Env Loaded');

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { GmailIdleService, EmailData } from './src/gmail_polling';
import { openRouterService } from './src/ai/openrouter';
import { getFilterConfig, updateFilterConfig, isLowConfidence } from './src/filter';
import { telegramService } from './src/telegram_service'; // New Service
import { keyManager } from './src/ai/key_manager'; // New Manager


/**
 * Snapshot Server (Node.js + Express)
 * Deployed on Render
 */

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from /public

import sharp from 'sharp'; // For resizing log images

// Activity Log Storage
interface LogItem {
    timestamp: string;
    message: string;
    type: 'info' | 'alert' | 'success' | 'error' | 'processing';
    image?: string; // base64 data URI
}

const activityLogs: LogItem[] = [];
const MAX_LOGS = 50; // Reduce count to save memory with images

async function addLog(message: string, type: LogItem['type'] = 'info', imageBuffer?: Buffer) {
    // Check timezone for Vietnam (UTC+7)
    const timestamp = new Date().toLocaleTimeString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh'
    });

    let image: string | undefined;

    if (imageBuffer) {
        try {
            // Create a small thumbnail for logs
            const resized = await sharp(imageBuffer)
                .resize(320) // Width 300px
                .jpeg({ quality: 70 })
                .toBuffer();
            image = `data:image/jpeg;base64,${resized.toString('base64')}`;
        } catch (e) {
            console.error('Failed to resize log image:', e);
        }
    }

    const log: LogItem = { timestamp, message, type, image };

    activityLogs.unshift(log);
    if (activityLogs.length > MAX_LOGS) {
        activityLogs.pop();
    }
    console.log(`[${timestamp}] ${message}`);
}

// ------ API Routes ------

// API: Get activity logs
app.get('/api/logs', (req, res) => {
    res.json(activityLogs);
});

// API: Clear activity logs
app.post('/api/logs/clear', (req, res) => {
    activityLogs.length = 0;
    res.json({ success: true });
});

// API: Get filter config
app.get('/api/filter', (req, res) => {
    res.json(getFilterConfig());
});

// API: Update filter config
app.post('/api/filter', (req, res) => {
    try {
        const updated = updateFilterConfig(req.body);
        addLog(`⚙️ Smart Rules updated`);
        res.json(updated);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// API: Test Telegram
app.post('/api/test-telegram', async (req, res) => {
    try {
        // Valid minimal JPEG (16x16 solid blue square)
        const testImage = Buffer.from(
            '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDx+iiigD//2Q==',
            'base64'
        );
        await telegramService.sendAlert('Test Camera', 'Test message from settings page ✅', testImage);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// API: Test Admin Alert
app.post('/api/test-admin', async (req, res) => {
    try {
        await telegramService.sendAdminAlert('This is a test Admin Alert from Dashboard.');
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// API: Debug Token (Temporary)
app.get('/api/debug-token', (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    res.json({
        status: 'Debug Info',
        length: token.length,
        first4: token.substring(0, 4),
        last4: token.substring(token.length - 4),
        lastCharCode: token.length > 0 ? token.charCodeAt(token.length - 1) : null,
        hasWhitespace: /\s/.test(token),
        raw_last: token.length > 0 ? `[${token.charAt(token.length - 1)}]` : '[]'
    });
});

// API: Get Settings (Censored)
app.get('/api/settings', (req, res) => {
    res.json({
        openRouterKeys: process.env.OPENROUTER_API_KEYS ? '******' : '',
        huggingfaceToken: process.env.HUGGINGFACE_TOKEN ? '******' : '',
        aiProvider: process.env.AI_PROVIDER || 'huggingface',
        telegramToken: process.env.TELEGRAM_BOT_TOKEN ? '******' : '',
        telegramChatId: process.env.TELEGRAM_CHAT_ID,
        telegramAdminId: process.env.TELEGRAM_ADMIN_ID,
        dailyQuota: process.env.DAILY_QUOTA || "50",
        aiEnabled: process.env.AI_ENABLED !== 'false' // Boolean
    });
});

// API: Save Settings
app.post('/api/settings', (req, res) => {
    const { openRouterKeys, huggingfaceToken, aiProvider, telegramToken, telegramChatId, telegramAdminId, dailyQuota, aiEnabled } = req.body;

    try {
        let envLines: string[] = [];
        if (fs.existsSync('.env')) {
            envLines = fs.readFileSync('.env', 'utf-8').split('\n');
        }

        // Build updates, skipping censored placeholders
        const updates: Record<string, string> = {};

        // Only update secrets if NOT censored placeholder
        if (openRouterKeys && openRouterKeys !== '******') {
            updates['OPENROUTER_API_KEYS'] = openRouterKeys;
        }
        if (huggingfaceToken && huggingfaceToken !== '******') {
            updates['HUGGINGFACE_TOKEN'] = huggingfaceToken;
        }
        if (telegramToken && telegramToken !== '******') {
            updates['TELEGRAM_BOT_TOKEN'] = telegramToken;
        }

        // Always update non-secret fields
        updates['AI_PROVIDER'] = aiProvider || 'huggingface';
        updates['TELEGRAM_CHAT_ID'] = telegramChatId;
        updates['TELEGRAM_ADMIN_ID'] = telegramAdminId;
        updates['DAILY_QUOTA'] = dailyQuota;
        updates['AI_ENABLED'] = String(aiEnabled);

        const newLines: string[] = [];
        const processedKeys = new Set<string>();

        // Process existing lines
        for (const line of envLines) {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                if (updates.hasOwnProperty(key)) {
                    // Replace usage
                    const val = updates[key] !== undefined ? String(updates[key]) : '';
                    newLines.push(`${key}=${val}`);
                    processedKeys.add(key);
                } else {
                    // Keep existing
                    newLines.push(line);
                }
            } else {
                // Keep comments/empty lines
                newLines.push(line);
            }
        }

        // Add new keys
        for (const [key, val] of Object.entries(updates)) {
            if (!processedKeys.has(key) && val !== undefined) {
                if (newLines.length > 0 && newLines[newLines.length - 1] !== '') newLines.push('');
                newLines.push(`${key}=${String(val)}`);
            }
        }

        const newContent = newLines.join('\n');
        fs.writeFileSync('.env', newContent);

        console.log('✅ Settings saved safely to .env');

        // Force reload env
        const newEnv = dotenv.parse(newContent);
        for (const k in newEnv) {
            process.env[k] = newEnv[k];
        }

        telegramService.reloadConfig();
        keyManager.reload();
        // OpenRouterService uses KeyManager which is already reloaded
        console.log('[Settings] Configurations reloaded');

        res.json({ success: true, message: 'Settings saved and services reloaded' });
    } catch (e: any) {
        console.error('Save error:', e);
        res.status(500).json({ error: e.message });
    }
});

// API: Get Key Usage Stats
app.get('/api/key-usage', (req, res) => {
    res.json(keyManager.getStats());
});

// API: Reset Key Usage (Manual)
app.post('/api/key-usage/reset', (req, res) => {
    keyManager.resetUsage();
    res.json({ success: true });
});

// ------ Helper Functions ------

function extractCameraNameFromSubject(subject: string): string {
    if (subject.includes('Camera Motion Test')) return 'Camera 01';
    const match = subject.match(/Camera\s*(\d+|[A-Za-z]+)/i);
    return match ? `Camera ${match[1]}` : 'Unknown Camera';
}

// ------ Main ------

// Start Gmail Polling
const gmailUser = process.env.GMAIL_USER;
const gmailPassword = process.env.GMAIL_APP_PASSWORD;
const subjectFilter = process.env.GMAIL_SUBJECT_FILTER || 'Camera Motion Test';

if (gmailUser && gmailPassword) {
    if (gmailPassword.includes('your_app_password')) {
        console.warn('⚠️ GMAIL_APP_PASSWORD not set in .env');
    } else {
        console.log(`\n📧 Starting Gmail Polling Service...`);

        const gmailService = new GmailIdleService({
            user: gmailUser,
            password: gmailPassword,
            subjectFilter: subjectFilter
        });

        // Handle incoming emails
        gmailService.start(async (emailData: EmailData) => {
            const cameraName = extractCameraNameFromSubject(emailData.subject) || 'Gmail Camera';

            console.log(`\n[Gmail] 📸 Processing snapshot from email`);
            addLog(`📧 Email from ${emailData.from}`, 'info');
            addLog(`📸 Processing: ${cameraName}`, 'processing', emailData.imageBuffer);

            try {
                // Get Smart Rules
                const filter = getFilterConfig();

                if (!filter.enabled) {
                    addLog(`⚠️ System disabled`);
                    return;
                }

                // Check AI Toggle (Direct Forward Mode)
                console.log(`[Debug] AI_ENABLED env: '${process.env.AI_ENABLED}'`);
                const aiEnabled = process.env.AI_ENABLED !== 'false'; // Default true

                if (!aiEnabled) {
                    addLog(`⏩ Direct Forward: ${cameraName}`);
                    // Use email text/subject as description
                    const directDesc = emailData.text || emailData.subject || "Motion Detected (Direct Mode)";

                    addLog(`📱 Alert sent (Direct)`, 'success', emailData.imageBuffer);
                    await telegramService.sendAlert(cameraName, directDesc, emailData.imageBuffer);
                    return;
                }

                // AI Analysis (OpenRouter Only)
                console.log(`[AI] Using provider: openrouter (Qwen 2.5 CL)`);

                const result = await openRouterService.analyzeSnapshot(
                    emailData.imageBuffer,
                    cameraName,
                    filter.securityRules
                );

                if (!result) {
                    addLog(`⚠️ AI analysis failed`, 'error');
                    return;
                }

                if (result.shouldAlert) {
                    console.log(`[Gmail] 🚨 SMART ALERT! confidence: ${result.confidence}%`);

                    if (isLowConfidence(result.confidence)) {
                        console.log(`[Gmail] 🚫 Blocked: Low confidence (${result.confidence}%)`);
                        addLog(`🚫 Low Conf (${result.confidence}%): ${result.description}`, 'info', emailData.imageBuffer);
                    } else {
                        addLog(`🚨 ALERT: ${cameraName} - ${result.description}`, 'alert', emailData.imageBuffer);
                        // Use Telegram Service
                        await telegramService.sendAlert(cameraName, result.description, emailData.imageBuffer);
                        addLog(`📱 Alert sent`, 'success');
                    }
                } else {
                    console.log(`[Gmail] ✅ Normal: ${result.description}`);
                    addLog(`✅ Normal (${result.confidence}%): ${result.description}`, 'success', emailData.imageBuffer);
                }

            } catch (error: any) {
                console.error(`[Gmail] Processing error:`, error);
                addLog(`❌ Error: ${error.message}`, 'error');
            }
        });
    }
} else {
    console.log('⚠️ Gmail config missing - Email monitoring disabled');
}

// Start Server
app.listen(PORT, () => {
    const host = process.env.HOSTNAME || 'localhost';
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;

    console.log(`🚀 Server running at http://${displayHost}:${PORT}`);
    console.log(`📝 Dashboard available at http://${displayHost}:${PORT}/index.html`);

    // Force reload config to ensure keys are loaded
    keyManager.reload();
    telegramService.reloadConfig();
});

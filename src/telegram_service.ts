import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

export class TelegramService {
    private botToken: string = "";
    private recipientChatIds: string[] = [];
    private adminChatId: string = "";

    constructor() {
        this.loadConfig();
    }

    private loadConfig() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN || "";
        this.recipientChatIds = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim()).filter(id => id);
        this.adminChatId = process.env.TELEGRAM_ADMIN_ID || "";

        console.log(`[Telegram] Loaded ${this.recipientChatIds.length} recipients. Admin ID: ${this.adminChatId ? 'Configured' : 'Missing'}`);
    }

    public reloadConfig() {
        this.loadConfig();
    }

    /**
     * Send alert to all subscribers
     */
    public async sendAlert(cameraName: string, description: string, imageBuffer?: Buffer) {
        // Simple Markdown escaping for key characters
        const cleanDesc = description.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
        const caption = `🚨 **ALERT: ${cameraName}**\n${cleanDesc}`;

        if (!this.botToken || this.recipientChatIds.length === 0) return;

        try {
            // Resize image to 16:9
            let finalBuffer = imageBuffer;
            if (imageBuffer) {
                finalBuffer = await sharp(imageBuffer)
                    .resize(1920, 1080, { fit: 'cover', position: 'center' })
                    .jpeg({ quality: 85 })
                    .toBuffer();
            }

            for (const chatId of this.recipientChatIds) {
                if (finalBuffer) {
                    await this.sendPhoto(chatId, caption, finalBuffer);
                }
            }
        } catch (e) {
            console.error("[Telegram] Error sending alert:", e);
        }
    }

    /**
     * Send technical report/alert to Admin only
     */
    public async sendAdminAlert(message: string) {
        if (!this.botToken || !this.adminChatId) return;
        await this.sendMessage(this.adminChatId, `⚠️ **System Alert**\n${message}`);
    }

    private async sendPhoto(chatId: string, caption: string, image: Buffer) {
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', caption);
        formData.append('parse_mode', 'Markdown');

        const blob = new Blob([image as unknown as BlobPart], { type: 'image/jpeg' });
        formData.append('photo', blob, 'alert.jpg');

        try {
            const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
            if (!res.ok) console.error(`[Telegram] Failed to send photo to ${chatId}: ${await res.text()}`);
        } catch (e) {
            console.error(`[Telegram] Network error sending photo to ${chatId}`, e);
        }
    }

    private async sendMessage(chatId: string, text: string) {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: text,
                        parse_mode: 'Markdown'
                    })
                });
                if (!res.ok) {
                    console.error(`[Telegram] Failed to send message to ${chatId}: ${await res.text()}`);
                    return; // Don't retry logic errors (4xx), only network (catch block)
                }
                return; // Success
            } catch (e) {
                attempts++;
                console.error(`[Telegram] Network error (Attempt ${attempts}/${maxAttempts}):`, e);
                if (attempts === maxAttempts) {
                    console.error(`[Telegram] Giving up on ${chatId} after ${maxAttempts} attempts.`);
                } else {
                    await new Promise(r => setTimeout(r, 2000)); // Wait 2s
                }
            }
        }
    }
}

export const telegramService = new TelegramService();

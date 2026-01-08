import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { telegramService } from '../telegram_service';

interface KeyUsage {
    date: string;
    counts: Record<string, number>; // key_hash -> usage_count
    exhausted: Record<string, boolean>; // key_hash -> is_exhausted
}

export class KeyManager {
    private apiKeys: string[] = [];
    private currentIndex = 0;
    private usageFile = path.join(process.cwd(), 'data', 'api_usage.json');
    private dailyQuota = 50; // Default quota
    private usageData: KeyUsage = { date: '', counts: {}, exhausted: {} };

    constructor() {
        this.loadSettings();
        this.loadUsage();
    }

    public reload() {
        this.loadSettings();
    }

    private loadSettings() {
        try {
            const settingsPath = path.join(process.cwd(), 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                this.apiKeys = settings.openRouterKeys || [];
                this.dailyQuota = parseInt(settings.dailyQuota) || 50;
            }
        } catch (e) {
            console.warn('[KeyManager] Failed to load settings.json');
        }

        // Fallback to env
        if (this.apiKeys.length === 0) {
            this.apiKeys = (process.env.OPENROUTER_API_KEYS || "")
                .split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
        }

        // Ensure "data" dir exists
        const dataDir = path.dirname(this.usageFile);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    }

    private loadUsage() {
        const today = new Date().toISOString().split('T')[0];

        try {
            if (fs.existsSync(this.usageFile)) {
                this.usageData = JSON.parse(fs.readFileSync(this.usageFile, 'utf-8'));
            }
        } catch (e) {
            console.warn('[KeyManager] Failed to load usage file, resetting.');
        }

        // Reset if new day
        if (this.usageData.date !== today) {
            console.log(`[KeyManager] New day (${today}) detected. Resetting quotas.`);
            this.usageData = { date: today, counts: {}, exhausted: {} };
            this.saveUsage();
            // Optional: Notify Admin specific report "New Day Started"
        }
    }

    private saveUsage() {
        try {
            fs.writeFileSync(this.usageFile, JSON.stringify(this.usageData, null, 2));
        } catch (e) {
            console.error('[KeyManager] Failed to save usage:', e);
        }
    }

    private hashKey(key: string): string {
        // Simple hash to identify key without storing it
        return crypto.createHash('md5').update(key).digest('hex');
    }

    /**
     * Get next available key (Round-Robin)
     */
    private lastUsedMap: Record<string, number> = {}; // key_hash -> timestamp

    /**
     * Get next available key (Round-Robin with 60s Cooldown)
     */
    public getNextKey(): string | null {
        if (this.apiKeys.length === 0) return null;

        const startIndex = this.currentIndex;
        let loops = 0;
        const now = Date.now();
        const COOLDOWN_MS = 60000; // 60 seconds

        // Try to find a usable key
        while (loops < this.apiKeys.length) {
            const key = this.apiKeys[this.currentIndex];
            const hash = this.hashKey(key);

            // Advance index for NEXT time (Round Robin force)
            this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;

            if (!this.usageData.exhausted[hash]) {
                const count = this.usageData.counts[hash] || 0;
                const lastUsed = this.lastUsedMap[hash] || 0;

                // Check Quota AND Cooldown
                if (count < this.dailyQuota) {
                    if (now - lastUsed >= COOLDOWN_MS) {
                        // Mark as used NOW (leased)
                        this.lastUsedMap[hash] = now;
                        return key; // Found valid key
                    } else {
                        // console.debug(`[KeyManager] Key ...${key.slice(-4)} in cooldown (${Math.round((COOLDOWN_MS - (now - lastUsed))/1000)}s left)`);
                    }
                } else {
                    // Mark exhausted if not already
                    this.markExhausted(key, hash);
                }
            }

            loops++;
        }

        console.warn('[KeyManager] All keys exhausted or cooling down!');
        return null; // All keys exhausted or cooling down
    }

    /**
     * Increment usage for a key
     */
    public incrementUsage(key: string) {
        const hash = this.hashKey(key);
        this.usageData.counts[hash] = (this.usageData.counts[hash] || 0) + 1;

        // Check exhaustion immediately
        if (this.usageData.counts[hash] >= this.dailyQuota) {
            this.markExhausted(key, hash);
        }

        this.saveUsage();
    }

    /**
     * Mark key as exhausted and notify Admin
     */
    public markExhausted(key: string, hash?: string) {
        if (!hash) hash = this.hashKey(key);

        if (this.usageData.exhausted[hash]) return; // Already marked

        this.usageData.exhausted[hash] = true;
        this.saveUsage();

        // Calculate stats
        const activeKeys = this.apiKeys.filter(k => !this.usageData.exhausted[this.hashKey(k)]).length;
        const totalKeys = this.apiKeys.length;

        const msg = `⚠️ **API Key Exhausted**\n` +
            `Key: ...${key.slice(-4)}\n` +
            `Usage: ${this.dailyQuota}/${this.dailyQuota}\n` +
            `✅ Active: **${activeKeys}/${totalKeys}**`;

        console.log(`[KeyManager] ${msg.replace(/\n/g, ' ')}`);
        telegramService.sendAdminAlert(msg);
    }

    /**
     * Force disable a key (e.g. 429 error)
     */
    public disableKey(key: string, reason: string) {
        const hash = this.hashKey(key);

        if (this.usageData.exhausted[hash]) return; // Already disabled/exhausted

        // Force exhausted flag
        this.markExhausted(key, hash); // This will send the standard "Exhausted" alert

        // Optionally send a specific Error alert ONLY if it wasn't just quota
        telegramService.sendAdminAlert(`🚫 **Key Disabled (Error)**\nKey: ...${key.slice(-4)}\nReason: ${reason}`);
    }

    public resetUsage() {
        this.usageData = {
            date: new Date().toISOString().split('T')[0],
            counts: {},
            exhausted: {}
        };
        this.saveUsage();
        console.log('[KeyManager] 🔄 Manual usage reset performed.');
    }

    public getStats() {
        return this.apiKeys.map(k => {
            const h = this.hashKey(k);
            return {
                key: `...${k.slice(-4)}`,
                usage: this.usageData.counts[h] || 0,
                quota: this.dailyQuota,
                status: this.usageData.exhausted[h] ? 'Exhausted' : 'Active'
            };
        });
    }
}

export const keyManager = new KeyManager();

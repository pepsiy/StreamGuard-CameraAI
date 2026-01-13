import Imap from 'imap';
import { simpleParser } from 'mailparser';

/**
 * Gmail IMAP IDLE Service (Real-time Push)
 * Extracts images from both attachments and HTML body
 */

export class GmailIdleService {
    private imap: any;
    private isConnected = false;
    private onEmailCallback?: (emailData: EmailData) => Promise<void>;
    private pollInterval?: NodeJS.Timeout; // Fallback polling
    private idleRefreshInterval?: NodeJS.Timeout; // IDLE refresh timer
    private reconnectTimeout?: NodeJS.Timeout;

    constructor(
        private config: {
            user: string;
            password: string;
            subjectFilter: string;
        }
    ) { }

    /**
     * Start Gmail monitoring (Real-time IDLE)
     */
    start(onEmailReceived: (emailData: EmailData) => Promise<void>) {
        console.log(`[Gmail] Starting email monitoring...`);
        console.log(`[Gmail] Account: ${this.config.user}`);
        console.log(`[Gmail] Subject filter: "${this.config.subjectFilter}"`);
        console.log(`[Gmail] Mode: IMAP IDLE (Push Notification) ⚡`);

        this.onEmailCallback = onEmailReceived;
        this.connect();
    }

    /**
     * Stop Gmail monitoring
     */
    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        if (this.idleRefreshInterval) {
            clearInterval(this.idleRefreshInterval);
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        if (this.imap) {
            this.imap.end();
        }
        console.log('[Gmail] Stopped');
    }

    /**
     * Connect to Gmail via IMAP
     */
    private connect() {
        // Clear any pending reconnect
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        this.imap = new Imap({
            user: this.config.user,
            password: this.config.password,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false }
        });

        this.imap.once('ready', () => {
            console.log('[Gmail] ✅ Connected to Gmail');
            this.openInbox();
        });

        this.imap.once('error', (err: Error) => {
            console.error('[Gmail] Connection error:', err);
            this.isConnected = false;
            this.scheduleReconnect();
        });

        this.imap.once('end', () => {
            console.log('[Gmail] ⚠️ Connection ended unexpectedly');
            this.isConnected = false;
            this.scheduleReconnect();
        });

        this.imap.connect();
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect() {
        if (this.reconnectTimeout) return; // Already scheduled

        console.log('[Gmail] 🔄 Reconnecting in 10 seconds...');
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = undefined;
            console.log('[Gmail] Attempting reconnection...');
            this.connect();
        }, 10000);
    }

    /**
     * Open inbox and start monitoring
     */
    private openInbox() {
        this.imap.openBox('INBOX', false, (err: Error, box: any) => {
            if (err) {
                console.error('[Gmail] Error opening inbox:', err);
                return;
            }

            console.log('[Gmail] 📬 Inbox opened');
            console.log('[Gmail] ⚡ IDLE Mode Activated: Waiting for real-time push...');
            this.isConnected = true;

            // Listen for new emails (Real-time Push)
            this.imap.on('mail', (numNewMsgs: number) => {
                console.log(`\n[Gmail] 🔔 New email notification! (${numNewMsgs} new)`);
                this.fetchNewEmails();
            });

            // Fallback Polling (Every 60s) to catch missed/unread emails
            if (this.pollInterval) clearInterval(this.pollInterval);
            this.pollInterval = setInterval(() => {
                console.log('[Gmail] 🔄 Polling check...');
                this.fetchNewEmails();
            }, 60000);

            // IDLE Refresh: Gmail disconnects IDLE after ~29 minutes
            // Reconnect every 20 minutes to prevent timeout
            if (this.idleRefreshInterval) clearInterval(this.idleRefreshInterval);
            this.idleRefreshInterval = setInterval(() => {
                console.log('[Gmail] 🔄 Refreshing IDLE connection (preventing timeout)...');
                this.imap.end(); // Will trigger reconnect via 'end' event
            }, 20 * 60 * 1000); // 20 minutes
        });
    }

    /**
     * Fetch new emails
     */
    private async fetchNewEmails() {
        if (!this.isConnected) return;

        // Search for UNSEEN emails matching subject filter
        // NOTE: Gmail IMAP SUBJECT search is case-insensitive and supports partial matching
        const searchCriteria = [
            'UNSEEN',
            ['SUBJECT', this.config.subjectFilter]
        ];

        console.log(`[Gmail] 🔍 Searching for UNSEEN emails with subject containing: "${this.config.subjectFilter}"`);

        this.imap.search(searchCriteria, (err: Error, results: number[]) => {
            if (err) {
                console.error('[Gmail] Search error:', err);
                return;
            }

            if (!results || results.length === 0) {
                // No new emails - silent (this is normal during polling checks)
                return;
            }

            console.log(`\n[Gmail] 🔔 Found ${results.length} new email(s)!`);

            // Fetch emails
            const fetch = this.imap.fetch(results, { bodies: '', markSeen: true });

            fetch.on('message', (msg: any, seqno: number) => {
                console.log(`[Gmail] Processing email #${seqno}`);

                msg.on('body', (stream: any, info: any) => {
                    simpleParser(stream, async (err: Error | null, parsed: any) => {
                        if (err) {
                            console.error('[Gmail] Parse error:', err);
                            return;
                        }

                        // Extract email data
                        const emailData = this.extractEmailData(parsed);

                        if (emailData && this.onEmailCallback) {
                            try {
                                await this.onEmailCallback(emailData);
                            } catch (error) {
                                console.error('[Gmail] Processing error:', error);
                            }
                        }
                    });
                });
            });

            fetch.once('error', (err: Error) => {
                console.error('[Gmail] Fetch error:', err);
            });

            fetch.once('end', () => {
                console.log('[Gmail] ✅ Finished processing\n');
            });
        });
    }

    /**
     * Extract email data and attachments (including HTML embedded images)
     */
    private extractEmailData(parsed: any): EmailData | null {
        const from = parsed.from?.text || 'unknown';
        const subject = parsed.subject || '';
        const text = parsed.text || '';

        console.log(`[Gmail] From: ${from}`);
        console.log(`[Gmail] Subject: ${subject}`);

        // OPTIMIZATION: Ignore "Alarm Cleared" / "Xóa bỏ" emails
        // XVR sends 2 emails: Start (Alarm) and Stop (Cleared). We only want Start.
        const ignoreKeywords = ['xóa bỏ', 'cleared', 'ended', 'recover', 'stopped'];
        if (ignoreKeywords.some(k => subject.toLowerCase().includes(k) || text.toLowerCase().includes(k))) {
            console.log('[Gmail] 🚫 Ignoring "Alarm Cleared/Ended" email');
            return null;
        }

        // Try attachments first
        const attachments = parsed.attachments || [];

        if (attachments && attachments.length > 0) {
            console.log(`[Gmail] Found ${attachments.length} attachment(s)`);

            // Extract ALL valid images
            const imageAtts = attachments.filter((att: any) =>
                att.contentType?.startsWith('image/')
            );

            if (imageAtts.length > 0) {
                console.log(`[Gmail] ✅ Got ${imageAtts.length} image(s) from attachments`);

                // Sort by filename usually ensures correct chronological order for XVR (1.jpg, 2.jpg...)
                imageAtts.sort((a: any, b: any) => (a.filename || '').localeCompare(b.filename || ''));

                const buffers = imageAtts.map((att: any) => att.content);

                return {
                    from,
                    subject,
                    text,
                    imageBuffer: buffers[0], // Keep first for backward compat
                    imageFilename: imageAtts[0].filename || 'snapshot.jpg',
                    images: buffers
                };
            }
        }

        // No attachments or no image - try HTML
        if (parsed.html) {
            console.log('[Gmail] Trying to extract from HTML...');
            const htmlImage = this.extractFromHTML(parsed.html, attachments);
            if (htmlImage) {
                return {
                    from,
                    subject,
                    text: text || 'Motion detected',
                    imageBuffer: htmlImage.buffer,
                    imageFilename: htmlImage.filename
                };
            }
        }

        console.log('[Gmail] ⚠️ No image found in email');
        return null;
    }

    /**
     * Extract image from HTML (base64 or CID)
     */
    private extractFromHTML(html: string, attachments: any[]): { buffer: Buffer; filename: string } | null {
        // Try base64 first
        const base64Match = html.match(/<img[^>]+src="data:image\/([^;]+);base64,([^"]+)"/i);
        if (base64Match) {
            const type = base64Match[1];
            const data = base64Match[2];
            const buffer = Buffer.from(data, 'base64');
            console.log(`[Gmail] ✅ Extracted base64 image (${type}, ${buffer.length} bytes)`);
            return {
                buffer,
                filename: `snapshot.${type}`
            };
        }

        // Try CID
        const cidMatch = html.match(/<img[^>]+src="cid:([^"]+)"/i);
        if (cidMatch && attachments.length > 0) {
            const cid = cidMatch[1];
            const att = attachments.find((a: any) =>
                a.contentId === `<${cid}>` || a.contentId === cid
            );
            if (att && att.content) {
                console.log(`[Gmail] ✅ Extracted CID image: ${cid}`);
                return {
                    buffer: att.content,
                    filename: att.filename || 'snapshot.jpg'
                };
            }
        }

        console.log('[Gmail] No images in HTML');
        return null;
    }
}

export interface EmailData {
    from: string;
    subject: string;
    text: string;
    imageBuffer: Buffer; // Primary image (first one)
    imageFilename: string;
    images?: Buffer[]; // All images (for multi-frame analysis)
}



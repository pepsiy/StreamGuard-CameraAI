

export interface YoloAnalysisResult {
    shouldAlert: boolean;
    description: string;
    confidence: number;
    detectedObjects: string[];
}

class YoloService {
    private apiUrl: string = '';
    private apiSecret: string = '';

    constructor() {
        // Lazy load env vars to ensure dotenv is initialized
    }

    /**
     * Analyze frames using Hugging Face Space YOLO API
     */
    public async analyzeSnapshot(
        imageInput: Buffer | Buffer[],
        cameraName: string,
        zonePoints?: number[][],
        settings?: {
            personIouThreshold?: number;
            vehicleIouThreshold?: number;
            ignoreMovingPersons?: boolean;
        }
    ): Promise<YoloAnalysisResult | null> {
        const MAX_RETRIES = 3;
        const TIMEOUT_MS = 120000; // 120s

        this.apiUrl = process.env.YOLO_API_URL || '';
        this.apiSecret = process.env.YOLO_API_SECRET || '';

        if (!this.apiUrl) {
            console.error('[YOLO] Service not configured (missing YOLO_API_URL)');
            return null;
        }

        const images = Array.isArray(imageInput) ? imageInput : [imageInput];

        // Optimize: Resize images to max 1024px width to reduce payload & speed up AI
        // YOLOv8 trains on 640x640, so sending 4K images is wasteful
        const optimizedImages: Buffer[] = [];
        try {
            const sharp = require('sharp');
            for (const img of images) {
                const resized = await sharp(img)
                    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toBuffer();
                optimizedImages.push(resized);
            }
        } catch (e) {
            console.warn('[YOLO] Failed to optimize images, using originals:', e);
            optimizedImages.push(...images);
        }

        const base64Images = optimizedImages.map(buf => buf.toString('base64'));

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (attempt > 1) console.log(`[YOLO] Retry attempt ${attempt}/${MAX_RETRIES}...`);

                console.log(`[YOLO] Sending ${images.length} frames to ${this.apiUrl}...`);

                const response = await fetch(`${this.apiUrl}/detect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiSecret}`
                    },
                    body: JSON.stringify({
                        images: base64Images,
                        camera_name: cameraName,
                        zone_points: zonePoints || [],
                        // Map TS CamelCase to Python snake_case
                        person_iou_threshold: settings?.personIouThreshold ?? 0.6,
                        vehicle_iou_threshold: settings?.vehicleIouThreshold ?? 0.9,
                        ignore_moving_persons: settings?.ignoreMovingPersons ?? true
                    }),
                    signal: AbortSignal.timeout(TIMEOUT_MS)
                });

                if (!response.ok) {
                    const text = await response.text();
                    console.error(`[YOLO] API Error ${response.status}: ${text}`);
                    // If 503 (Loading) or 504 (Gateway Timeout), throw to trigger retry
                    if ([502, 503, 504].includes(response.status)) {
                        throw new Error(`Server temporarily unavailable (${response.status})`);
                    }
                    return null;
                }

                const result: any = await response.json();

                console.log(`[YOLO] Result: ${result.shouldAlert ? '🚨 ALERT' : '✅ Normal'} (${result.confidence}%) - ${result.description}`);

                return {
                    shouldAlert: result.shouldAlert,
                    description: result.description,
                    confidence: result.confidence,
                    detectedObjects: result.detectedObjects
                };

            } catch (error: any) {
                console.error(`[YOLO] Error (Attempt ${attempt}):`, error.message);
                if (attempt === MAX_RETRIES) {
                    console.error('[YOLO] All retry attempts failed.');
                    return null;
                }
                // Wait 2s before retry
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        return null;
    }
}

export const yoloService = new YoloService();

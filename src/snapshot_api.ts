import { openRouterService } from './ai/openrouter';
import Busboy from 'busboy';
import { Request, Response } from 'express';

/**
 * Helper to parse multipart requests using Busboy
 */
function parseMultipart(req: Request): Promise<{
    cameraId?: string;
    cameraName?: string;
    rules?: string;
    imageBuffer?: Buffer;
}> {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: req.headers });
        const result: any = {};
        const chunks: Buffer[] = [];
        let hasFile = false;

        busboy.on('file', (fieldname, file, info) => {
            if (fieldname === 'image') {
                hasFile = true;
                file.on('data', (data) => chunks.push(data));
                file.on('limit', () => reject(new Error('File size exceeded')));
            } else {
                file.resume(); // Skip other files
            }
        });

        busboy.on('field', (fieldname, val) => {
            result[fieldname] = val;
        });

        busboy.on('finish', () => {
            if (hasFile && chunks.length > 0) {
                result.imageBuffer = Buffer.concat(chunks);
            }
            resolve(result);
        });

        busboy.on('error', reject);

        req.pipe(busboy);
    });
}

/**
 * Main endpoint handler for snapshot analysis (Express version)
 */
export async function analyzeSnapshotEndpoint(req: Request, addLog?: (msg: string) => void): Promise<any> {
    const startTime = Date.now();

    try {
        console.log('[Snapshot API] 📸 Received snapshot request');

        // Parse multipart form
        const { cameraId, cameraName, rules, imageBuffer } = await parseMultipart(req);

        if (!imageBuffer) {
            return { error: 'Missing image data', status: 400 };
        }

        const camName = cameraName || cameraId || 'Unknown Camera';
        console.log(`[Snapshot API] Camera: ${camName}, Rules: ${rules || 'None'}`);
        if (addLog) addLog(`📸 API Request: ${camName}`);

        // Call OpenRouter for analysis
        const result = await openRouterService.analyzeSnapshot(
            imageBuffer,
            camName,
            rules
        );

        const elapsed = Date.now() - startTime;
        console.log(`[Snapshot API] ✅ Analysis complete in ${elapsed}ms`);

        if (!result) {
            console.warn('[Snapshot API] ⚠️ AI returned null');
            if (addLog) addLog(`⚠️ API Analysis failed (AI returned null)`);
            return {
                status: 503,
                data: {
                    shouldAlert: false,
                    description: 'AI analysis unavailable',
                    confidence: 0,
                    processingTimeMs: elapsed,
                    error: 'AI service returned null'
                }
            };
        }

        if (addLog) addLog(`✅ API Analysis: ${result.shouldAlert ? 'ALERT' : 'Normal'} (${result.confidence}%)`);

        // Return structured response
        return {
            status: 200,
            data: {
                shouldAlert: result.shouldAlert,
                description: result.description,
                confidence: result.confidence,
                detectedObjects: result.detectedObjects || [],
                processingTimeMs: elapsed
            }
        };

    } catch (error: any) {
        console.error('[Snapshot API] ❌ Error:', error);
        return {
            status: 500,
            error: error.message || 'Internal server error'
        };
    }
}

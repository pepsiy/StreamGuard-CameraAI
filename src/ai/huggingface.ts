import { HfInference } from '@huggingface/inference';

/**
 * HuggingFace Inference API Service
 * Uses Moondream2 vision-language model for image analysis
 * 100% Free, No region restrictions
 */
export class HuggingFaceService {
    private hf: HfInference | null = null;
    private model = 'vikhyatk/moondream2';

    constructor() {
        const token = process.env.HUGGINGFACE_TOKEN;
        if (token && token !== 'your_huggingface_token_here') {
            this.hf = new HfInference(token);
            console.log('[HuggingFace] Initialized with Moondream2 model');
        } else {
            console.warn('[HuggingFace] ⚠️ HUGGINGFACE_TOKEN not configured');
        }
    }

    /**
     * Analyze snapshot for security alert decision
     * Uses Visual Question Answering approach
     */
    public async analyzeSnapshot(
        imageBuffer: Buffer,
        cameraName: string,
        rules?: string
    ): Promise<{
        shouldAlert: boolean;
        description: string;
        confidence: number;
        detectedObjects?: string[];
    } | null> {
        if (!this.hf) {
            console.error('[HuggingFace] Service not initialized - missing token');
            return null;
        }

        try {
            console.log(`[HuggingFace] Analyzing snapshot for: ${cameraName}`);

            // Convert buffer to blob (fix type compatibility)
            const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });

            // Structured prompt for security analysis
            const question = `You are a security AI analyzing a camera image from "${cameraName}".

Security Rules: "${rules || "Detect any unusual activity"}"

Analyze this image and respond ONLY with valid JSON in this exact format:
{
  "shouldAlert": true or false,
  "description": "brief description in Vietnamese explaining what you see and why alert/no alert",
  "confidence": number between 0-100,
  "detectedObjects": ["person", "vehicle", "animal", etc.]
}

IMPORTANT:
- shouldAlert: true if you see people, vehicles, or suspicious activity matching the security rules
- shouldAlert: false for normal scenes, trees, shadows, rain, or familiar settings
- confidence: 70-100 if certain, 40-69 if uncertain, 0-39 if very uncertain
- Be specific about WHY you're alerting or not

Respond with ONLY the JSON object, no other text.`;

            console.log('[HuggingFace] Sending request to Moondream2...');

            // Use Visual Question Answering
            const response = await this.hf.visualQuestionAnswering({
                model: this.model,
                inputs: {
                    question: question,
                    image: blob
                }
            });

            console.log('[HuggingFace] Raw response:', response);

            // Parse response
            const result = this.parseResponse(response, cameraName);

            if (result) {
                console.log(`[HuggingFace] Result: ${result.shouldAlert ? '🚨 ALERT' : '✅ Normal'} (${result.confidence}%)`);
            }

            return result;

        } catch (error: any) {
            console.error('[HuggingFace] Analysis error:', error.message);

            // Check for specific errors
            if (error.message?.includes('rate limit')) {
                console.error('[HuggingFace] Rate limit exceeded - please wait');
            } else if (error.message?.includes('unauthorized')) {
                console.error('[HuggingFace] Invalid token');
            }

            return null;
        }
    }

    /**
     * Parse API response into structured format
     */
    private parseResponse(response: any, cameraName: string): {
        shouldAlert: boolean;
        description: string;
        confidence: number;
        detectedObjects?: string[];
    } | null {
        try {
            // Response might be a string or object
            let textResponse = typeof response === 'string' ? response : response.answer || JSON.stringify(response);

            console.log('[HuggingFace] Parsing response:', textResponse.slice(0, 200));

            // Try to extract JSON from response
            let jsonStr = textResponse.trim();

            // Remove markdown code blocks if present
            jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');

            // Find JSON object
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);

                return {
                    shouldAlert: parsed.shouldAlert === true,
                    description: parsed.description || textResponse,
                    confidence: parsed.confidence || 50,
                    detectedObjects: parsed.detectedObjects || []
                };
            } else {
                // Fallback: Use heuristic analysis on text response
                console.warn('[HuggingFace] No JSON found, using fallback heuristic');

                const lowerResp = textResponse.toLowerCase();

                // Look for alert keywords
                const alertKeywords = ['person', 'people', 'vehicle', 'car', 'truck', 'suspicious', 'intruder', 'alert'];
                const normalKeywords = ['empty', 'normal', 'clear', 'nothing', 'tree', 'shadow', 'rain'];

                const hasAlert = alertKeywords.some(k => lowerResp.includes(k));
                const hasNormal = normalKeywords.some(k => lowerResp.includes(k));

                return {
                    shouldAlert: hasAlert && !hasNormal,
                    description: textResponse,
                    confidence: hasAlert ? 60 : 40,
                    detectedObjects: []
                };
            }

        } catch (parseError) {
            console.error('[HuggingFace] Parse error:', parseError);

            // Safe fallback - don't alert on parse errors
            return {
                shouldAlert: false,
                description: typeof response === 'string' ? response : 'Analysis completed but response unclear',
                confidence: 0,
                detectedObjects: []
            };
        }
    }

    /**
     * Reload configuration (if token changes)
     */
    public reload() {
        const token = process.env.HUGGINGFACE_TOKEN;
        if (token && token !== 'your_huggingface_token_here') {
            this.hf = new HfInference(token);
            console.log('[HuggingFace] Configuration reloaded');
        } else {
            this.hf = null;
            console.warn('[HuggingFace] Token not set after reload');
        }
    }
}

export const huggingfaceService = new HuggingFaceService();

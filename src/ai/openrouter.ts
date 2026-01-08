
import * as fs from 'fs';
import * as path from 'path';
import { keyManager } from './key_manager';

export class OpenRouterService {
    private models = [
        "google/gemma-3-27b-it:free",
        "google/gemma-3-4b-it:free",
        "mistralai/mistral-small-3.1-24b-instruct:free", // #3 Exact ID matches URL
    ];

    constructor() {
        console.log('[OpenRouter] Initialized with models:', this.models);
    }

    public async analyzeFrame(
        imageBuffer: Buffer,
        prompt: string = "Mô tả ngắn gọn người và hành động trong ảnh này. Cảnh báo nếu có gì đáng ngờ."
    ): Promise<string | null> {

        const base64Image = imageBuffer.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64Image}`;

        // Attempt with available models
        for (const model of this.models) {
            // Get valid key from KeyManager
            const apiKey = keyManager.getNextKey();

            if (!apiKey) {
                console.error("[OPENROUTER] 🛑 All API keys exhausted/disabled for today!");
                return null;
            }

            try {
                console.log(`[OPENROUTER] Analyzing with ${model} (Key: ...${apiKey.slice(-4)})`);

                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://unblink.app",
                        "X-Title": "Unblink Camera AI"
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: prompt },
                                    { type: "image_url", image_url: { url: dataUrl } }
                                ]
                            }
                        ],
                        max_tokens: 300,
                        temperature: 0.4
                    }),
                    signal: AbortSignal.timeout(15000)
                });

                if (!response.ok) {
                    const errorText = await response.text();

                    if (response.status === 429) {
                        console.warn(`[OPENROUTER] Key ...${apiKey.slice(-4)} Rate Limited (429)`);
                        // Disable this key for the day (or temporary)
                        keyManager.disableKey(apiKey, "Rate Limited (429)");
                        // Retry loop will get next key automatically
                    } else {
                        console.warn(`[OPENROUTER] Model ${model} failed: ${response.status}`);
                    }
                    continue;
                }

                const data: any = await response.json();
                if (data.choices && data.choices.length > 0) {
                    const content = data.choices[0].message.content;

                    if (!content || typeof content !== 'string' || content.trim().length === 0) {
                        console.warn(`[OPENROUTER] Model ${model} returned empty/invalid content.`);
                        console.debug('[OPENROUTER] Raw Data:', JSON.stringify(data).slice(0, 200));
                        continue; // Try next model
                    }

                    console.log(`[OPENROUTER] Success with ${model}`);
                    // console.log(`[OPENROUTER] Content: ${content.slice(0, 50)}...`);

                    // INCREMENT KEY USAGE ON SUCCESS
                    keyManager.incrementUsage(apiKey);

                    return content;
                }

            } catch (error) {
                console.error(`[OPENROUTER] Error with ${model}:`, error);
            }
        }

        return null;
    }

    /**
     * Analyze snapshot for alert decision
     * Returns structured output for DDMS integration
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
        const prompt = `Camera: ${cameraName}
Yêu cầu giám sát (Security Rules): "${rules || "Phát hiện bất thường"}"

NHIỆM VỤ: Bạn là AI Giám sát An ninh. Hãy phân tích ảnh và quyết định xem có cần báo động không dựa trên "Yêu cầu giám sát" ở trên.

Trả về JSON chính xác:
{
  "shouldAlert": true/false, // True nếu vi phạm quy tắc an ninh hoặc có hành vi đáng ngờ khớp với yêu cầu.
  "description": "mô tả ngắn gọn (tiếng Việt), giải thích lý do alert",
  "confidence": 0-100, // Độ chắc chắn về nhận định của bạn (70-100 là chắc chắn)
  "detectedObjects": ["person", "vehicle", ...]
}

CHÚ Ý:
- Nếu Yêu cầu là "Báo động có người lạ", và ảnh có người -> shouldAlert: true.
- Nếu Yêu cầu là "Bỏ qua người nhà", và ảnh giống người nhà/quen thuộc -> shouldAlert: false.
- Confidence dưới 60 nghĩa là bạn không chắc chắn -> nên cân nhắc kỹ.`;

        console.log(`[OpenRouter Snapshot] Analyzing for: ${cameraName}`);

        const response = await this.analyzeFrame(imageBuffer, prompt);

        if (!response) {
            console.warn('[OpenRouter Snapshot] No response from AI');
            return null;
        }

        // Parse JSON response
        try {
            // Try to extract JSON from response (remove markdown code blocks if any)
            let jsonStr = response.trim();

            // Remove markdown code blocks
            jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');

            // Find JSON object
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);

                console.log(`[OpenRouter Snapshot] Result: ${parsed.shouldAlert ? '🚨 ALERT' : '✅ Normal'} (${parsed.confidence}%)`);

                return {
                    shouldAlert: parsed.shouldAlert === true,
                    description: parsed.description || response,
                    confidence: parsed.confidence || 0,
                    detectedObjects: parsed.detectedObjects || []
                };
            } else {
                // Fallback: no JSON found, use heuristic
                console.warn('[OpenRouter Snapshot] No JSON found, using fallback');
                const lowerResp = response.toLowerCase();
                const hasAlert = lowerResp.includes('alert') ||
                    lowerResp.includes('cảnh báo') ||
                    lowerResp.includes('bất thường');

                return {
                    shouldAlert: hasAlert,
                    description: response.replace(/```json/g, '').replace(/```/g, '').trim(),
                    confidence: hasAlert ? 70 : 30,
                    detectedObjects: []
                };
            }
        } catch (parseError) {
            console.error('[OpenRouter Snapshot] JSON parse error:', parseError);
            console.log('[OpenRouter Snapshot] Raw response:', response);

            // Return safe fallback
            return {
                shouldAlert: false,
                description: response || 'Analysis failed',
                confidence: 0,
                detectedObjects: []
            };
        }
    }
}

export const openRouterService = new OpenRouterService();

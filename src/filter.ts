import fs from 'fs';
import path from 'path';

// Filter/Smart Agent configuration
// "Smart Context" cho AI quyết định thay vì keyword
interface FilterRule {
    enabled: boolean;
    securityRules: string; // "Ngữ cảnh" thông minh (VD: Cảnh báo người lạ, bỏ qua người nhà...)
    minConfidence: number; // Confidence tối thiểu
    // Dynamic Analysis Settings
    personIouThreshold: number; // 0.6
    vehicleIouThreshold: number; // 0.9
    ignoreMovingPersons: boolean; // true
}

// Config file path
const CONFIG_FILE = path.join(process.cwd(), 'smart_agent_config.json');

// Default rules
const defaultFilterConfig: FilterRule = {
    enabled: true,
    securityRules: "Phát hiện người lạ, hành vi khả nghi, trộm cắp, hoặc phương tiện không xác định dừng đỗ lâu. Bỏ qua động vật nhỏ (chó, mèo), chim, người đi bộ lướt qua nhanh.",
    minConfidence: 30, // Lowered from 60 to 30 - YOLO is accurate at this level
    personIouThreshold: 0.6,
    vehicleIouThreshold: 0.9,
    ignoreMovingPersons: true
};

let filterConfig: FilterRule = { ...defaultFilterConfig };

// Load config on startup
try {
    if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const loaded = JSON.parse(raw);
        filterConfig = { ...defaultFilterConfig, ...loaded };
        console.log('[Smart Agent] Loaded config from file');
    }
} catch (e) {
    console.error('[Smart Agent] Failed to load config:', e);
}

/**
 * Get current filter config
 */
export function getFilterConfig(): FilterRule {
    return { ...filterConfig };
}

/**
 * Update filter config
 */
export function updateFilterConfig(newConfig: Partial<FilterRule>): FilterRule {
    filterConfig = { ...filterConfig, ...newConfig };

    // Save to file
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(filterConfig, null, 2));
        console.log('[Smart Agent] Config saved to file');
    } catch (e) {
        console.error('[Smart Agent] Failed to save config:', e);
    }

    console.log('[Smart Agent] Config updated:', filterConfig);
    return filterConfig;
}

// Helper to check if we should block based on low confidence (safety net)
export function isLowConfidence(confidence: number): boolean {
    if (!filterConfig.enabled) return false;
    return confidence < filterConfig.minConfidence;
}

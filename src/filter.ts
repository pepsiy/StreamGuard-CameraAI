// Filter/Smart Agent configuration
// "Smart Context" cho AI quyết định thay vì keyword
interface FilterRule {
    enabled: boolean;
    securityRules: string; // "Ngữ cảnh" thông minh (VD: Cảnh báo người lạ, bỏ qua người nhà...)
    minConfidence: number; // Confidence tối thiểu
}

// Default rules
let filterConfig: FilterRule = {
    enabled: true,
    securityRules: "Phát hiện người lạ, hành vi khả nghi, trộm cắp, hoặc phương tiện không xác định dừng đỗ lâu. Bỏ qua động vật nhỏ (chó, mèo), chim, người đi bộ lướt qua nhanh.",
    minConfidence: 60
};

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
    console.log('[Smart Agent] Config updated:', filterConfig);
    return filterConfig;
}

// Helper to check if we should block based on low confidence (safety net)
export function isLowConfidence(confidence: number): boolean {
    if (!filterConfig.enabled) return false;
    return confidence < filterConfig.minConfidence;
}

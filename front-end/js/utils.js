/**
 * Utility Functions Module
 * Các hàm tiện ích chung
 */

/**
 * Xác định class badge dựa trên kết quả phân loại
 * @param {string} result - Kết quả phân loại
 * @returns {string} - Class CSS cho badge
 */
function getResultClass(result) {
    if (!result) return '';
    const upperResult = String(result).toUpperCase();
    
    // Các trạng thái lỗi
    if (upperResult.includes('FAIL') || 
        upperResult.includes('DEFECT') || 
        upperResult.includes('NG') ||
        upperResult.includes('ERROR')) {
        return 'badge-error';
    }
    // Các trạng thái tốt
    else if (upperResult.includes('PASS') || 
             upperResult.includes('OK') || 
             upperResult.includes('GOOD')) {
        return 'badge-success';
    }
    // Trạng thái cảnh báo
    return 'badge-warning';
}

/**
 * Tải ảnh xuống máy
 * @param {string} imageData - Data URL của ảnh
 * @param {number} index - Index của ảnh
 */
function downloadImage(imageData, index) {
    const link = document.createElement('a');
    link.href = imageData;
    link.download = `metal-surface-${Date.now()}-${index}.jpg`;
    link.click();
}

// Functions are globally available, used by other modules

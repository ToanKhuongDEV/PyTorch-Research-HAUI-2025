/**
 * CORE.JS
 * Chứa: Utilities, Theme, AppStore, APIManager
 */

// --- 1. UTILS ---
function getResultClass(result) {
    if (!result) return '';
    const upperResult = String(result).toUpperCase();
    if (upperResult.includes('FAIL') || upperResult.includes('DEFECT') || upperResult.includes('NG') || upperResult.includes('ERROR')) return 'badge-error';
    else if (upperResult.includes('PASS') || upperResult.includes('OK') || upperResult.includes('GOOD')) return 'badge-success';
    return 'badge-warning';
}

function downloadImage(imageData, index) {
    const link = document.createElement('a');
    link.href = imageData;
    link.download = `metal-surface-${Date.now()}-${index}.jpg`;
    link.click();
}

// --- 2. THEME MANAGER ---
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (!toggleBtn) return; // Tránh lỗi ở trang không có nút này
    
    const icon = toggleBtn.querySelector('i');
    const html = document.documentElement;
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'light') {
        html.setAttribute('data-theme', 'light');
        updateIcon('light');
    } else {
        html.removeAttribute('data-theme');
        updateIcon('dark');
    }

    toggleBtn.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        if (currentTheme === 'light') {
            html.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
            updateIcon('dark');
        } else {
            html.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            updateIcon('light');
        }
    });

    function updateIcon(theme) {
        if (theme === 'light') icon.className = 'fas fa-moon';
        else icon.className = 'fas fa-sun';
    }
});

// --- 3. APP STORE (State Management) ---
class AppStore {
    constructor() {
        this.capturedImages = [];
        this.imageMetadata = [];
        this.currentPage = 1;
        this.imagesPerPage = 7;
    }
    addImage(imageData) {
        this.capturedImages.push(imageData);
        this.imageMetadata.push({}); 
    }
    updateMetadata(index, metadata) { this.imageMetadata[index] = metadata; }
    getMetadata(index) { return this.imageMetadata[index] || {}; }
    getImages() { return this.capturedImages; }
    getImage(index) { return this.capturedImages[index]; }
    getImageCount() { return this.capturedImages.length; }
    clearAll() {
        this.capturedImages = [];
        this.imageMetadata = [];
        this.currentPage = 1;
    }
    getCurrentPage() { return this.currentPage; }
    setCurrentPage(page) { this.currentPage = page; }
    
    getCurrentPageImages() {
        const totalImages = this.capturedImages.length;
        const totalPages = Math.ceil(totalImages / this.imagesPerPage);
        const startIndexFromEnd = (this.currentPage - 1) * this.imagesPerPage;
        const endIndexFromEnd = startIndexFromEnd + this.imagesPerPage;
        const realEndIndex = totalImages - startIndexFromEnd;
        const realStartIndex = Math.max(0, totalImages - endIndexFromEnd);
        const pageImages = this.capturedImages.slice(realStartIndex, realEndIndex);

        return {
            images: pageImages.reverse(),
            startIndex: realStartIndex,
            endIndex: realEndIndex,
            totalPages: totalPages
        };
    }
}

// --- 4. API MANAGER ---
class APIManager {
    constructor(store) {
        this.store = store;
        this.baseURL = 'http://127.0.0.1:8000';
    }

    async processPipeline(fileOrBlob) {
        try {
            const formData = new FormData();
            formData.append("file", fileOrBlob, `frame-${Date.now()}.jpg`);
            const response = await fetch(`${this.baseURL}/process-pipeline`, {
                method: "POST", body: formData
            });
            return await response.json();
        } catch (error) {
            console.error("Pipeline Error:", error);
            return { status: "error", message: "Lỗi kết nối" };
        }
    }
}
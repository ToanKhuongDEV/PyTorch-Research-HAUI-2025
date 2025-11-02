/**
 * UI Management Module
 * Quản lý cập nhật giao diện người dùng
 */

class UIManager {
    constructor(store) {
        this.store = store;
        this.elements = {};
    }

    /**
     * Khởi tạo các DOM elements
     */
    initElements() {
        this.elements = {
            capturedCount: document.getElementById('capturedCount'),
            emptyState: document.getElementById('emptyState'),
            imageList: document.getElementById('imageList'),
            clearAllBtn: document.getElementById('clearAllBtn'),
            errorMessage: document.getElementById('errorMessage'),
            errorText: document.getElementById('errorText'),
            paginationContainer: null
        };
    }

    /**
     * Hiển thị thông báo lỗi
     * @param {string} message - Thông báo lỗi
     */
    showError(message) {
        if (this.elements.errorText && this.elements.errorMessage) {
            this.elements.errorText.textContent = message;
            this.elements.errorMessage.classList.remove('hidden');
        }
    }

    /**
     * Ẩn thông báo lỗi
     */
    hideError() {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.classList.add('hidden');
        }
    }

    /**
     * Cập nhật danh sách ảnh với pagination
     */
    updateImageList() {
        const count = this.store.getImageCount();
        
        if (this.elements.capturedCount) {
            this.elements.capturedCount.textContent = `${count} ảnh`;
        }
        
        if (count > 0) {
            this.elements.emptyState.classList.add('hidden');
            this.elements.imageList.classList.remove('hidden');
            this.elements.clearAllBtn.classList.remove('hidden');
            
            this.renderPage();
        } else {
            this.elements.emptyState.classList.remove('hidden');
            this.elements.imageList.classList.add('hidden');
            this.elements.clearAllBtn.classList.add('hidden');
            this.hidePagination();
        }
    }

    /**
     * Render trang hiện tại
     */
    renderPage() {
        const { images, startIndex, endIndex, totalPages } = this.store.getCurrentPageImages();
        
        this.elements.imageList.innerHTML = '';
        
        images.forEach((image, localIndex) => {
            const actualIndex = endIndex - 1 - localIndex;
            const metadata = this.store.getMetadata(actualIndex) || {};
            const captureTime = metadata.captureTime ? new Date(metadata.captureTime) : new Date();
            const classification = metadata.production?.result || 'Đang xử lý...';
            const confidence = metadata.production?.confidence || 'N/A';
            
            const imageItem = this.createImageItem(image, actualIndex, captureTime, classification, confidence);
            this.elements.imageList.appendChild(imageItem);
        });
        
        this.updatePagination(totalPages);
    }

    /**
     * Tạo element ảnh
     */
    createImageItem(image, index, captureTime, classification, confidence) {
        const imageItem = document.createElement('div');
        imageItem.className = 'image-item';
        
        imageItem.innerHTML = `
            <img src="${image}" class="image-thumb" alt="Ảnh ${index + 1}" data-index="${index}">
            <div class="image-info">
                <div class="image-name">Ảnh ${index + 1}</div>
                <div class="image-time">${captureTime.toLocaleTimeString('vi-VN')}</div>
                <div class="image-classification">
                    <span class="badge ${getResultClass(classification)}">${classification}</span>
                    <span class="confidence">${confidence}</span>
                </div>
            </div>
            <div class="image-actions">
                <button class="btn btn-outline btn-sm view-btn" data-index="${index}">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-outline btn-sm download-btn" data-index="${index}">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        `;
        
        return imageItem;
    }

    /**
     * Cập nhật pagination controls
     */
    updatePagination(totalPages) {
        if (totalPages <= 1) {
            this.hidePagination();
            return;
        }
        
        this.showPagination();
        const currentPage = this.store.getCurrentPage();
        
        let paginationHTML = '<div class="pagination">';
        
        // Previous button
        paginationHTML += `<button class="btn btn-outline btn-sm pagination-btn" id="prevBtn" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>`;
        
        // Page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `<button class="btn btn-sm pagination-btn page-number ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        
        // Next button
        paginationHTML += `<button class="btn btn-outline btn-sm pagination-btn" id="nextBtn" ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>`;
        
        paginationHTML += '</div>';
        
        // Page info
        paginationHTML += `<div class="pagination-info">Trang ${currentPage} / ${totalPages}</div>`;
        
        if (this.elements.paginationContainer) {
            this.elements.paginationContainer.innerHTML = paginationHTML;
            // Attach listeners immediately after inserting HTML
            this.attachPaginationListeners();
        }
    }

    /**
     * Hiển thị pagination
     */
    showPagination() {
        if (!this.elements.paginationContainer) {
            const container = document.querySelector('.images-container');
            if (container) {
                this.elements.paginationContainer = document.createElement('div');
                this.elements.paginationContainer.id = 'paginationContainer';
                this.elements.paginationContainer.className = 'pagination-container';
                container.appendChild(this.elements.paginationContainer);
            }
        }
        
        if (this.elements.paginationContainer) {
            this.elements.paginationContainer.classList.remove('hidden');
        }
    }

    /**
     * Ẩn pagination
     */
    hidePagination() {
        if (this.elements.paginationContainer) {
            this.elements.paginationContainer.classList.add('hidden');
        }
    }

    /**
     * Đính kèm event listeners cho pagination
     * Uses event delegation to handle dynamic pagination buttons
     */
    attachPaginationListeners() {
        // Use event delegation from pagination container to avoid duplicate listeners
        if (this.elements.paginationContainer) {
            // Check if listener is already attached
            if (this._paginationListenerAttached) {
                return; // Already attached
            }
            
            // Create a bound function for the event listener
            this._paginationClickHandler = (e) => {
                const target = e.target.closest('button');
                if (!target) return;
                
                // Check if button is disabled
                if (target.disabled) return;
                
                if (target.id === 'prevBtn') {
                    const currentPage = this.store.getCurrentPage();
                    if (currentPage > 1) {
                        this.store.setCurrentPage(currentPage - 1);
                        this.updateImageList();
                    }
                } else if (target.id === 'nextBtn') {
                    const currentPage = this.store.getCurrentPage();
                    const { totalPages } = this.store.getCurrentPageImages();
                    if (currentPage < totalPages) {
                        this.store.setCurrentPage(currentPage + 1);
                        this.updateImageList();
                    }
                } else if (target.classList.contains('page-number')) {
                    const page = parseInt(target.getAttribute('data-page'));
                    if (!isNaN(page)) {
                        this.store.setCurrentPage(page);
                        this.updateImageList();
                    }
                }
            };
            
            this.elements.paginationContainer.addEventListener('click', this._paginationClickHandler);
            
            // Mark as attached
            this._paginationListenerAttached = true;
        }
    }
}

// Export class for instantiation in main.js
// const uiManager = new UIManager();

/**
 * Modal Management Module
 * Quản lý modal xem ảnh chi tiết
 */

class ModalManager {
    constructor(store) {
        this.store = store;
        this.elements = {};
        this.infoElements = {};
    }

    /**
     * Khởi tạo các DOM elements
     */
    initElements() {
        this.elements = {
            modal: document.getElementById('imageModal'),
            modalImage: document.getElementById('modalImage'),
            closeBtn: document.getElementById('closeModalBtn'),
            downloadBtn: document.getElementById('downloadModalBtn'),
            basicInfo: document.getElementById('basicInfo'),
            cameraInfo: document.getElementById('cameraInfo'),
            environmentInfo: document.getElementById('environmentInfo'),
            systemInfo: document.getElementById('systemInfo'),
            productionInfo: document.getElementById('productionInfo')
        };
    }

    /**
     * Mở modal xem ảnh
     * @param {string} imageData - Data URL của ảnh
     * @param {number} index - Index của ảnh
     */
    openImageModal(imageData, index) {
        if (this.elements.modalImage && this.elements.modal) {
            this.elements.modalImage.src = imageData;
            this.displayImageInfo(index);
            this.elements.modal.classList.remove('hidden');
        }
    }

    /**
     * Đóng modal
     */
    closeModal() {
        if (this.elements.modal) {
            this.elements.modal.classList.add('hidden');
        }
    }

    /**
     * Hiển thị thông tin ảnh trong modal
     * @param {number} index - Index của ảnh
     */
    displayImageInfo(index) {
        const metadata = this.store.getMetadata(index) || {};
        
        // Basic info
        if (this.elements.basicInfo) {
            this.elements.basicInfo.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Kết quả phân loại</span>
                    <span class="info-value ${getResultClass(metadata.production?.result)}">
                        ${metadata.production?.result || 'N/A'}
                    </span>
                </div>
                <div class="info-item">
                    <span class="info-label">Độ tin cậy</span>
                    <span class="info-value">${metadata.production?.confidence || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Kích thước</span>
                    <span class="info-value">${metadata.basic?.resolution || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Độ phân giải</span>
                    <span class="info-value">${metadata.basic?.dpi || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Định dạng</span>
                    <span class="info-value">${metadata.basic?.format || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Kích thước file</span>
                    <span class="info-value">${metadata.basic?.fileSize || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Độ sâu màu</span>
                    <span class="info-value">${metadata.basic?.colorDepth || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Không gian màu</span>
                    <span class="info-value">${metadata.basic?.colorSpace || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Tỷ lệ nén</span>
                    <span class="info-value">${metadata.basic?.compression || 'N/A'}</span>
                </div>
            `;
        }
        
        // Camera info
        if (this.elements.cameraInfo) {
            this.elements.cameraInfo.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Camera</span>
                    <span class="info-value">${metadata.camera?.cameraId || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Loại cảm biến</span>
                    <span class="info-value">${metadata.camera?.sensorType || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Độ phân giải cảm biến</span>
                    <span class="info-value">${metadata.camera?.sensorResolution || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Ống kính</span>
                    <span class="info-value">${metadata.camera?.lens || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">ISO</span>
                    <span class="info-value">${metadata.camera?.iso || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Tốc độ màn trập</span>
                    <span class="info-value">${metadata.camera?.shutterSpeed || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Cân bằng trắng</span>
                    <span class="info-value">${metadata.camera?.whiteBalance || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Độ phơi sáng</span>
                    <span class="info-value">${metadata.camera?.exposure || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Tiêu cự</span>
                    <span class="info-value">${metadata.camera?.focalLength || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Focus</span>
                    <span class="info-value">${metadata.camera?.focus || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Flash</span>
                    <span class="info-value">${metadata.camera?.flash || 'N/A'}</span>
                </div>
            `;
        }
        
        // Environment info
        if (this.elements.environmentInfo) {
            this.elements.environmentInfo.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Thời gian chụp</span>
                    <span class="info-value">${metadata.environment?.timestamp || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Nhiệt độ</span>
                    <span class="info-value">${metadata.environment?.temperature || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Độ ẩm</span>
                    <span class="info-value">${metadata.environment?.humidity || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Cường độ ánh sáng</span>
                    <span class="info-value">${metadata.environment?.lightIntensity || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Tốc độ băng chuyền</span>
                    <span class="info-value">${metadata.environment?.conveyorSpeed || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Vị trí</span>
                    <span class="info-value">${metadata.environment?.location || 'N/A'}</span>
                </div>
            `;
        }
        
        // System info
        if (this.elements.systemInfo) {
            this.elements.systemInfo.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Firmware</span>
                    <span class="info-value">${metadata.system?.firmware || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Machine ID</span>
                    <span class="info-value">${metadata.system?.machineId || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Histogram</span>
                    <span class="info-value">${metadata.system?.histogram || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Độ tương phản</span>
                    <span class="info-value">${metadata.system?.contrast || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Độ sáng trung bình</span>
                    <span class="info-value">${metadata.system?.brightness || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Độ sắc nét</span>
                    <span class="info-value">${metadata.system?.sharpness || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">SNR</span>
                    <span class="info-value">${metadata.system?.snr || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">FPS</span>
                    <span class="info-value">${metadata.system?.fps || 'N/A'}</span>
                </div>
            `;
        }
        
        // Production info
        if (this.elements.productionInfo) {
            this.elements.productionInfo.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Mã sản phẩm</span>
                    <span class="info-value">${metadata.production?.productId || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Barcode</span>
                    <span class="info-value">${metadata.production?.barcode || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Ca làm việc</span>
                    <span class="info-value">${metadata.production?.shift || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Batch/Lot</span>
                    <span class="info-value">${metadata.production?.batch || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Operator ID</span>
                    <span class="info-value">${metadata.production?.operator || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Kết quả kiểm tra</span>
                    <span class="info-value ${metadata.production?.result === 'FAIL' ? 'na' : ''}">${metadata.production?.result || 'N/A'}</span>
                </div>
            `;
        }
    }

    /**
     * Tải ảnh từ modal
     * @param {string} imageData - Data URL của ảnh
     * @param {number} index - Index của ảnh
     */
    downloadCurrentImage() {
        if (this.elements.modalImage) {
            const imageSrc = this.elements.modalImage.src;
            const images = this.store.getImages();
            const index = images.findIndex(img => img === imageSrc);
            if (index !== -1) {
                downloadImage(images[index], index);
            }
        }
    }
}

// Export class for instantiation in main.js
// const modalManager = new ModalManager();

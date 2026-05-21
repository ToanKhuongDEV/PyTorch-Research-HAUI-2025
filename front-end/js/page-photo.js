/**
 * PAGE-PHOTO.JS
 * Logic điều khiển cho trang photo.html
 */

// --- 1. UI MANAGER CLASS ---
class UIManager {
    constructor(store) {
        this.store = store;
        this.elements = {};
    }
    
    initElements() {
        this.elements = {
            capturedCount: document.getElementById('capturedCount'),
            emptyState: document.getElementById('emptyState'),
            imageList: document.getElementById('imageList'),
            clearAllBtn: document.getElementById('clearAllBtn'),
            errorMessage: document.getElementById('errorMessage'),
            errorText: document.getElementById('errorText'),
            paginationContainer: document.getElementById('paginationContainer')
        };
    }

    // [FIXED] Đã thêm logic hiển thị lỗi
    showError(msg) {
        if (this.elements.errorText && this.elements.errorMessage) {
            this.elements.errorText.textContent = msg;
            this.elements.errorMessage.classList.remove('hidden');
        } else {
            alert(msg); // Fallback nếu không tìm thấy element
        }
    }

    // [FIXED] Đã thêm logic ẩn lỗi
    hideError() {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.classList.add('hidden');
        }
    }
    
    updateImageList() {
        const count = this.store.getImageCount();
        if (this.elements.capturedCount) this.elements.capturedCount.textContent = `${count} images`;
        
        if (count > 0) {
            this.elements.emptyState.classList.add('hidden');
            this.elements.imageList.classList.remove('hidden');
            this.elements.clearAllBtn.classList.remove('hidden');
            this.renderPage();
        } else {
            this.elements.emptyState.classList.remove('hidden');
            this.elements.imageList.classList.add('hidden');
            this.elements.clearAllBtn.classList.add('hidden');
            if(this.elements.paginationContainer) this.elements.paginationContainer.classList.add('hidden');
        }
    }

    renderPage() {
        const { images, startIndex, endIndex, totalPages } = this.store.getCurrentPageImages();
        this.elements.imageList.innerHTML = '';
        
        images.forEach((image, localIndex) => {
            const actualIndex = endIndex - 1 - localIndex;
            const metadata = this.store.getMetadata(actualIndex) || {};
            const item = this.createImageItem(image, actualIndex, metadata);
            this.elements.imageList.appendChild(item);
        });
        this.updatePagination(totalPages);
    }

    createImageItem(image, index, metadata) {
        const div = document.createElement('div');
        div.className = 'image-item';
        div.setAttribute('data-index', index); // Thêm data-index vào thẻ cha
        
        // Xử lý hiển thị an toàn
        const result = metadata.production?.result || 'Processing...';
        const conf = metadata.production?.confidence || '';
        const time = metadata.captureTime ? new Date(metadata.captureTime).toLocaleTimeString() : '';

        div.innerHTML = `
            <img src="${image}" class="image-thumb" data-index="${index}">
            <div class="image-info">
                <div class="image-name">Image ${index + 1}</div>
                <div class="image-time">${time}</div>
                <div class="image-classification">
                    <span class="badge ${getResultClass(result)}">${result}</span>
                    <span class="confidence">${conf}</span>
                </div>
            </div>`;
        return div;
    }

    showPagination() {
        if (this.elements.paginationContainer) {
            this.elements.paginationContainer.classList.remove('hidden');
        }
    }

    hidePagination() {
        if (this.elements.paginationContainer) {
            this.elements.paginationContainer.classList.add('hidden');
        }
    }
    
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
        paginationHTML += `<div class="pagination-info">Page ${currentPage} / ${totalPages}</div>`;
        
        if (this.elements.paginationContainer) {
            this.elements.paginationContainer.innerHTML = paginationHTML;
            this.attachPaginationListeners();
        }
    }

    attachPaginationListeners() {
        if (this.isPaginationListenerAttached) return;

        this.elements.paginationContainer.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target || target.disabled) return;

            const store = this.store;
            const currentPage = store.getCurrentPage();
            const { totalPages } = store.getCurrentPageImages();

            if (target.id === 'prevBtn') {
                if (currentPage > 1) {
                    store.setCurrentPage(currentPage - 1);
                    this.updateImageList();
                }
            } else if (target.id === 'nextBtn') {
                if (currentPage < totalPages) {
                    store.setCurrentPage(currentPage + 1);
                    this.updateImageList();
                }
            } else if (target.classList.contains('page-number')) {
                const page = parseInt(target.getAttribute('data-page'));
                if (!isNaN(page)) {
                    store.setCurrentPage(page);
                    this.updateImageList();
                }
            }
        });
        this.isPaginationListenerAttached = true;
    }
}

// --- 2. MODAL MANAGER CLASS (Đã fix full thông tin) ---
class ModalManager {
    constructor(store) {
        this.store = store;
        this.elements = {};
    }

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

    openImageModal(imageData, index) {
        if (this.elements.modal) {
            this.elements.modalImage.src = imageData;
            this.displayInfo(index);
            this.elements.modal.classList.remove('hidden');
        }
    }

    closeModal() { 
        this.elements.modal?.classList.add('hidden'); 
    }

    displayInfo(index) {
        const meta = this.store.getMetadata(index) || {};
        
        if(this.elements.basicInfo) {
            this.elements.basicInfo.innerHTML = `
                <div class="info-item"><span class="info-label">Result</span><span class="info-value ${getResultClass(meta.production?.result)}">${meta.production?.result || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Confidence</span><span class="info-value">${meta.production?.confidence || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Resolution</span><span class="info-value">${meta.basic?.resolution || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">File Size</span><span class="info-value">${meta.basic?.fileSize || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Format</span><span class="info-value">${meta.basic?.format || 'JPEG'}</span></div>
            `;
        }
        if (this.elements.cameraInfo) {
            this.elements.cameraInfo.innerHTML = `
                <div class="info-item"><span class="info-label">Camera ID</span><span class="info-value">${meta.camera?.cameraId || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Sensor</span><span class="info-value">${meta.camera?.sensorResolution || 'N/A'}</span></div>
            `;
        }
        if (this.elements.environmentInfo) {
            this.elements.environmentInfo.innerHTML = `
                <div class="info-item"><span class="info-label">Capture Time</span><span class="info-value">${meta.environment?.timestamp || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Temperature</span><span class="info-value">${meta.environment?.temperature || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Humidity</span><span class="info-value">${meta.environment?.humidity || 'N/A'}</span></div>
            `;
        }
        if (this.elements.systemInfo) {
            this.elements.systemInfo.innerHTML = `
                <div class="info-item"><span class="info-label">Brightness (Avg)</span><span class="info-value">${meta.system?.brightness || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Contrast</span><span class="info-value">${meta.system?.contrast || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Sharpness</span><span class="info-value">${meta.system?.sharpness || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">SNR</span><span class="info-value">${meta.system?.snr || 'N/A'}</span></div>
            `;
        }
        if (this.elements.productionInfo) {
            this.elements.productionInfo.innerHTML = `
                <div class="info-item"><span class="info-label">Product Code</span><span class="info-value">${meta.production?.productId || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Batch/Lot</span><span class="info-value">${meta.production?.batch || 'N/A'}</span></div>
            `;
        }
    }

    downloadCurrentImage() {
        if (this.elements.modalImage) {
            const link = document.createElement('a');
            link.href = this.elements.modalImage.src;
            link.download = `photo-${Date.now()}.jpg`;
            link.click();
        }
    }
}

// --- 3. MAIN CONTROLLER ---
document.addEventListener('DOMContentLoaded', async function() {
    const store = new AppStore();
    const camera = new CameraManager();
    const api = new APIManager(store);
    const ui = new UIManager(store);
    const modal = new ModalManager(store);
    const metadataCalc = new MetadataCalculator();

    const els = {
        videoFeed: document.getElementById('videoFeed'),
        placeholder: document.getElementById('videoPlaceholder'),
        cameraSelect: document.getElementById('cameraSelect'),
        startBtn: document.getElementById('startCameraBtn'),
        stopBtn: document.getElementById('stopCameraBtn'),
        status: document.getElementById('systemCameraStatus'),
        clearBtn: document.getElementById('clearAllBtn'),
        canvas: document.getElementById('canvas'),
        uploadBtn: document.getElementById('uploadImageBtn'),
        fileInput: document.getElementById('fileUploadInput')
    };

    ui.initElements();
    modal.initElements();

    async function loadCameras() {
        try {
            const devices = await camera.getCameras();
            els.cameraSelect.innerHTML = '<option value="">Select Camera</option>';
            devices.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.text = d.label || `Camera`;
                els.cameraSelect.appendChild(opt);
            });
        } catch(e) { console.error(e); }
    }
    await loadCameras();

    camera.on('streamStarted', (stream) => {
        els.videoFeed.srcObject = stream;
        els.videoFeed.classList.remove('hidden');
        els.placeholder.classList.add('hidden');
        updateBtnState(true);
    });

    camera.on('streamStopped', () => {
        els.videoFeed.classList.add('hidden');
        els.placeholder.classList.remove('hidden');
        updateBtnState(false);
    });

    let autoCaptureInterval = null;

    camera.on('statusChanged', (running) => {
        els.status.textContent = running ? 'RUNNING' : 'STOPPED';
        els.status.className = running ? 'badge badge-success' : 'badge badge-destructive';
        
        if (running) {
            if (!autoCaptureInterval) {
                autoCaptureInterval = setInterval(captureSnapshot, 1000);
            }
        } else {
            if (autoCaptureInterval) {
                clearInterval(autoCaptureInterval);
                autoCaptureInterval = null;
            }
        }
    });

    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) {
        // Cập nhật DOM của video (scaleX(-1) để lật ảnh + scale(zoomVal) để thu phóng)
        zoomSlider.addEventListener('input', (e) => {
            els.videoFeed.style.transform = `scaleX(-1) scale(${e.target.value})`;
        });
        // Set mặc định khi load
        els.videoFeed.style.transform = `scaleX(-1) scale(${zoomSlider.value})`;
    }

    function updateBtnState(running) {
        els.startBtn.disabled = running;
        els.stopBtn.disabled = !running;
    }

    els.startBtn.addEventListener('click', () => camera.startCamera(els.cameraSelect.value));
    els.stopBtn.addEventListener('click', () => camera.stopCamera());
    
    // --- CAPTURE & PIPELINE ---
    async function captureSnapshot() {
        try {
            const result = camera.captureImage(els.videoFeed, els.canvas);
            if (!result) return;

            store.addImage(result.imageData);
            const index = store.getImageCount() - 1;
            
            const meta = metadataCalc.generateImageMetadata(
                result.imageData, index, els.canvas, els.cameraSelect, camera.getCurrentStream()
            );
            meta.captureTime = new Date();
            meta.production = { result: 'Processing...', confidence: '...' };
            
            store.updateMetadata(index, meta);
            ui.updateImageList();

            const blob = dataURItoBlob(result.imageData);
            const apiRes = await api.processPipeline(blob);
            updateMetadataWithResult(index, meta, apiRes);

        } catch (err) {
            console.error("Capture error:", err);
            ui.showError("Image processing error: " + err.message);
        } finally {
            ui.updateImageList();
        }
    }

    // --- [FIXED] UPLOAD & PIPELINE ---
    els.uploadBtn.addEventListener('click', () => els.fileInput.click());
    
    els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const imageData = event.target.result;
            
            // Vẽ lên canvas ẩn để tính toán metadata
            const img = new Image();
            img.onload = async () => {
                els.canvas.width = img.width;
                els.canvas.height = img.height;
                const ctx = els.canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                store.addImage(imageData);
                const index = store.getImageCount() - 1;

                const dummySelect = { options: [{ text: 'Upload: ' + file.name }], selectedIndex: 0 };
                const meta = metadataCalc.generateImageMetadata(
                    imageData, index, els.canvas, dummySelect, null
                );
                
                // Override N/A cho môi trường vì là ảnh upload
                meta.environment.temperature = 'N/A';
                meta.environment.humidity = 'N/A';
                meta.environment.lightIntensity = 'N/A';
                
                meta.captureTime = new Date();
                meta.production = { result: 'Processing...', confidence: '...' };

                store.updateMetadata(index, meta);
                ui.updateImageList();

                // Gửi file đi xử lý
                try {
                    const apiRes = await api.processPipeline(file);
                    updateMetadataWithResult(index, meta, apiRes);
                } catch(err) {
                    console.error(err);
                    meta.production.result = "NETWORK ERROR";
                    store.updateMetadata(index, meta);
                } finally {
                    ui.updateImageList();
                }
            };
            img.src = imageData;
        };
        reader.readAsDataURL(file);
        els.fileInput.value = ''; // Reset input để chọn lại file cũ được
    });

    // Helper: Cập nhật metadata từ kết quả API (Dùng chung cho cả Capture và Upload)
    function updateMetadataWithResult(index, meta, apiRes) {
        if (apiRes.status === 'defect_found') {
            meta.production.result = apiRes.message;
            const confVal = apiRes.confidence ? (apiRes.confidence * 100) : 0;
            meta.production.confidence = confVal.toFixed(1) + "%";
        } else if (apiRes.status === 'invalid_domain') {
            meta.production.result = "INVALID DOMAIN";
            meta.production.confidence = "N/A";
        } else if (apiRes.status === 'no_object') {
            meta.production.result = "NO OBJECT";
            meta.production.confidence = "100%";
        } else {
            meta.production.result = "PROCESSING ERROR";
            meta.production.confidence = "0%";
        }
        store.updateMetadata(index, meta);
    }

    function dataURItoBlob(dataURI) {
        const byteString = atob(dataURI.split(',')[1]);
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeString });
    }
    
    // Các sự kiện khác
    els.clearBtn.addEventListener('click', () => { store.clearAll(); ui.updateImageList(); });
    
    document.getElementById('imageList')?.addEventListener('click', (e) => {
        const item = e.target.closest('.image-item');
        if (item) {
            const idx = parseInt(item.getAttribute('data-index'));
            modal.openImageModal(store.getImage(idx), idx);
        }
    });
    modal.elements.closeBtn?.addEventListener('click', () => modal.closeModal());
    modal.elements.downloadBtn?.addEventListener('click', () => modal.downloadCurrentImage());

    updateBtnState(false);
});
/**
 * Main Application Entry Point
 * Khởi tạo và kết nối tất cả các modules
 */

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize managers with dependencies
    const store = new AppStore();
    
    // Create manager instances if they don't exist
    const camera = new CameraManager();
    const api = new APIManager(store);
    const ui = new UIManager(store);
    const modal = new ModalManager(store);
    const metadata = new MetadataCalculator();
    
    // DOM elements
    const videoFeed = document.getElementById('videoFeed');
    const videoPlaceholder = document.getElementById('videoPlaceholder');
    const videoOverlay = document.getElementById('videoOverlay');
    const cameraSelect = document.getElementById('cameraSelect');
    const startCameraBtn = document.getElementById('startCameraBtn');
    const stopCameraBtn = document.getElementById('stopCameraBtn');
    const captureBtn = document.getElementById('captureBtn');
    const systemCameraStatus = document.getElementById('systemCameraStatus');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const canvas = document.getElementById('canvas');
    const uploadImageBtn = document.getElementById('uploadImageBtn');
    const fileUploadInput = document.getElementById('fileUploadInput');
    
    // Initialize UI and Modal
    ui.initElements();
    modal.initElements();
    
    // Load cameras
    await loadCameras();
    
    // Camera event handlers
    camera.on('streamStarted', (stream) => {
        videoFeed.srcObject = stream;
        videoFeed.classList.remove('hidden');
        videoOverlay.classList.remove('hidden');
        videoPlaceholder.classList.add('hidden');
        updateUI();
    });
    
    camera.on('streamStopped', () => {
        videoFeed.srcObject = null;
        videoFeed.classList.add('hidden');
        videoOverlay.classList.add('hidden');
        videoPlaceholder.classList.remove('hidden');
        updateUI();
    });
    
    camera.on('statusChanged', (streaming) => {
        if (streaming) {
            systemCameraStatus.textContent = 'Hoạt động';
            systemCameraStatus.className = 'badge badge-default';
        } else {
            systemCameraStatus.textContent = 'Tắt';
            systemCameraStatus.className = 'badge badge-secondary';
        }
        updateUI();
    });
    
    camera.on('error', (message) => {
        ui.showError(message);
    });
    
    // Load cameras into select
    async function loadCameras() {
        try {
            const videoDevices = await camera.getCameras();
            
            cameraSelect.innerHTML = '<option value="">Chọn camera</option>';
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${cameraSelect.options.length}`;
                cameraSelect.appendChild(option);
            });
        } catch (err) {
            ui.showError('Không thể truy cập danh sách camera');
        }
    }
    
    // Update UI based on streaming status
    function updateUI() {
        const streaming = camera.getStreamingStatus();
        startCameraBtn.disabled = streaming;
        stopCameraBtn.disabled = !streaming;
        captureBtn.disabled = !streaming;
    }
    
    // Start camera handler
    startCameraBtn.addEventListener('click', async () => {
        ui.hideError();
        await camera.startCamera(cameraSelect.value);
    });
    
    // Stop camera handler
    stopCameraBtn.addEventListener('click', () => {
        camera.stopCamera();
    });
    
    // === HÀM XỬ LÝ CHUNG CHO PIPELINE ===
    async function runPipelineForIndex(index, blobData) {
        // 1. Gọi API
        const result = await api.processPipeline(blobData);
        
        // 2. Lấy metadata hiện tại để cập nhật
        const meta = store.getMetadata(index);
        
        // 3. Xử lý kết quả trả về từ API
        if (result.status === 'error') {
            meta.production.result = "LỖI MẠNG";
            // meta.production.confidence = "N/A";
        } 
        else if (result.status === 'invalid_domain') {
            meta.production.result = "SAI DOMAIN"; // Hoặc "Ảnh lạ"
            // meta.production.confidence = "N/A";
        } 
        else if (result.status === 'no_object') {
            meta.production.result = "KHÔNG CÓ VẬT";
            // meta.production.confidence = "N/A";
        } 
        else if (result.status === 'defect_found') {
            // Đây là trường hợp thành công: Có vật + Đã phân loại lỗi
            meta.production.result = result.message.toUpperCase(); // VD: VẾT XƯỚC
            meta.production.confidence = (result.confidence * 100).toFixed(1) + "%";
            
            // Nếu muốn lưu thêm xác suất chi tiết
            if (result.probabilities) {
                meta.production.probabilities = result.probabilities;
            }
            // Nếu muốn lưu bounding box (để vẽ sau này)
            if (result.box) {
                meta.production.box = result.box;
            }
        }

        // 4. Lưu và vẽ lại UI
        store.updateMetadata(index, meta);
        ui.updateImageList();
    }

    // Capture image handler
    captureBtn.addEventListener('click', async () => {
        try {
            // 1. Chụp ảnh từ video
            const captureResult = camera.captureImage(videoFeed, canvas);
            if (!captureResult) return;
            
            const { imageData } = captureResult;
            const captureTime = new Date();
            
            // 2. Lưu ảnh vào store (hiển thị lên UI ngay lập tức)
            store.addImage(imageData); 
            const index = store.getImageCount() - 1;
            
            // 3. Tạo metadata ban đầu (Trạng thái: Đang xử lý...)
            const metadataObj = metadata.generateImageMetadata(
                imageData, 
                index, 
                canvas, 
                cameraSelect, 
                camera.getCurrentStream()
            );
            metadataObj.captureTime = captureTime;
            metadataObj.production = { result: 'Đang xử lý...', confidence: '...' };
            
            store.updateMetadata(index, metadataObj);
            ui.updateImageList(); // Cập nhật UI để hiện "Đang xử lý..."
            
            // 4. CHUYỂN ĐỔI ẢNH VÀ GỌI PIPELINE
            // Dùng hàm dataURItoBlob thay vì fetch (Tránh lỗi treo)
            const blob = dataURItoBlob(imageData);

            console.log("Đã tạo Blob từ ảnh chụp, đang gửi API..."); // Debug log

            // Gọi hàm Pipeline chung (đã viết ở bước trước)
            await runPipelineForIndex(index, blob);

        } catch (err) {
            console.error("Lỗi nghiêm trọng khi chụp ảnh:", err);
            // Nếu có lỗi, cập nhật UI để người dùng biết
            alert("Có lỗi xảy ra khi xử lý ảnh chụp. Xem console để biết chi tiết.");
        }
    });
    
    // Clear all images handler
    clearAllBtn.addEventListener('click', () => {
        store.clearAll();
        ui.updateImageList();
    });

    // "Upload Ảnh" -> bấm vào input file bị ẩn
    uploadImageBtn.addEventListener('click', () => {
        fileUploadInput.click();
    });

    // Xử lý khi người dùng đã chọn file
    fileUploadInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const imageData = e.target.result;
            const captureTime = new Date();

            store.addImage(imageData);
            const index = store.getImageCount() - 1;

            const metadataObj = {
                captureTime: captureTime,
                basic: { resolution: 'Upload', fileSize: `${(file.size/1024).toFixed(1)} KB`, format: file.type },
                camera: { cameraId: 'Uploaded File' },
                environment: { timestamp: captureTime.toLocaleString('vi-VN') },
                system: {},
                production: { result: 'Đang xử lý...', confidence: '...' }
            };
            store.updateMetadata(index, metadataObj);
            ui.updateImageList();

            // Chạy Pipeline với file upload trực tiếp
            await runPipelineForIndex(index, file);
        };
        reader.readAsDataURL(file);
        fileUploadInput.value = ''; // Reset input
    });
    
    // Close modal handler
    modal.elements.closeBtn?.addEventListener('click', () => {
        modal.closeModal();
    });
    
    // Download from modal handler
    modal.elements.downloadBtn?.addEventListener('click', () => {
        modal.downloadCurrentImage();
    });
    
    // Image list click handlers (delegated)
    document.getElementById('imageList')?.addEventListener('click', (e) => {
        const target = e.target;
        const btn = target.closest('.view-btn, .download-btn, .image-thumb');
        
        if (!btn) return;
        
        // Sửa lỗi: Đảm bảo index được đọc chính xác từ data-index
        const indexStr = btn.getAttribute('data-index');
        if (indexStr === null) return;
        
        const index = parseInt(indexStr);
        const image = store.getImage(index);
        if (!image) return;
        
        if (btn.classList.contains('view-btn') || btn.classList.contains('image-thumb')) {
            modal.openImageModal(image, index);
        } else if (btn.classList.contains('download-btn')) {
            // Giả sử bạn có hàm downloadImage trong utils.js
            // Nếu không, bạn cần định nghĩa nó.
            // downloadImage(image, index); 
            console.warn("Chức năng download chưa được liên kết.");
        }
    });

    // --- HÀM BỔ TRỢ: CHUYỂN DATAURL -> BLOB (Fix lỗi treo feature chụp ảnh) ---
    function dataURItoBlob(dataURI) {
        // Tách phần header (vd: data:image/jpeg;base64,) và phần dữ liệu
        var byteString = atob(dataURI.split(',')[1]);
        var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        
        var ab = new ArrayBuffer(byteString.length);
        var ia = new Uint8Array(ab);
        
        for (var i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        
        return new Blob([ab], {type: mimeString});
    }
    
    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        ui.showError('Trình duyệt không hỗ trợ camera');
        startCameraBtn.disabled = true;
    }
    await loadCameras();
    
    // Helper loadCameras (để đảm bảo code chạy)
    async function loadCameras() {
        try {
            const videoDevices = await camera.getCameras();
            cameraSelect.innerHTML = '<option value="">Chọn camera</option>';
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${cameraSelect.options.length}`;
                cameraSelect.appendChild(option);
            });
        } catch(e) { console.error(e); }
    }

    // Initial UI state
    updateUI();
});

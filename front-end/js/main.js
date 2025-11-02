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
    
    // Capture image handler
    captureBtn.addEventListener('click', async () => {
        const captureResult = camera.captureImage(videoFeed, canvas);
        if (!captureResult) return;
        
        const { imageData, width, height } = captureResult;
        const captureTime = new Date();
        
        // Thêm ảnh vào store, ảnh mới nhất LUÔN LUÔN ở index cuối.
        store.addImage(imageData); 
        const index = store.getImageCount() - 1;
        
        // Generate metadata
        const metadataObj = metadata.generateImageMetadata(
            imageData,
            index,
            canvas,
            cameraSelect,
            camera.getCurrentStream()
        );
        metadataObj.captureTime = captureTime;
        metadataObj.production = {
            result: 'Đang kiểm tra...',
            confidence: 'N/A'
        }
        store.updateMetadata(index, metadataObj); // Cập nhật metadata cho index 0
        
        // Update UI
        ui.updateImageList();
        
        // Send to API
        (async () => {
            try {
                // Chuyển dataURL (imageData) thành Blob để gửi đi
                // (Hàm sendImageForValidation cần 1 Blob, không phải dataURL)
                const base64Response = await fetch(imageData);
                const blob = await base64Response.blob();

                // Gửi đi kiểm tra
                const validationResult = await api.sendImageForValidation(blob, index);

                ui.updateImageList();

                // CHỈ PHÂN LOẠI NẾU "ĐẠT"
                if (validationResult.hop_le === true) {
                    api.sendImageForClassification(imageData, index) // Gửi đi phân loại cho index 0
                    ui.updateImageList(); // Vẽ lại UI với kết quả API
                    }
            } catch(err) {
                console.error('API error:', err);
                ui.updateImageList(); // Vẽ lại UI nếu có lỗi
            };
        })();
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
        if (!file) return; // Người dùng hủy chọn file
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const imageData = e.target.result; // Đây là dataURL
            const captureTime = new Date();

            // Thêm ảnh vào store (store sẽ unshift), ảnh mới nhất LUÔN LUÔN ở index 0.
            store.addImage(imageData);
            const index = store.getImageCount() - 1;

            // 2. Tạo metadata rút gọn cho file upload
            const metadataObj = {
                captureTime: captureTime,
                basic: {
                    resolution: 'N/A (uploaded)',
                    fileSize: `${(file.size / 1024).toFixed(1)} KB`,
                    format: file.type,
                },
                camera: { cameraId: 'Uploaded File' },
                environment: { timestamp: captureTime.toLocaleString('vi-VN') },
                system: {},
                production: {
                    result: 'Đang kiểm tra...', // Trạng thái ban đầu
                    confidence: 'N/A'
                }
            };
            store.updateMetadata(index, metadataObj); // Cập nhật metadata cho index 0

            // 3. Cập nhật UI (để hiển thị ảnh với badge "Đang kiểm tra...")
            ui.updateImageList();

            // 4. GỌI API KIỂM TRA (Bước 1 của "Lựa chọn 2")
            // Gửi 'file' (File object) đi, không phải dataURL
            api.sendImageForValidation(file, index) // Gửi đi kiểm tra cho index 0
                .then((result) => {
                    // 5. Cập nhật UI lần nữa với kết quả
                    console.log("Validation result:", result.thong_bao);
                    ui.updateImageList();
                })
                .catch(err => {
                    // Lỗi đã được xử lý trong api.js (cập nhật store)
                    console.error('Validation API error:', err);
                    ui.updateImageList(); // Vẽ lại UI nếu có lỗi
                });
        };
        
        // Bắt đầu đọc file
        reader.readAsDataURL(file);

        // Reset input file để người dùng có thể upload lại file đó
        fileUploadInput.value = '';
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
    
    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        ui.showError('Trình duyệt của bạn không hỗ trợ truy cập camera');
        startCameraBtn.disabled = true;
    }
    
    // Initial UI state
    updateUI();
});

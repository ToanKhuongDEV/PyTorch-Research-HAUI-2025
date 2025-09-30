        document.addEventListener('DOMContentLoaded', function() {
            // Khởi tạo các biến và state
            let isStreaming = false;
            let currentStream = null;
            let capturedImages = [];
            
            // Lấy các phần tử DOM
            const videoFeed = document.getElementById('videoFeed');
            const videoPlaceholder = document.getElementById('videoPlaceholder');
            const videoOverlay = document.getElementById('videoOverlay');
            const cameraSelect = document.getElementById('cameraSelect');
            const startCameraBtn = document.getElementById('startCameraBtn');
            const stopCameraBtn = document.getElementById('stopCameraBtn');
            const captureBtn = document.getElementById('captureBtn');
            const systemCameraStatus = document.getElementById('systemCameraStatus');
            const errorMessage = document.getElementById('errorMessage');
            const errorText = document.getElementById('errorText');
            const capturedCount = document.getElementById('capturedCount');
            const emptyState = document.getElementById('emptyState');
            const imageList = document.getElementById('imageList');
            const clearAllBtn = document.getElementById('clearAllBtn');
            const imageModal = document.getElementById('imageModal');
            const modalImage = document.getElementById('modalImage');
            const closeModalBtn = document.getElementById('closeModalBtn');
            const downloadModalBtn = document.getElementById('downloadModalBtn');
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
            
            // Khởi tạo ứng dụng
            getCameras();
            
            // Lấy danh sách camera
            async function getCameras() {
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const videoDevices = devices.filter(device => device.kind === 'videoinput');
                    
                    cameraSelect.innerHTML = '<option value="">Chọn camera</option>';
                    videoDevices.forEach(device => {
                        const option = document.createElement('option');
                        option.value = device.deviceId;
                        option.text = device.label || `Camera ${cameraSelect.options.length}`;
                        cameraSelect.appendChild(option);
                    });
                } catch (err) {
                    showError('Không thể truy cập danh sách camera');
                }
            }
            
            // Bật camera
            async function startCamera() {
                try {
                    const deviceId = cameraSelect.value;
                    if (!deviceId) {
                        showError('Vui lòng chọn một camera');
                        return;
                    }
                    
                    if (currentStream) {
                        currentStream.getTracks().forEach(track => track.stop());
                    }
                    
                    const constraints = {
                        video: {
                            deviceId: { exact: deviceId },
                            width: { ideal: 1920 },
                            height: { ideal: 1080 }
                        }
                    };
                    
                    const stream = await navigator.mediaDevices.getUserMedia(constraints);
                    currentStream = stream;
                    videoFeed.srcObject = stream;
                    
                    // Hiển thị video và ẩn placeholder
                    videoFeed.classList.remove('hidden');
                    videoOverlay.classList.remove('hidden');
                    videoPlaceholder.classList.add('hidden');
                    
                    // Cập nhật trạng thái
                    isStreaming = true;
                    updateCameraStatus(true);
                    startCameraBtn.disabled = true;
                    stopCameraBtn.disabled = false;
                    captureBtn.disabled = false;
                    
                    // Ẩn thông báo lỗi nếu có
                    hideError();
                    
                } catch (err) {
                    showError('Không thể khởi động camera. Vui lòng kiểm tra kết nối.');
                    updateCameraStatus(false);
                }
            }
            
            // Tắt camera
            function stopCamera() {
                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                    currentStream = null;
                }
                
                videoFeed.srcObject = null;
                videoFeed.classList.add('hidden');
                videoOverlay.classList.add('hidden');
                videoPlaceholder.classList.remove('hidden');
                
                isStreaming = false;
                updateCameraStatus(false);
                startCameraBtn.disabled = false;
                stopCameraBtn.disabled = true;
                captureBtn.disabled = true;
            }
            
            // Cập nhật trạng thái camera - FIXED
            function updateCameraStatus(streaming) {
                if (streaming) {
                    systemCameraStatus.textContent = 'Hoạt động';
                    systemCameraStatus.className = 'badge badge-default';
                } else {
                    systemCameraStatus.textContent = 'Tắt';
                    systemCameraStatus.className = 'badge badge-secondary';
                }
            }
            
            // Hiển thị lỗi
            function showError(message) {
                errorText.textContent = message;
                errorMessage.classList.remove('hidden');
            }
            
            // Ẩn lỗi
            function hideError() {
                errorMessage.classList.add('hidden');
            }
            
            // Chụp ảnh
            function captureImage() {
                if (!isStreaming) return;
                
                canvas.width = videoFeed.videoWidth;
                canvas.height = videoFeed.videoHeight;
                ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
                
                const imageData = canvas.toDataURL('image/jpeg', 0.9);
                capturedImages.unshift(imageData);
                
                updateCapturedImages();
            }
            
            // Cập nhật danh sách ảnh đã chụp
            function updateCapturedImages() {
                capturedCount.textContent = `${capturedImages.length} ảnh`;
                
                if (capturedImages.length > 0) {
                    emptyState.classList.add('hidden');
                    imageList.classList.remove('hidden');
                    clearAllBtn.classList.remove('hidden');
                    
                    imageList.innerHTML = '';
                    capturedImages.forEach((image, index) => {
                        const imageItem = document.createElement('div');
                        imageItem.className = 'image-item';
                        
                        imageItem.innerHTML = `
                            <img src="${image}" class="image-thumb" alt="Ảnh ${index + 1}" data-index="${index}">
                            <div class="image-info">
                                <div class="image-name">Ảnh ${index + 1}</div>
                                <div class="image-time">${new Date().toLocaleTimeString('vi-VN')}</div>
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
                        
                        imageList.appendChild(imageItem);
                    });
                    
                    // Thêm event listeners cho các nút
                    document.querySelectorAll('.view-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const index = e.currentTarget.getAttribute('data-index');
                            openImageModal(capturedImages[index]);
                        });
                    });
                    
                    document.querySelectorAll('.download-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const index = e.currentTarget.getAttribute('data-index');
                            downloadImage(capturedImages[index], index);
                        });
                    });
                    
                    document.querySelectorAll('.image-thumb').forEach(img => {
                        img.addEventListener('click', (e) => {
                            const index = e.currentTarget.getAttribute('data-index');
                            openImageModal(capturedImages[index]);
                        });
                    });
                    
                } else {
                    emptyState.classList.remove('hidden');
                    imageList.classList.add('hidden');
                    clearAllBtn.classList.add('hidden');
                }
            }
            
            // Xóa tất cả ảnh
            function clearAllImages() {
                capturedImages = [];
                updateCapturedImages();
            }
            
            // Tải ảnh
            function downloadImage(imageData, index) {
                const link = document.createElement('a');
                link.href = imageData;
                link.download = `metal-surface-${Date.now()}-${index}.jpg`;
                link.click();
            }
            
            // Mở modal xem ảnh
            function openImageModal(imageData) {
                modalImage.src = imageData;
                imageModal.classList.remove('hidden');
            }
            
            // Đóng modal
            function closeImageModal() {
                imageModal.classList.add('hidden');
            }
            
            // Gán sự kiện
            startCameraBtn.addEventListener('click', startCamera);
            stopCameraBtn.addEventListener('click', stopCamera);
            captureBtn.addEventListener('click', captureImage);
            clearAllBtn.addEventListener('click', clearAllImages);
            closeModalBtn.addEventListener('click', closeImageModal);
            downloadModalBtn.addEventListener('click', function() {
                const index = capturedImages.findIndex(img => img === modalImage.src);
                if (index !== -1) {
                    downloadImage(capturedImages[index], index);
                }
            });
            
            // Kiểm tra hỗ trợ camera
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showError('Trình duyệt của bạn không hỗ trợ truy cập camera');
                startCameraBtn.disabled = true;
            }
        });
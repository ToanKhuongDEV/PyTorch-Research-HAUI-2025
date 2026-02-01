/**
 * CAMERA-LIB.JS
 * Chứa: CameraManager, MetadataCalculator
 */

// --- 1. CAMERA MANAGER ---
class CameraManager {
    constructor() {
        this.isStreaming = false;
        this.currentStream = null;
        this.callbacks = {};
    }
    on(event, callback) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(callback);
    }
    trigger(event, ...args) {
        if (this.callbacks[event]) this.callbacks[event].forEach(cb => cb(...args));
    }
    async getCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(d => d.kind === 'videoinput');
        } catch (err) {
            this.trigger('error', 'Không thể truy cập danh sách camera');
            throw err;
        }
    }
    async startCamera(deviceId) {
        try {
            if (!deviceId) return this.trigger('error', 'Vui lòng chọn camera');
            if (this.currentStream) this.currentStream.getTracks().forEach(t => t.stop());

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
            this.currentStream = stream;
            this.isStreaming = true;
            this.trigger('streamStarted', stream);
            this.trigger('statusChanged', true);
        } catch (err) {
            this.trigger('error', 'Lỗi khởi động camera: ' + err.message);
            this.trigger('statusChanged', false);
        }
    }
    stopCamera() {
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(t => t.stop());
            this.currentStream = null;
        }
        this.isStreaming = false;
        this.trigger('streamStopped');
        this.trigger('statusChanged', false);
    }
    getStreamingStatus() { return this.isStreaming; }
    getCurrentStream() { return this.currentStream; }
    
    captureImage(videoFeed, canvas) {
        if (!this.isStreaming) {
            this.trigger('error', 'Camera chưa được bật');
            return null;
        }
        const ctx = canvas.getContext('2d');
        const vw = videoFeed.videoWidth;
        const vh = videoFeed.videoHeight;
        const size = Math.min(vw, vh);
        const sx = (vw - size) / 2;
        const sy = (vh - size) / 2;

        canvas.width = size;
        canvas.height = size;
        ctx.save();
        ctx.translate(size, 0);
        ctx.scale(-1, 1); 
        ctx.drawImage(videoFeed, sx, sy, size, size, 0, 0, size, size);
        ctx.restore();

        return { imageData: canvas.toDataURL('image/jpeg', 0.9), canvas, width: size, height: size };
    }
}

// --- 2. METADATA CALCULATOR ---
class MetadataCalculator {
    generateImageMetadata(imageData, index, canvas, cameraSelect, currentStream) {
        const now = new Date();
        return {
            basic: this.calculateImageProperties(imageData, canvas),
            camera: this.calculateCameraProperties(cameraSelect, currentStream),
            environment: this.calculateEnvironmentProperties(now),
            system: this.calculateSystemProperties(canvas), // Tính toán thật
            production: this.calculateProductionProperties(now)
        };
    }

    calculateImageProperties(imageData, canvas) {
        // Ước lượng size từ base64 (x 0.75)
        const sizeKB = (imageData.length * 0.75 / 1024).toFixed(2);
        return {
            resolution: `${canvas.width} × ${canvas.height} px`,
            format: 'JPEG', 
            fileSize: `${sizeKB} KB`,
            colorDepth: '24-bit (sRGB)'
        };
    }

    calculateCameraProperties(select, stream) {
        const label = select.options[select.selectedIndex]?.text || 'N/A';
        // Lấy thông số thực tế từ Stream nếu có
        let settings = {};
        if (stream) {
            const track = stream.getVideoTracks()[0];
            if (track) settings = track.getSettings();
        }

        return { 
            cameraId: label,
            // Nếu stream hỗ trợ lấy ISO/Focus thì hiển thị, không thì N/A
            iso: settings.iso || 'Auto',
            focus: settings.focusMode || 'Auto',
            sensorResolution: settings.height ? `${settings.height}p` : 'N/A'
        };
    }

    calculateEnvironmentProperties(now) {
        // Đây là thông số giả lập (vì web không có cảm biến nhiệt độ)
        return { 
            timestamp: now.toLocaleString('vi-VN'),
            temperature: 'N/A', // Giả định
            humidity: 'N/A',      // Giả định
            lightIntensity: 'Normal' 
        };
    }

    // --- THUẬT TOÁN TÍNH TOÁN THÔNG SỐ ẢNH ---
    calculateSystemProperties(canvas) {
        try {
            const ctx = canvas.getContext('2d');
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            let totalBrightness = 0;
            const values = [];

            // 1. Tính độ sáng trung bình (Brightness)
            // Duyệt qua từng pixel (bước nhảy 4 vì 1 pixel gồm R, G, B, Alpha)
            // Để tối ưu hiệu năng, ta có thể lấy mẫu (sample) thay vì tính hết nếu ảnh quá lớn
            const step = 4; 
            for (let i = 0; i < data.length; i += step) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                // Công thức Luminance chuẩn: 0.299R + 0.587G + 0.114B
                const bri = 0.299 * r + 0.587 * g + 0.114 * b;
                totalBrightness += bri;
                values.push(bri);
            }

            const pixelCount = values.length;
            const meanBrightness = totalBrightness / pixelCount;

            // 2. Tính Độ tương phản (Contrast) = Độ lệch chuẩn (Standard Deviation)
            let sumDiffSq = 0;
            for (let v of values) {
                sumDiffSq += Math.pow(v - meanBrightness, 2);
            }
            const variance = sumDiffSq / pixelCount;
            const contrast = Math.sqrt(variance);

            // 3. Tính SNR (Tỷ lệ tín hiệu / nhiễu)
            // SNR = Mean / StdDev. Nếu ảnh đen hoàn toàn (contrast=0) thì SNR cao vô cùng.
            const snr = contrast > 0 ? (20 * Math.log10(meanBrightness / contrast)) : 0;

            // 4. Tính Độ sắc nét (Sharpness) - Dùng thuật toán Laplacian đơn giản
            // (Tính sự chênh lệch giữa pixel hiện tại và các pixel lân cận)
            let edgeSum = 0;
            const w = canvas.width;
            // Chỉ duyệt vùng giữa, bỏ qua viền để tránh lỗi biên
            for (let i = 0; i < data.length; i += step) {
                // Đơn giản hóa: so sánh sự khác biệt với pixel kế tiếp để ước lượng độ nét
                if (i + 4 < data.length) {
                    const diff = Math.abs(data[i] - data[i+4]); // So sánh kênh R
                    edgeSum += diff;
                }
            }
            const sharpness = (edgeSum / pixelCount) * 2; // Hệ số nhân để scale cho dễ nhìn

            return {
                brightness: meanBrightness.toFixed(1),
                contrast: contrast.toFixed(1),
                sharpness: sharpness.toFixed(1),
                snr: snr.toFixed(1) + ' dB',
                processingTime: 'Real-time'
            };

        } catch (e) {
            console.error("Lỗi tính toán system properties:", e);
            return { brightness: 'N/A', contrast: 'N/A', sharpness: 'N/A', snr: 'N/A' };
        }
    }

    calculateProductionProperties(now) {
        // Giả lập thông tin sản xuất
        return { 
            productId: `P-${now.getTime().toString().slice(-6)}`,
            batch: `LOT-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}`,
            operator: 'Admin'
        };
    }
}
/**
 * Camera Management Module
 * Quản lý video stream và camera
 */

class CameraManager {
    constructor(store) {
        this.store = store;
        this.isStreaming = false;
        this.currentStream = null;
        this.callbacks = {};
    }

    // Đăng ký callback
    on(event, callback) {
        if (!this.callbacks[event]) {
            this.callbacks[event] = [];
        }
        this.callbacks[event].push(callback);
    }

    // Trigger callback
    trigger(event, ...args) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => callback(...args));
        }
    }

    /**
     * Lấy danh sách camera
     */
    async getCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            return videoDevices;
        } catch (err) {
            this.trigger('error', 'Không thể truy cập danh sách camera');
            throw err;
        }
    }

    /**
     * Bật camera
     * @param {string} deviceId - ID của camera
     */
    async startCamera(deviceId) {
        try {
            if (!deviceId) {
                this.trigger('error', 'Vui lòng chọn một camera');
                return;
            }

            // Dừng stream hiện tại nếu có
            if (this.currentStream) {
                this.currentStream.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                video: {
                    deviceId: { exact: deviceId },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.currentStream = stream;
            this.isStreaming = true;

            this.trigger('streamStarted', stream);
            this.trigger('statusChanged', true);
        } catch (err) {
            this.trigger('error', 'Không thể khởi động camera. Vui lòng kiểm tra kết nối.');
            this.trigger('statusChanged', false);
            throw err;
        }
    }

    /**
     * Tắt camera
     */
    stopCamera() {
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }

        this.isStreaming = false;
        this.trigger('streamStopped');
        this.trigger('statusChanged', false);
    }

    /**
     * Lấy stream hiện tại
     */
    getCurrentStream() {
        return this.currentStream;
    }

    /**
     * Kiểm tra trạng thái streaming
     */
    getStreamingStatus() {
        return this.isStreaming;
    }

    /**
     * Chụp ảnh từ video feed
     * @param {HTMLVideoElement} videoFeed - Video element
     * @param {HTMLCanvasElement} canvas - Canvas element
     */
    captureImage(videoFeed, canvas) {
        if (!this.isStreaming) {
            this.trigger('error', 'Camera chưa được bật');
            return null;
        }

        const ctx = canvas.getContext('2d');
        canvas.width = videoFeed.videoWidth;
        canvas.height = videoFeed.videoHeight;
        ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        return {
            imageData,
            canvas,
            width: canvas.width,
            height: canvas.height
        };
    }
}

// Export class for instantiation in main.js
// const cameraManager = new CameraManager();

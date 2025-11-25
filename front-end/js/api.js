/**
 * API Module
 * Giao tiếp với API server
 */

class APIManager {
    constructor(store) {
        this.store = store;
        this.baseURL = 'http://127.0.0.1:8000';
    }

    /**
     * Gửi ảnh đến API để phân loại
     * @param {string} imageData - Data URL của ảnh
     * @param {number} index - Index của ảnh
     */
    async sendImageForClassification(imageData, index) {
        try {
            // Convert data URL to blob
            const base64Response = await fetch(imageData);
            const blob = await base64Response.blob();

            // Create FormData
            const formData = new FormData();
            formData.append("file", blob, `captured-${Date.now()}.jpg`);

            // Send to API
            const response = await fetch(`${this.baseURL}/predict`, {
                method: "POST",
                body: formData
            });

            const result = await response.json();
            
            // Log response for debugging
            console.log("=== DEBUG API RESPONSE ===");
            console.log("Full response:", result);
            console.log("Class:", result.class);
            console.log("Confidence:", result.confidence);
            console.log("Probabilities:", result.probabilities);
            console.log("===========================");

            if (response.ok && result) {
                const classification = result.class || result.prediction || result.label;
                const confidence = result.confidence || result.score;
                
                if (result.probabilities) {
                    console.log("Xác suất các lớp:", result.probabilities);
                }
                
                // Update metadata in store
                const metadata = this.store.getMetadata(index);
                if (metadata && metadata.production) {
                    metadata.production.result = classification ? 
                        classification.toUpperCase() : "UNKNOWN";
                    metadata.production.confidence = confidence ? 
                        `${(confidence * 100).toFixed(1)}%` : 'N/A';
                    metadata.production.probabilities = result.probabilities || {};
                    this.store.updateMetadata(index, metadata);
                }
                
                return result;
            } else {
                const metadata = this.store.getMetadata(index);
                if (metadata && metadata.production) {
                    metadata.production.result = "API_ERROR";
                    this.store.updateMetadata(index, metadata);
                }
                throw new Error('API error');
            }
        } catch (error) {
            console.error("Lỗi API:", error);
            const metadata = this.store.getMetadata(index);
            if (metadata && metadata.production) {
                metadata.production.result = "NETWORK_ERROR";
                this.store.updateMetadata(index, metadata);
            }
            throw error;
        }
    }

    /**
     * Gửi ảnh đến API để KIỂM TRA TÍNH HỢP LỆ (Validation)
     * (Đây là hàm mới để gọi /kiem-tra-anh)
     * @param {File|Blob} fileOrBlob - File ảnh (từ upload)
     * @param {number} index - Index của ảnh trong store
     */
    async sendImageForValidation(fileOrBlob, index) {
        try {
            // Tạo FormData
            const formData = new FormData();
            // Tên 'image_file' phải khớp với alias 'image_file' trong app.py
            formData.append("file", fileOrBlob, `validate-${Date.now()}.jpg`);

            // Gửi đến API KIỂM TRA
            const response = await fetch(`${this.baseURL}/kiem-tra-anh`, {
                method: "POST",
                body: formData
            });

            const result = await response.json();
            
            // Log response để debug
            console.log("=== DEBUG VALIDATION RESPONSE ===");
            console.log("Full response:", result);
            console.log("================================");

            const metadata = this.store.getMetadata(index);
            if (!metadata) return; // Không tìm thấy metadata

            if (response.ok && result) {
                // Cập nhật metadata với thông báo từ server
                // File ui.js sẽ đọc "result" này để hiển thị badge
                metadata.production.result = result.thong_bao || (result.hop_le ? "ĐẠT CHUẨN" : "KHÔNG ĐẠT");
                metadata.production.confidence = 'N/A'; // Validation không có confidence
                this.store.updateMetadata(index, metadata);
                
                return result;
            } else {
                // Lỗi từ API (vd: 500, 400)
                metadata.production.result = result.thong_bao || "LỖI KIỂM TRA";
                this.store.updateMetadata(index, metadata);
                throw new Error(result.thong_bao || 'API validation error');
            }
        } catch (error) {
            console.error("Lỗi API Kiểm tra:", error);
            const metadata = this.store.getMetadata(index);
            if (metadata && metadata.production) {
                metadata.production.result = "LỖI MẠNG";
                this.store.updateMetadata(index, metadata);
            }
            throw error;
        }
    }

    /**
     * Gửi ảnh xử lý toàn bộ Pipeline (Validation -> YOLO -> SVM)
     * Tối ưu cho Video Realtime
     */
    async processPipeline(fileOrBlob) {
        try {
            const formData = new FormData();
            formData.append("file", fileOrBlob, `frame-${Date.now()}.jpg`);

            const response = await fetch(`${this.baseURL}/process-pipeline`, {
                method: "POST",
                body: formData
            });

            const result = await response.json();
            return result; // Trả về JSON chứa status, box, message, confidence
        } catch (error) {
            console.error("Pipeline Error:", error);
            return { status: "error", message: "Lỗi kết nối" };
        }
    }
}

// Export class for instantiation in main.js
// const apiManager = new APIManager();

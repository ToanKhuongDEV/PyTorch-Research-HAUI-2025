/**
 * Metadata Calculation Module
 * Tính toán metadata cho ảnh
 */

class MetadataCalculator {
    /**
     * Tạo metadata cho ảnh
     * @param {string} imageData - Data URL của ảnh
     * @param {number} index - Index của ảnh
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {HTMLSelectElement} cameraSelect - Camera select element
     * @param {MediaStream} currentStream - Current video stream
     * @returns {Object} - Metadata object
     */
    generateImageMetadata(imageData, index, canvas, cameraSelect, currentStream) {
        const now = new Date();
        
        return {
            basic: this.calculateImageProperties(imageData, canvas),
            camera: this.calculateCameraProperties(cameraSelect, currentStream),
            environment: this.calculateEnvironmentProperties(now),
            system: this.calculateSystemProperties(canvas),
            production: this.calculateProductionProperties(now)
        };
    }

    /**
     * Tính thông số cơ bản của ảnh
     */
    calculateImageProperties(imageData, canvas) {
        const imageDataUrl = imageData;
        const base64Data = imageDataUrl.split(',')[1];
        const binaryData = atob(base64Data);
        const fileSizeBytes = binaryData.length;
        const fileSizeKB = (fileSizeBytes / 1024).toFixed(2);
        
        // Calculate compression ratio
        const uncompressedSize = canvas.width * canvas.height * 3;
        const compressionRatio = ((1 - fileSizeBytes / uncompressedSize) * 100).toFixed(1);
        
        return {
            resolution: `${canvas.width} × ${canvas.height} px`,
            dpi: 'N/A',
            format: 'JPEG',
            fileSize: `${fileSizeKB} KB`,
            colorDepth: '24-bit',
            colorSpace: 'RGB',
            compression: `${compressionRatio}%`
        };
    }

    /**
     * Tính thông số camera
     */
    calculateCameraProperties(cameraSelect, currentStream) {
        const cameraId = cameraSelect.options[cameraSelect.selectedIndex]?.text || 'N/A';
        
        let videoConstraints = null;
        if (currentStream && currentStream.getVideoTracks().length > 0) {
            const track = currentStream.getVideoTracks()[0];
            const settings = track.getSettings();
            videoConstraints = settings;
        }
        
        return {
            cameraId: cameraId,
            sensorType: 'N/A',
            sensorResolution: videoConstraints?.width && videoConstraints?.height ? 
                `${Math.round((videoConstraints.width * videoConstraints.height) / 1000000 * 10) / 10} MP` : 'N/A',
            lens: 'N/A',
            iso: 'N/A',
            shutterSpeed: 'N/A',
            whiteBalance: 'N/A',
            exposure: 'N/A',
            focalLength: 'N/A',
            focus: 'N/A',
            flash: 'N/A'
        };
    }

    /**
     * Tính thông số môi trường
     */
    calculateEnvironmentProperties(now) {
        return {
            timestamp: now.toLocaleString('vi-VN'),
            temperature: 'N/A',
            humidity: 'N/A',
            lightIntensity: 'N/A',
            conveyorSpeed: 'N/A',
            location: 'N/A'
        };
    }

    /**
     * Tính thông số hệ thống
     */
    calculateSystemProperties(canvas) {
        try {
            const ctx = canvas.getContext('2d');
            const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageDataObj.data;
            const pixelCount = canvas.width * canvas.height;
            
            // Calculate brightness
            let totalLuminance = 0;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                totalLuminance += luminance;
            }
            const brightness = (totalLuminance / pixelCount).toFixed(1);
            
            // Calculate contrast
            let variance = 0;
            const meanLuminance = totalLuminance / pixelCount;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                variance += Math.pow(luminance - meanLuminance, 2);
            }
            const contrast = Math.sqrt(variance / pixelCount).toFixed(1);
            
            // Calculate sharpness
            let sharpness = 0;
            for (let y = 1; y < canvas.height - 1; y++) {
                for (let x = 1; x < canvas.width - 1; x++) {
                    const idx = (y * canvas.width + x) * 4;
                    const center = data[idx];
                    const top = data[idx - canvas.width * 4];
                    const bottom = data[idx + canvas.width * 4];
                    const left = data[idx - 4];
                    const right = data[idx + 4];
                    
                    const laplacian = Math.abs(4 * center - top - bottom - left - right);
                    sharpness += laplacian;
                }
            }
            const sharpnessValue = (sharpness / ((canvas.width - 2) * (canvas.height - 2))).toFixed(1);
            
            // Calculate SNR
            const signal = meanLuminance;
            const noise = Math.sqrt(variance / pixelCount);
            const snr = noise > 0 ? (20 * Math.log10(signal / noise)).toFixed(1) : 'N/A';
            
            return {
                firmware: 'N/A',
                machineId: 'N/A',
                histogram: 'N/A',
                contrast: contrast,
                brightness: brightness,
                sharpness: sharpnessValue,
                snr: snr !== 'N/A' ? `${snr} dB` : 'N/A',
                fps: 'N/A'
            };
        } catch (error) {
            console.warn('Error calculating system properties:', error);
            return {
                firmware: 'N/A',
                machineId: 'N/A',
                histogram: 'N/A',
                contrast: 'N/A',
                brightness: 'N/A',
                sharpness: 'N/A',
                snr: 'N/A',
                fps: 'N/A'
            };
        }
    }

    /**
     * Tính thông số sản xuất
     */
    calculateProductionProperties(now) {
        return {
            productId: `PROD-${now.getTime()}`,
            barcode: 'N/A',
            shift: 'N/A',
            batch: 'N/A',
            operator: 'N/A',
            result: 'N/A'
        };
    }
}

// Export class for instantiation in main.js
// const metadataCalculator = new MetadataCalculator();

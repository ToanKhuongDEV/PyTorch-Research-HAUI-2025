// --- CẤU HÌNH ---
const FPS_TARGET = 2; 
const FRAME_INTERVAL = 1000 / FPS_TARGET;

// --- DOM ELEMENTS ---
const cameraSelect = document.getElementById('cameraSelect');
const startBtn = document.getElementById('start-video');
const stopBtn = document.getElementById('stop-video');
const displayDiv = document.getElementById('video-display');
const placeholder = document.getElementById('placeholder');
const logContainer = document.getElementById('log-container');

const previewCanvas = document.getElementById('snapshot-preview');
const previewCtx = previewCanvas.getContext('2d');

const stCam = document.getElementById('status-cam');
const stFps = document.getElementById('status-fps');
const stObj = document.getElementById('status-objects');
const stLast = document.getElementById('status-last-defect');

// Logic Variables
let videoElement = document.createElement('video');
videoElement.autoplay = true;
videoElement.playsInline = true;

let canvas = document.createElement('canvas');
canvas.className = 'video-feed';
canvas.style.width = "100%";
canvas.style.height = "100%";
canvas.style.objectFit = "cover";
canvas.style.aspectRatio = "1/1";
let ctx = canvas.getContext('2d');

let isRunning = false;
let stream = null;
let lastTime = 0;
let frameCount = 0;
let lastFpsTime = 0;
let objectCount = 0;

const api = new APIManager({ getMetadata: () => {}, updateMetadata: () => {} });

// --- HÀM LOAD DANH SÁCH CAMERA ---
async function loadCameras() {
    try {
        // Lấy danh sách camera mà không xin quyền ngay lập tức (tránh hiện popup)
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        cameraSelect.innerHTML = '<option value="">Select Camera</option>';
        
        if (videoDevices.length === 0) {
            const option = document.createElement('option');
            option.text = "No camera found";
            cameraSelect.appendChild(option);
            return;
        }

        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });
    } catch (err) {
        console.error("Error loading camera:", err);
        cameraSelect.innerHTML = '<option value="">Access denied</option>';
    }
}

// Gọi load camera ngay khi trang tải xong
document.addEventListener('DOMContentLoaded', loadCameras);

// --- HÀM KHỞI ĐỘNG ---
startBtn.addEventListener('click', async () => {
    try {
        // Lấy ID camera đang chọn
        const selectedDeviceId = cameraSelect.value;
        const constraints = {
            video: {
                deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                width: { ideal: 1280 },
                height: { ideal:1720 }
            }
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            previewCanvas.width = videoElement.videoWidth;
            previewCanvas.height = videoElement.videoHeight;

            placeholder.classList.add('hidden');
            if (!displayDiv.contains(canvas)) {
                displayDiv.appendChild(canvas);
            }
            
            isRunning = true;
            // Disable select khi đang chạy
            cameraSelect.disabled = true; 
            updateStatusUI(true);
            loop(0);
        };
    } catch (err) {
        alert("Cannot access camera: " + err.message);
    }
});

// --- HÀM DỪNG ---
stopBtn.addEventListener('click', () => {
    isRunning = false;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    placeholder.classList.remove('hidden');
    if (displayDiv.contains(canvas)) {
        displayDiv.removeChild(canvas);
    }
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    
    // Enable lại select
    cameraSelect.disabled = false;
    updateStatusUI(false);
});

// --- UI UTILS & LOGIC KHÁC ---
function updateStatusUI(active) {
    if (active) {
        stCam.textContent = "RUNNING";
        stCam.className = "badge badge-success";
        stCam.style.color = "";
        
        startBtn.disabled = true;
        stopBtn.disabled = false;
        cameraSelect.disabled = true;
    } else {
        stCam.textContent = "STOPPED";
        stCam.className = "badge badge-destructive";
        stCam.style.color = "";
        
        stFps.textContent = "0";
        startBtn.disabled = false;
        stopBtn.disabled = true;
        cameraSelect.disabled = false;
    }
}

function clearLogs() {
    logContainer.innerHTML = '<div class="empty-state"><p style="color: #aaa; text-align: center; margin-top: 20px;">No data available</p></div>';
    objectCount = 0;
    stObj.textContent = 0;
    if (stLast) stLast.textContent = "---";
}

function addLog(message, conf, colorClass, imageSrc) {
    const logContainer = document.getElementById('log-container');
    const emptyState = logContainer.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const item = document.createElement('div');
    item.className = 'defect-log-item'; // Class mới đồng bộ style

    const time = new Date().toLocaleTimeString('vi-VN');
    
    item.innerHTML = `
        <img src="${imageSrc}" class="log-thumb" alt="defect">
        <div class="log-info">
            <div class="log-title">${message}</div>
            <div class="log-meta">
                <span>Confidence: ${(conf*100).toFixed(1)}%</span>
                <span>${time}</span>
            </div>
        </div>
    `;

    // Chèn lỗi mới lên đầu danh sách
    logContainer.insertBefore(item, logContainer.firstChild);

    // Giới hạn số lượng bản ghi hiển thị (ví dụ 30)
    if (logContainer.children.length > 30) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

async function loop(timestamp) {
    if (!isRunning) return;

    // CẮT ẢNH VUÔNG CÓ ZOOM
    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    
    // Chưa load được kích thước video thì đợi frame sau
    if (vw === 0 || vh === 0) {
        requestAnimationFrame(loop);
        return;
    }

    const zoomSlider = document.getElementById('zoomSlider');
    const zoomVal = zoomSlider ? parseFloat(zoomSlider.value) : 1;
    
    const rawCropSize = Math.min(vw, vh) / zoomVal;
    const sx = (vw - rawCropSize) / 2;
    const sy = (vh - rawCropSize) / 2;
    const displaySize = Math.floor(Math.min(vw, vh));

    // Đặt kích thước canvas xử lý thành vuông (giữ nguyên độ phân giải gốc cao nhất)
    if (canvas.width !== displaySize || canvas.height !== displaySize) {
        canvas.width = displaySize;
        canvas.height = displaySize;
        // Preview canvas vuông
        previewCanvas.width = displaySize;
        previewCanvas.height = displaySize;
    }

    // Vẽ phần trung tâm video đã zoom vào canvas
    ctx.save();
    ctx.translate(displaySize, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, sx, sy, rawCropSize, rawCropSize, 0, 0, displaySize, displaySize);
    ctx.restore();

    frameCount++;
    if (timestamp - lastFpsTime >= 1000) {
        stFps.textContent = frameCount;
        frameCount = 0;
        lastFpsTime = timestamp;
    }

    if (timestamp - lastTime > FRAME_INTERVAL) {
        lastTime = timestamp;
        processFrame();
    }
    requestAnimationFrame(loop);
}

async function processFrame() {
    previewCtx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
    canvas.toBlob(async (blob) => {
        if (!blob) return;
        const result = await api.processPipeline(blob);
        handleResult(result);
    }, 'image/jpeg', 0.8);
}

// Hàm này gọi lên server để reset biến đếm về 0
async function resetServerCount() {
    try {
        await fetch('http://127.0.0.1:8000/reset-count', { method: 'POST' });
        clearLogs(); // Xóa log cũ trên giao diện
        stObj.textContent = "0"; // Reset số hiển thị về 0
        alert("System counter reset!");
    } catch (e) {
        console.error(e);
    }
}

function handleResult(result) {
ctx.lineWidth = 3;
    ctx.font = "600 18px Inter, Arial, sans-serif";

    if (result.total_count !== undefined) {
        stObj.textContent = result.total_count;
    }

    if (result.status === 'defect_found' && result.box) {
        const [x1, y1, x2, y2] = result.box;
        
        // --- GIỮ NGUYÊN PHẦN VẼ BOX TRÊN CANVAS CHÍNH ---
        ctx.strokeStyle = "red";
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.fillStyle = "red";
        ctx.fillRect(x1, y1 - 45, 180, 45); 
        ctx.fillStyle = "white";
        ctx.font = "700 16px Inter, Arial, sans-serif";
        ctx.fillText(`${result.message}`, x1 + 5, y1 - 25);

        // --- BẮT ĐẦU PHẦN SỬA ĐỂ ĐẨY VÀO NHẬT KÝ ---
        
        // 1. Chụp lại ảnh từ previewCanvas (ảnh frame đã xử lý)
        const defectSnapshot = previewCanvas.toDataURL('image/jpeg', 0.5); // 0.5 là chất lượng thấp để nhẹ web

        // 2. Gọi addLog với ảnh vừa chụp
        addLog(
            `#${result.track_id || '?'} - ${result.message}`, 
            result.confidence, 
            "red", 
            defectSnapshot
        );

        // Cập nhật trạng thái cuối
        if (stLast) {
            stLast.textContent = result.message;
            stLast.className = "badge badge-destructive";
        }
    }
    else if (result.status === 'no_object') {
        ctx.fillStyle = "yellow";
        ctx.fillText("Waiting for object...", 20, 30);
        
        if (stLast) {
            stLast.textContent = "Empty";
            stLast.className = "badge badge-success";
        }
    } 
    else if (result.status === 'invalid_domain') {
        ctx.fillStyle = "gray";
        ctx.fillText("Invalid domain", 20, 30);
        
        if (stLast) {
            stLast.textContent = "Invalid domain";
            stLast.className = "badge badge-warning";
        }
    }
}

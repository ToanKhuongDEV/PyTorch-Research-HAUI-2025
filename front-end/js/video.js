// --- CẤU HÌNH ---
const FPS_TARGET = 5; 
const FRAME_INTERVAL = 1000 / FPS_TARGET;

// --- DOM ELEMENTS ---
const cameraSelect = document.getElementById('cameraSelect'); // [MỚI]
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
canvas.style.width = "100%";
canvas.style.height = "100%";
canvas.style.objectFit = "contain";
let ctx = canvas.getContext('2d');

let isRunning = false;
let stream = null;
let lastTime = 0;
let frameCount = 0;
let lastFpsTime = 0;
let objectCount = 0;

const api = new APIManager({ getMetadata: () => {}, updateMetadata: () => {} });

// --- [MỚI] HÀM LOAD DANH SÁCH CAMERA ---
async function loadCameras() {
    try {
        // Xin quyền trước để lấy được tên thiết bị (Label)
        await navigator.mediaDevices.getUserMedia({ video: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        cameraSelect.innerHTML = '';
        
        if (videoDevices.length === 0) {
            const option = document.createElement('option');
            option.text = "Không tìm thấy camera";
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
        console.error("Lỗi load camera:", err);
        cameraSelect.innerHTML = '<option value="">Lỗi quyền truy cập</option>';
    }
}

// Gọi load camera ngay khi trang tải xong
document.addEventListener('DOMContentLoaded', loadCameras);

// --- HÀM KHỞI ĐỘNG (CẬP NHẬT) ---
startBtn.addEventListener('click', async () => {
    try {
        // [MỚI] Lấy ID camera đang chọn
        const selectedDeviceId = cameraSelect.value;
        const constraints = {
            video: {
                deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                width: { ideal: 640 }, // Ưu tiên độ phân giải này
                height: { ideal: 480 },
                frameRate: { ideal: 15 }
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
        alert("Không thể truy cập camera: " + err.message);
    }
});

// --- HÀM DỪNG (CẬP NHẬT) ---
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

// --- UI UTILS & LOGIC KHÁC (GIỮ NGUYÊN) ---
function updateStatusUI(active) {
    if (active) {
        stCam.textContent = "Đang chạy";
        stCam.style.color = "#10b981";
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        stCam.textContent = "Đang tắt";
        stCam.style.color = "#e74c3c";
        stFps.textContent = "0";
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

function clearLogs() {
    logContainer.innerHTML = '<div class="empty-state"><p style="color: #aaa; text-align: center; margin-top: 20px;">Chưa có dữ liệu</p></div>';
    objectCount = 0;
    stObj.textContent = 0;
    stLast.textContent = "---";
}

function addLog(message, conf, colorClass) {
    const emptyState = logContainer.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const item = document.createElement('div');
    item.className = 'defect-item'; 
    item.style.marginBottom = '10px';
    item.style.padding = '10px';
    item.style.borderLeft = `4px solid ${colorClass}`;
    item.style.background = '#f8f9fa';
    item.style.borderRadius = '4px';

    const time = new Date().toLocaleTimeString('vi-VN');
    
    item.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
            <strong>${message}</strong>
            <span style="font-size: 12px; color: #666;">${time}</span>
        </div>
        <div style="font-size: 13px; margin-top: 4px;">Độ tin cậy: ${(conf*100).toFixed(1)}%</div>
    `;

    logContainer.insertBefore(item, logContainer.firstChild);

    if (logContainer.children.length > 20) {
        logContainer.removeChild(logContainer.lastChild);
    }

    stLast.textContent = message;
}

async function loop(timestamp) {
    if (!isRunning) return;
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

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
        alert("Đã reset bộ đếm hệ thống!");
    } catch (e) {
        console.error(e);
    }
}

function handleResult(result) {
    ctx.lineWidth = 3;
    ctx.font = "18px Arial";

    // 1. CẬP NHẬT SỐ LƯỢNG (QUAN TRỌNG)
    // Nếu server trả về total_count, cập nhật ngay lên giao diện
    if (result.total_count !== undefined) {
        stObj.textContent = result.total_count;
    }

    if (result.status === 'defect_found' && result.box) {
        const [x1, y1, x2, y2] = result.box;
        
        // Vẽ khung
        ctx.strokeStyle = "red";
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        
        // Vẽ nền chữ (Cao hơn chút để chứa 2 dòng text)
        ctx.fillStyle = "red";
        ctx.fillRect(x1, y1 - 45, 180, 45); 
        
        // Dòng 1: Tên lỗi
        ctx.fillStyle = "white";
        ctx.font = "bold 16px Arial";
        ctx.fillText(`${result.message}`, x1 + 5, y1 - 25);
        
        // Dòng 2: ID vật thể + Độ tin cậy
        ctx.font = "14px Arial";
        // Nếu có track_id thì hiện ID, nếu không thì hiện "New"
        const idText = result.track_id ? `ID: #${result.track_id}` : "ID: New";
        ctx.fillText(`${idText} | ${(result.confidence * 100).toFixed(0)}%`, x1 + 5, y1 - 5);

        // Cập nhật text preview dưới ảnh nhỏ
        resultText.textContent = `⚠️ #${result.track_id || '?'} - ${result.message}`;
        resultText.style.color = "#e74c3c";

        // Thêm vào nhật ký
        addLog(`#${result.track_id || '?'} - ${result.message}`, result.confidence, "red");
    } 
    else if (result.status === 'no_object') {
        ctx.fillStyle = "yellow";
        ctx.fillText("Đang chờ vật thể...", 20, 30);
        
        resultText.textContent = "✅ Trống";
        resultText.style.color = "#10b981";
    } 
    else if (result.status === 'invalid_domain') {
        ctx.fillStyle = "gray";
        ctx.fillText("Ảnh sai domain", 20, 30);
        
        resultText.textContent = "⛔ Sai domain";
        resultText.style.color = "#95a5a6";
    }
}
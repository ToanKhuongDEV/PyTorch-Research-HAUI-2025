const video = document.getElementById("video");
const deviceSelect = document.getElementById("deviceSelect");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const captureBtn = document.getElementById("captureBtn");
const statusText = document.getElementById("statusText");
const galleryContainer = document.getElementById("galleryContainer");
const statusIndicator = document.querySelector(".status-indicator");
const photoCount = document.querySelector(".info-item:nth-child(2) .info-value");

let currentStream = null;
let capturedPhotos = 0;

// Lấy danh sách camera
async function getDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        deviceSelect.innerHTML = "";
        videoDevices.forEach((device, i) => {
            const option = document.createElement("option");
            option.value = device.deviceId;
            option.text = device.label || `Camera ${i + 1}`;
            deviceSelect.appendChild(option);
        });
    } catch (err) {
        console.error("Lỗi khi lấy danh sách thiết bị:", err);
        statusText.textContent = "Trạng thái: Lỗi khi tải danh sách camera";
    }
}

// Bật camera
async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
    }

    const deviceId = deviceSelect.value;
    const constraints = {
        video: { deviceId: deviceId ? { exact: deviceId } : undefined },
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
        statusText.textContent = "Trạng thái: đang bật camera";
        statusIndicator.classList.add("active");
        startBtn.disabled = true;
        stopBtn.disabled = false;
        captureBtn.disabled = false;
        
        // Xóa thông báo "chưa có ảnh" nếu đã có ảnh
        if (galleryContainer.querySelector(".photo-item:not(img)")) {
            galleryContainer.innerHTML = "";
        }
    } catch (err) {
        console.error(err);
        statusText.textContent = "Trạng thái: lỗi khi bật camera";
    }
}

// Tắt camera
function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
        currentStream = null;
    }
    video.srcObject = null;
    statusText.textContent = "Trạng thái: đã tắt camera";
    statusIndicator.classList.remove("active");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    captureBtn.disabled = true;
}

// Chụp ảnh
function capturePhoto() {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width, 0); // lật lại giống gương
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    
    // Tạo phần tử ảnh mới
    const photoElement = document.createElement("div");
    photoElement.className = "photo-item";
    photoElement.appendChild(img);
    
    // Thêm vào gallery
    if (galleryContainer.querySelector(".photo-item:not(img)")) {
        galleryContainer.innerHTML = "";
    }
    galleryContainer.appendChild(photoElement);
    
    // Cập nhật số lượng ảnh đã chụp
    capturedPhotos++;
    photoCount.textContent = capturedPhotos;
}

// Event listeners
startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
captureBtn.addEventListener("click", capturePhoto);

// Khởi tạo
getDevices();
deviceSelect.addEventListener("change", () => {
    if (currentStream) {
        startCamera();
    }
});

// Kiểm tra hỗ trợ camera
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusText.textContent = "Trình duyệt không hỗ trợ truy cập camera";
    startBtn.disabled = true;
}
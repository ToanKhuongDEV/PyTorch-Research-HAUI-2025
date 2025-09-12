const video = document.getElementById("video");
const deviceSelect = document.getElementById("deviceSelect");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const captureBtn = document.getElementById("captureBtn");
const statusText = document.getElementById("statusText");
const latestPhoto = document.getElementById("latestPhoto");

let currentStream = null;

// Lấy danh sách camera
async function getDevices() {
	const devices = await navigator.mediaDevices.enumerateDevices();
	const videoDevices = devices.filter((d) => d.kind === "videoinput");
	deviceSelect.innerHTML = "";
	videoDevices.forEach((device, i) => {
		const option = document.createElement("option");
		option.value = device.deviceId;
		option.text = device.label || `Camera ${i + 1}`;
		deviceSelect.appendChild(option);
	});
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
		startBtn.disabled = true;
		stopBtn.disabled = false;
		captureBtn.disabled = false;
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
	latestPhoto.innerHTML = "";
	latestPhoto.appendChild(img);
}

// Event listeners
startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
captureBtn.addEventListener("click", capturePhoto);

getDevices();
deviceSelect.addEventListener("change", () => {
	if (currentStream) {
		startCamera();
	}
});

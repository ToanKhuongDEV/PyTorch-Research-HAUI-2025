# transferAPI/app.py
import io
import os
import numpy as np
import joblib
from PIL import Image, ImageDraw

import torch
import torchvision.models as models
import torchvision.transforms as transforms
from ultralytics import YOLO

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from model_def import SimpleResNet, BasicBlock 

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- KHAI BÁO BIẾN TOÀN CỤC ---
# 1. Các biến cho mô hình PHÂN LOẠI (SVM)
model_svm = None
classes = None
scaler = None
svm = None
transform_svm = None

# 2. Các biến cho mô hình KIỂM TRA (Validation)
model_validation = None
vector_trung_binh = None
nguong_khoang_cach = None
transform_validation = None

# 3. Các biến cho mô hình YOLO
model_yolo = None

# --- KHỞI TẠO APP FASTAPI ---
app = FastAPI(title="API AI Pipeline: Validation -> YOLO -> Classification")

# Cho phép CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SỰ KIỆN KHỞI ĐỘNG SERVER ---
@app.on_event("startup")
async def startup_event():
    """
    Hàm này sẽ chạy 1 LẦN DUY NHẤT khi server khởi động
    để tải TẤT CẢ model vào bộ nhớ.
    """
    # Khai báo để có thể gán vào biến toàn cục
    global model_svm, classes, scaler, svm, transform_svm
    global model_validation, vector_trung_binh, nguong_khoang_cach, transform_validation
    global model_yolo

    print("--- Bắt đầu tải model ---")
    
    # === 1. TẢI MÔ HÌNH PHÂN LOẠI (SVM) ===
    try:
        print(" * (SVM) Đang tải classes...")
        classes = np.load("saved/classes.npy", allow_pickle=True).tolist()
        num_classes = len(classes)
        
        print(" * (SVM) Đang tải mô hình SimpleResNet...")
        model_svm = SimpleResNet(BasicBlock, [1,1,1], num_classes).to(DEVICE)
        model_svm.load_state_dict(torch.load("saved/resnet_weights.pth", map_location=DEVICE))
        model_svm.eval()
        
        print(" * (SVM) Đang tải scaler...")
        scaler = joblib.load("saved/scaler.pkl")
        
        print(" * (SVM) Đang tải mô hình SVM...")
        svm = joblib.load("saved/svm_model.pkl")
        
        # Định nghĩa transform cho SVM
        transform_svm = transforms.Compose([
            transforms.Grayscale(num_output_channels=1),
            transforms.Resize((200, 200)),
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5])
        ])
        print(" * Tải mô hình PHÂN LOẠI (SVM) thành công.")
    except Exception as e:
        print(f"!!! LỖI khi tải mô hình PHÂN LOẠI (SVM): {e}")
        
    # === 2. TẢI MÔ HÌNH KIỂM TRA (VALIDATION) ===
    try:
        FILE_VECTOR_TRUNG_BINH = "saved/vector_trung_binh.npy"
        FILE_NGUONG_KHOANG_CACH = "saved/nguong_khoang_cach.txt"
        
        print(" * (Validation) Đang tải mô hình ResNet50...")
        model_resnet = models.resnet50(weights='IMAGENET1K_V1')
        model_validation = torch.nn.Sequential(*list(model_resnet.children())[:-1])
        model_validation.to(DEVICE).eval()
        
        print(f" * (Validation) Đang tải vector trung bình từ {FILE_VECTOR_TRUNG_BINH}...")
        vector_trung_binh_numpy = np.load(FILE_VECTOR_TRUNG_BINH)
        vector_trung_binh = torch.from_numpy(vector_trung_binh_numpy).to(DEVICE)
        
        print(f" * (Validation) Đang tải ngưỡng khoảng cách từ {FILE_NGUONG_KHOANG_CACH}...")
        with open(FILE_NGUONG_KHOANG_CACH, 'r') as f:
            nguong_khoang_cach = float(f.read())
            
        # Định nghĩa transform cho Validation
        transform_validation = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        
        print(" * Tải mô hình KIỂM TRA (Validation) thành công.")
    except Exception as e:
        print(f"!!! LỖI khi tải mô hình KIỂM TRA (Validation): {e}")
        print("!!! >>> Vui lòng chạy file 'extract_vector.py' trước khi chạy server! <<<")

    try:
        yolo_path = "saved/yolo.pt" if os.path.exists("saved/yolo.pt") else "yolo.pt"
        if os.path.exists(yolo_path):
            print(f" * (YOLO) Đang tải mô hình YOLO từ {yolo_path}...")
            model_yolo = YOLO(yolo_path)
            # model_yolo.to(DEVICE).eval()
            print(" * (YOLO) Tải mô hình YOLO thành công.")
        else:
            print(f"!!! LỖI: Không tìm thấy mô hình YOLO tại {yolo_path}")
    except Exception as e:
        print(f"!!! LỖI khi tải mô hình YOLO: {e}")

    print("--- Tải xong! Server sẵn sàng. ---")


# --- HELPER FUNCTIONS ---
def get_validation_vector(img):
    img_t = transform_validation(img)
    batch_t = torch.unsqueeze(img_t, 0).to(DEVICE)
    with torch.no_grad():
        vector = model_validation(batch_t)
    return vector.flatten()

def get_svm_prediction(img):
    tensor = transform_svm(img).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        feats = model_svm(tensor, feature_extract=True).cpu().numpy()
    feats_scaled = scaler.transform(feats)
    probs = svm.predict_proba(feats_scaled)[0]
    pred_idx = int(np.argmax(probs))
    return classes[pred_idx], float(probs[pred_idx])

# --- ENDPOINT TỐI ƯU CHO REALTIME ---
@app.post("/process-pipeline")
async def process_pipeline(file: UploadFile = File(...)):
    """
    Xử lý toàn bộ quy trình: Validation -> YOLO -> SVM
    Input: Ảnh raw
    Output: JSON chứa kết quả cuối cùng
    """
    # Kiểm tra model loaded
    if not all([model_validation, model_yolo, model_svm]):
        return JSONResponse(status_code=503, content={
            "status": "error", "message": "Models not loaded"
        })

    try:
        # 1. Đọc ảnh
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")

        # === BƯỚC 1: VALIDATION (Kiểm tra domain) ===
        vec_moi = get_validation_vector(img)
        dist = torch.dist(vec_moi, vector_trung_binh).item()
        
        if dist > nguong_khoang_cach:
            return JSONResponse({
                "status": "invalid_domain",
                "message": "Ảnh không hợp lệ (Sai domain)",
                "distance": dist,
                "box": None
            })

        # === BƯỚC 2: YOLO (Tìm vật thể) ===
        # Chạy YOLO
        results = model_yolo(img, verbose=False)
        
        detected = False
        best_box = None
        
        # Kiểm tra xem có detection nào không
        for r in results:
            if len(r.boxes) > 0:
                detected = True
                # Lấy box có confidence cao nhất
                # box format: [x1, y1, x2, y2]
                box = r.boxes[0] 
                best_box = box.xyxy[0].tolist() # [x1, y1, x2, y2]
                break 
        
        if not detected:
            return JSONResponse({
                "status": "no_object",
                "message": "Không có vật thể",
                "distance": dist,
                "box": None
            })

        # === BƯỚC 3: SVM (Phân loại lỗi) ===
        # (Nếu YOLO tìm thấy vật -> Chạy SVM để phân loại lỗi cụ thể)
        
        # Option A: Cắt ảnh theo box YOLO rồi đưa vào SVM (Độ chính xác cao hơn nếu vật nhỏ)
        crop_img = img.crop((best_box[0], best_box[1], best_box[2], best_box[3]))
        label, conf = get_svm_prediction(crop_img)
        
        # Option B: Đưa toàn bộ ảnh vào SVM (Như cũ - An toàn hơn nếu SVM train với ảnh full)
        # label, conf = get_svm_prediction(img)

        return JSONResponse({
            "status": "defect_found",
            "message": label, # Tên lỗi (VD: Scratch, Dent...)
            "confidence": conf,
            "box": best_box, # Trả về tọa độ để vẽ lên video
            "distance": dist
        })

    except Exception as e:
        print(f"Error: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})
# --- Cách chạy server ---
# 1. Mở terminal, đi tới thư mục "transferAPI"
# 2. Chạy lệnh: python -m uvicorn app:app --reload --port 8000



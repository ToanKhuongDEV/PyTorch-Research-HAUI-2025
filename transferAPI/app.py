# transferAPI/app.py
import io
import os
import numpy as np
import joblib
from PIL import Image, ImageDraw
from datetime import datetime, timedelta
import random
import time

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

# --- BIẾN TOÀN CỤC MỚI CHO TRACKING ---
track_history = {} # Lưu vết di chuyển (nếu cần vẽ đường đi)
counted_ids = set() # Lưu các ID duy nhất đã đếm được

@app.post("/reset-count")
async def reset_count():
    """Reset bộ đếm khi bắt đầu phiên mới"""
    global counted_ids
    counted_ids = set()
    return {"status": "ok", "message": "Đã reset bộ đếm"}


# --- HÀM TẠO DỮ LIỆU GIẢ (MOCK DATA) ---
def generate_mock_data():
    data = []
    defect_types = ["Vết xước", "Vết lõm", "Rỉ sét", "Nứt bề mặt", "Biến dạng"]
    
    # Tạo 100 bản ghi trong 24h qua
    now = datetime.now()
    
    for i in range(100):
        # Random thời gian lùi dần về quá khứ (mỗi log cách nhau vài phút)
        timestamp = now - timedelta(minutes=random.randint(1, 1440)) # 1440 phút = 24h
        
        # Random trạng thái (80% là OK, 20% là NG)
        is_defect = random.choices([True, False], weights=[0.2, 0.8])[0]
        
        status = "NG" if is_defect else "OK"
        defect_type = random.choice(defect_types) if is_defect else "None"
        confidence = round(random.uniform(0.75, 0.99), 2) if is_defect else 1.0
        process_time = round(random.uniform(150, 400), 1) # 150ms - 400ms
        
        log_entry = {
            "id": i + 1,
            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "status": status,
            "defect_type": defect_type,
            "confidence": confidence,
            "process_time": process_time
        }
        data.append(log_entry)
    
    # Sắp xếp lại theo thời gian mới nhất lên đầu
    data.sort(key=lambda x: x['timestamp'], reverse=True)
    return data

HISTORY_LOG = generate_mock_data()


# --- CẬP NHẬT ENDPOINT PIPELINE ---
@app.post("/process-pipeline")
async def process_pipeline(file: UploadFile = File(...)):
    global counted_ids, HISTORY_LOG

    start_time = time.time() # Bắt đầu đo thời gian

    if not all([model_validation, model_yolo, model_svm]):
        return JSONResponse(status_code=503, content={"status": "error", "message": "Models not loaded"})

    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        # BƯỚC 1: VALIDATION
        vec_moi = get_validation_vector(img)
        dist = torch.dist(vec_moi, vector_trung_binh).item()
        
        if dist > nguong_khoang_cach:
            return JSONResponse({
                "status": "invalid_domain",
                "message": "Ảnh khác lạ (Sai domain)",
                "confidence": 0.0,
                "box": None,
                "track_id": None,
                "total_count": len(counted_ids)
            })

        # BƯỚC 2: YOLO TRACKING
        # persist=True giúp YOLO nhớ vật thể giữa các frame
        results = model_yolo.track(img, persist=True, verbose=False, tracker="bytetrack.yaml")
        
        detected = False
        best_box = None
        current_track_id = None
        
        # Kiểm tra kết quả
        for r in results:
            if len(r.boxes) > 0:
                detected = True
                
                # Lấy box đầu tiên (giả sử băng chuyền mỗi lần 1 vật)
                box = r.boxes[0]
                best_box = box.xyxy[0].tolist()
                
                # Lấy ID theo dõi (Track ID)
                if box.id is not None:
                    current_track_id = int(box.id.item())
                    # Nếu ID này mới, thêm vào danh sách đã đếm
                    counted_ids.add(current_track_id)
                
                break 
        
        if not detected:
            return JSONResponse({
                "status": "no_object",
                "message": "Không có vật thể",
                "confidence": 0.0,
                "box": None,
                "track_id": None,
                "total_count": len(counted_ids)
            })

        # BƯỚC 3: SVM
        label, conf, probs = get_svm_prediction(img)

        # --- LOGGING DATA ---
        process_time = (time.time() - start_time) * 1000 # Đổi ra ms
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Tạo bản ghi log
        log_entry = {
            "id": len(HISTORY_LOG) + 1,
            "timestamp": timestamp,
            "status": "NG" if detected else "OK", # detected là biến từ bước YOLO
            "defect_type": label if detected else "None",
            "confidence": float(conf) if detected else 1.0,
            "process_time": round(process_time, 2)
        }
        
        # Chỉ lưu log nếu phát hiện lỗi hoặc định kỳ (để tránh đầy RAM nếu chạy lâu)
        # Ở đây ta lưu tất cả để demo Dashboard cho đẹp
        HISTORY_LOG.insert(0, log_entry) # Thêm vào đầu danh sách
        if len(HISTORY_LOG) > 1000: HISTORY_LOG.pop() # Giới hạn 1000 bản ghi
        
        # Trả về kết quả như cũ
        return JSONResponse({
            "status": "defect_found" if detected else "no_object",
            "message": label,
            "confidence": conf,
            "box": best_box,
            "track_id": current_track_id,
            "total_count": len(counted_ids)
        })

    except Exception as e:
        print(f"Error: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

# --- LẤY DỮ LIỆU THỐNG KÊ ---
@app.get("/statistics")
async def get_statistics():
    """Trả về toàn bộ lịch sử để vẽ biểu đồ"""
    return JSONResponse(HISTORY_LOG)
# --- Cách chạy server ---
# 1. Mở terminal, đi tới thư mục "transferAPI"
# 2. Chạy lệnh: python -m uvicorn app:app --reload --port 8000



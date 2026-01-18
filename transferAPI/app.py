# transferAPI/app.py
import io
import os
import numpy as np
import joblib
from PIL import Image
from datetime import datetime
import time
import sqlite3
import torch
import torch.nn as nn            # <--- Thêm dòng này
import torch.nn.functional as F  # <--- Thêm dòng này
import torchvision.models as models
import torchvision.transforms as transforms
from ultralytics import YOLO

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# [XÓA] from model_def import SimpleResNet, BasicBlock (Không dùng nữa)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(BASE_DIR, "defects.db") 

# --- 1. ĐỊNH NGHĨA MODEL MỚI ---
class MetalConvNet(nn.Module):
    def __init__(self, in_channels=1, num_classes=10, feat_dim=128):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels, 16, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(16)
        
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(32)
        
        self.conv3 = nn.Conv2d(32, 64, 3, padding=1)
        self.bn3 = nn.BatchNorm2d(64)
        
        self.pool = nn.MaxPool2d(2, 2)
        self.gap = nn.AdaptiveAvgPool2d(1)
        
        self.fc_feat = nn.Linear(64, feat_dim)
        self.fc_out = nn.Linear(feat_dim, num_classes)

    def forward(self, x, feature_extract=False):
        x = self.pool(F.relu(self.bn1(self.conv1(x))))
        x = self.pool(F.relu(self.bn2(self.conv2(x))))
        x = self.pool(F.leaky_relu(self.bn3(self.conv3(x)), 0.1))
        
        x = self.gap(x)
        x = x.view(x.size(0), -1)
        
        feat = F.relu(self.fc_feat(x))
        
        if feature_extract:
            return feat
            
        out = self.fc_out(feat)
        return out

# --- KHAI BÁO BIẾN TOÀN CỤC ---
model_svm = None
classes = None
scaler = None
svm = None
transform_svm = None

model_validation = None
transform_validation = None
ood_pipeline = None

model_yolo = None

HISTORY_LOG = [] 

app = FastAPI(title="API AI Pipeline Fixed")

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
    global model_svm, classes, scaler, svm, transform_svm
    global model_validation, transform_validation, ood_pipeline
    global model_yolo

    print("--- Bắt đầu tải model ---")
    
    # 1. TẢI SVM & CNN (MetalConvNet)
    try:
        classes = np.load("saved/classes.npy", allow_pickle=True).tolist()
        
        # [FIX] Khởi tạo MetalConvNet thay vì SimpleResNet
        model_svm = MetalConvNet(in_channels=1, num_classes=len(classes), feat_dim=128).to(DEVICE)
        
        # Load weights
        model_svm.load_state_dict(torch.load("saved/resnet_weights.pth", map_location=DEVICE))
        model_svm.eval()
        
        scaler = joblib.load("saved/scaler.pkl")
        svm = joblib.load("saved/svm_model.pkl")
        
        transform_svm = transforms.Compose([
            transforms.Grayscale(num_output_channels=1),
            transforms.Resize((200, 200)),
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5])
        ])
        print("✅ CNN & SVM: OK")
    except Exception as e: print(f"❌ SVM Lỗi: {e}")
        
    # 2. TẢI VALIDATION (Isolation Forest)
    try:
        model_resnet = models.resnet50(weights='IMAGENET1K_V1')
        model_validation = torch.nn.Sequential(*list(model_resnet.children())[:-1])
        model_validation.to(DEVICE).eval()
        
        transform_validation = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

        path_ood = "saved/ood_pipeline.pkl"
        if os.path.exists(path_ood):
            ood_pipeline = joblib.load(path_ood)
            print("✅ Isolation Forest: OK")
        else:
            print("❌ Không tìm thấy ood_pipeline.pkl")        
    except Exception as e: print(f"❌ Validation Lỗi: {e}")

    # 3. TẢI YOLO
    try:
        yolo_path = "saved/yolo.pt" if os.path.exists("saved/yolo.pt") else "yolo.pt"
        if os.path.exists(yolo_path):
            model_yolo = YOLO(yolo_path)
            print("✅ YOLO: OK")
    except Exception as e: print(f"❌ YOLO Lỗi: {e}")

    # 4. KHỞI TẠO DB
    init_db() 
    print("--- Server sẵn sàng ---")

# --- HELPER FUNCTIONS ---
def get_svm_prediction(img):
    tensor = transform_svm(img).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        # Gọi feature_extract=True để lấy vector 128 chiều
        feats = model_svm(tensor, feature_extract=True).cpu().numpy()
    feats_scaled = scaler.transform(feats)
    probs = svm.predict_proba(feats_scaled)[0]
    pred_idx = int(np.argmax(probs))
    return classes[pred_idx], float(probs[pred_idx])

# --- DATABASE ---
def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute('''
            CREATE TABLE IF NOT EXISTS inspections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                status TEXT,
                defect_type TEXT,
                confidence REAL,
                process_time REAL
            )''')
    conn.commit()
    conn.close()

# --- TRACKING VARS ---
counted_ids = set()

@app.post("/reset-count")
async def reset_count():
    global counted_ids
    counted_ids = set()
    return {"status": "ok"}

# --- PIPELINE CHÍNH (GIỮ NGUYÊN LOGIC CỦA BẠN) ---
@app.post("/process-pipeline")
async def process_pipeline(file: UploadFile = File(...)):
    global counted_ids, HISTORY_LOG
    start_time = time.time()

    if not all([model_validation, model_yolo, model_svm]):
        return JSONResponse(status_code=503, content={"status": "error", "message": "Models not loaded"})

    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        
        # Khởi tạo biến
        status_res = "OK"
        defect_label = "None"
        confidence = 1.0
        box = None
        current_track_id = None
        detected = False
        cropped_img = None # Biến để lưu ảnh cắt
        
        # --- BƯỚC 1: VALIDATION (CHẠY TRÊN ẢNH GỐC) ---
        img_t = transform_validation(img) # Dùng ảnh gốc
        batch_t = torch.unsqueeze(img_t, 0).to(DEVICE)
        
        with torch.no_grad():
            vector_raw = model_validation(batch_t).flatten().cpu().numpy().reshape(1, -1)
        
        if ood_pipeline:
            pca = ood_pipeline["pca"]
            ood_model = ood_pipeline["ood_model"]
            vector_pca = pca.transform(vector_raw)
            is_in_domain = ood_model.predict(vector_pca)[0]
            
            if is_in_domain == -1:
                status_res = "INVALID"
                defect_label = "Sai domain"
                confidence = 0.0
        
        # --- BƯỚC 2: YOLO TRACKING & CROP ---
        if status_res == "OK":
            results = model_yolo.track(img, persist=True, verbose=False, tracker="bytetrack.yaml")
            
            for r in results:
                if len(r.boxes) > 0:
                    detected = True
                    b = r.boxes[0]
                    box = b.xyxy[0].tolist() # [x1, y1, x2, y2]
                    
                    # CẮT ẢNH CHỈ CHỌN PHẦN CÓ KIM LOẠI
                    x1, y1, x2, y2 = map(int, box)
                    cropped_img = img.crop((x1, y1, x2, y2))
                    
                    if b.id is not None:
                        current_track_id = int(b.id.item())
                        counted_ids.add(current_track_id)
                    break 
            
            # --- BƯỚC 3: SVM CLASSIFICATION (CHẠY TRÊN ẢNH ĐÃ CẮT) ---
            if detected and cropped_img:
                status_res = "NG"
                # Đưa ảnh đã cắt vào SVM
                label, conf = get_svm_prediction(cropped_img) 
                defect_label = label
                confidence = conf
                
                # Check nếu là Free/OK (nếu tên trong classes.npy là "Sản phẩm tốt" hoặc "MT_Free")
                if "Sản phẩm tốt" in defect_label or "MT_Free" in defect_label:
                    status_res = "OK"

            else:
                # Validation OK nhưng YOLO không thấy vật
                if status_res == "OK":
                   status_res = "OK" 
                   defect_label = "None"

        # --- LOGGING VÀO DB ---
        process_time = (time.time() - start_time) * 1000
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        try:
            conn = sqlite3.connect(DB_NAME)
            c = conn.cursor()
            c.execute("INSERT INTO inspections (timestamp, status, defect_type, confidence, process_time) VALUES (?, ?, ?, ?, ?)",
                      (timestamp, status_res, defect_label, float(confidence), round(process_time, 2)))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"❌ DB Error: {e}")

        # Cập nhật HISTORY_LOG
        log_entry = {
            "id": len(HISTORY_LOG) + 1,
            "timestamp": timestamp,
            "status": status_res,
            "defect_type": defect_label,
            "confidence": confidence,
            "process_time": round(process_time, 2)
        }
        HISTORY_LOG.insert(0, log_entry)
        if len(HISTORY_LOG) > 100: HISTORY_LOG.pop()

        # --- TRẢ VỀ KẾT QUẢ ---
        final_status = "defect_found"
        if status_res == "INVALID": final_status = "invalid_domain"
        elif not detected: final_status = "no_object"
        
        return JSONResponse({
            "status": final_status,
            "message": defect_label,
            "confidence": confidence,
            "box": box,
            "track_id": current_track_id,
            "total_count": len(counted_ids)
        })

    except Exception as e:
        print(f"❌ SERVER ERROR: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@app.get("/statistics")
async def get_statistics():
    try:
        conn = sqlite3.connect(DB_NAME)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM inspections ORDER BY id DESC LIMIT 100")
        rows = c.fetchall()
        conn.close()
        return JSONResponse([dict(row) for row in rows])
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
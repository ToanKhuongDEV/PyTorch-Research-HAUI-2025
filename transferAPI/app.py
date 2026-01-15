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
import torchvision.models as models
import torchvision.transforms as transforms
from ultralytics import YOLO

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from model_def import SimpleResNet, BasicBlock 

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Đường dẫn DB tuyệt đối để tránh lỗi tạo 2 file
DB_NAME = os.path.join(BASE_DIR, "defects.db") 

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

# Biến lưu trữ tạm thời (để tránh lỗi NameError)
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
    
    # 1. TẢI SVM
    try:
        classes = np.load("saved/classes.npy", allow_pickle=True).tolist()
        model_svm = SimpleResNet(BasicBlock, [1,1,1], len(classes)).to(DEVICE)
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
        print("✅ SVM: OK")
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
        feats = model_svm(tensor, feature_extract=True).cpu().numpy()
    feats_scaled = scaler.transform(feats)
    probs = svm.predict_proba(feats_scaled)[0]
    pred_idx = int(np.argmax(probs))
    return classes[pred_idx], float(probs[pred_idx])

# --- DATABASE ---
def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    # SỬA: Tên bảng thống nhất là 'inspections'
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

# --- PIPELINE CHÍNH ---
@app.post("/process-pipeline")
async def process_pipeline(file: UploadFile = File(...)):
    global counted_ids, HISTORY_LOG
    start_time = time.time()

    if not all([model_validation, model_yolo, model_svm]):
        return JSONResponse(status_code=503, content={"status": "error", "message": "Models not loaded"})

    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        
        # --- BƯỚC 1: VALIDATION ---
        status_res = "OK"
        defect_label = "None"
        confidence = 1.0
        box = None
        current_track_id = None
        
        img_t = transform_validation(img)
        batch_t = torch.unsqueeze(img_t, 0).to(DEVICE)
        
        with torch.no_grad():
            vector_raw = model_validation(batch_t).flatten().cpu().numpy().reshape(1, -1)
        
        # Check Isolation Forest
        if ood_pipeline:
            pca = ood_pipeline["pca"]
            ood_model = ood_pipeline["ood_model"]
            vector_pca = pca.transform(vector_raw)
            is_in_domain = ood_model.predict(vector_pca)[0]
            
            if is_in_domain == -1:
                status_res = "INVALID"
                defect_label = "Sai domain"
                confidence = 0.0

        # Nếu sai domain -> Trả về luôn
        if status_res == "INVALID":
             # Vẫn log vào DB để tracking
            pass # Để code chạy xuống dưới log DB rồi mới return

        # --- BƯỚC 2 & 3: YOLO & SVM (Chỉ chạy nếu đúng domain) ---
        detected = False
        if status_res == "OK":
            results = model_yolo.track(img, persist=True, verbose=False, tracker="bytetrack.yaml")
            
            for r in results:
                if len(r.boxes) > 0:
                    detected = True
                    b = r.boxes[0]
                    box = b.xyxy[0].tolist()
                    if b.id is not None:
                        current_track_id = int(b.id.item())
                        counted_ids.add(current_track_id)
                    break 
            
            if detected:
                status_res = "NG"
                # Gọi SVM
                label, conf = get_svm_prediction(img)
                defect_label = label
                confidence = conf
            else:
                status_res = "OK" # Không có vật thể hoặc OK
                defect_label = "None" # Hoặc "Không lỗi"

        # --- LOGGING VÀO DB ---
        process_time = (time.time() - start_time) * 1000
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # SỬA: Thêm try-except và đúng tên bảng
        try:
            conn = sqlite3.connect(DB_NAME)
            c = conn.cursor()
            c.execute("INSERT INTO inspections (timestamp, status, defect_type, confidence, process_time) VALUES (?, ?, ?, ?, ?)",
                      (timestamp, status_res, defect_label, float(confidence), round(process_time, 2)))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"❌ DB Error: {e}")

        # SỬA: Cập nhật HISTORY_LOG an toàn
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
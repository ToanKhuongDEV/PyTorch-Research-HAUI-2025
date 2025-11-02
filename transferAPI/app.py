# transferAPI/app.py
import io
import os
import numpy as np
import joblib
from PIL import Image

import torch
import torchvision.models as models # <--- PHẢI CÓ DÒNG NÀY
import torchvision.transforms as transforms

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Import định nghĩa model SimpleResNet của bạn
from model_def import SimpleResNet, BasicBlock 

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- KHAI BÁO BIẾN TOÀN CỤC ---
# 1. Các biến cho mô hình PHÂN LOẠI (SVM) của bạn
model_svm = None
classes = None
scaler = None
svm = None
transform_svm = None

# 2. Các biến cho mô hình KIỂM TRA (Validation) mới
model_validation = None
vector_trung_binh = None
nguong_khoang_cach = None
transform_validation = None

# --- KHỞI TẠO APP FASTAPI ---
app = FastAPI(title="API Phân loại và Kiểm tra Ảnh")

# Cho phép CORS (Giữ nguyên code của bạn)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Thay đổi khi deploy
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
    
    print("--- Bắt đầu tải các mô hình ---")
    
    # === 1. TẢI MÔ HÌNH PHÂN LOẠI (SVM) ===
    # (Đây là code gốc của bạn, được di chuyển vào đây)
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
    # (Đây là code mới)
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

    print("--- Tải xong! Server sẵn sàng. ---")


# --- CÁC HÀM HELPER XỬ LÝ ẢNH ---

def xu_ly_anh_validation(image_bytes):
    """Tiền xử lý và trích xuất vector cho mô hình KIỂM TRA."""
    img = Image.open(image_bytes).convert('RGB')
    img_t = transform_validation(img)
    batch_t = torch.unsqueeze(img_t, 0).to(DEVICE)
    
    with torch.no_grad():
        vector = model_validation(batch_t)
        
    return vector.flatten()

# --- API ENDPOINT 1: PHÂN LOẠI LỖI (Code gốc của bạn) ---
@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    ENDPOINT 1: Phân loại lỗi (chức năng gốc của bạn).
    Frontend sẽ gọi endpoint này cho nút "Chụp Ảnh".
    """
    if not model_svm or not scaler or not svm:
        raise HTTPException(status_code=503, detail={
            "error": "Lỗi: Mô hình phân loại chưa được tải. Vui lòng kiểm tra server log."
        })
        
    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        tensor = transform_svm(img).unsqueeze(0).to(DEVICE) # Dùng transform_svm

        with torch.no_grad():
            feats = model_svm(tensor, feature_extract=True).cpu().numpy() # Dùng model_svm

        feats_scaled = scaler.transform(feats)
        probs = svm.predict_proba(feats_scaled)[0]
        pred_idx = int(np.argmax(probs))
        confidence = float(probs[pred_idx])

        per_class = {classes[i]: float(probs[i]) for i in range(len(classes))}

        return JSONResponse({
            "class": classes[pred_idx],
            "confidence": confidence,
            "probabilities": per_class
        })

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# --- API ENDPOINT 2: KIỂM TRA TÍNH HỢP LỆ (Code mới) ---
@app.post("/kiem-tra-anh")
async def kiem_tra_anh(file: UploadFile = File(..., alias="image_file")):
    """
    ENDPOINT 2: Kiểm tra xem ảnh có "đạt chuẩn" không.
    Frontend sẽ gọi endpoint này cho nút "Upload Ảnh".
    """
    if model_validation is None or vector_trung_binh is None or nguong_khoang_cach is None:
        raise HTTPException(status_code=503, detail={
            "hop_le": False, "thong_bao": "Lỗi: Mô hình kiểm tra chưa được tải. Vui lòng chạy extract_vector.py và khởi động lại server."
        })
        
    try:
        contents = await file.read()
        
        # 2. Trích xuất vector từ ảnh mới
        vector_moi = xu_ly_anh_validation(io.BytesIO(contents)) # Dùng hàm helper
        
        # 3. Tính khoảng cách
        khoang_cach = torch.dist(vector_moi, vector_trung_binh).item()
        
        print(f"(Validation) Khoảng cách tính được: {khoang_cach} (Ngưỡng: {nguong_khoang_cach})")
        
        # 4. So sánh với ngưỡng
        if khoang_cach <= nguong_khoang_cach:
            # HỢP LỆ
            return JSONResponse({
                "hop_le": True,
                "thong_bao": "Ảnh đạt chuẩn" # Frontend sẽ hiển thị thông báo này
            })
        else:
            # KHÔNG HỢP LỆ
            return JSONResponse({
                "hop_le": False,
                "thong_bao": f"Ảnh không đạt chuẩn" 
            })
            
    except Exception as e:
        print(f"Lỗi xử lý ảnh: {e}")
        return JSONResponse(status_code=500, content={"hop_le": False, "thong_bao": "Lỗi server khi xử lý ảnh"})

# --- Cách chạy server ---
# 1. Mở terminal, đi tới thư mục "transferAPI"
# 2. Chạy lệnh: python -m uvicorn app:app --reload --port 8000



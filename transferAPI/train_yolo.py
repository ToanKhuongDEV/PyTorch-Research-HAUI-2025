import os
import cv2
import yaml # Thêm thư viện này để load yaml an toàn
from ultralytics import YOLO

# ================= CẤU HÌNH TỐI ƯU =================
# Đường dẫn file data.yaml
DATA_YAML_PATH = r"E:/University/NCKH/Dataset/NEU-DET-train-yolo/data.yaml"

BASE_MODEL = 'yolov8n.pt' 
EPOCHS = 50
IMGSZ = 640 
BATCH_SIZE = 16 
# ===================================================

def check_images_local(yaml_path):
    """Quét và xóa ảnh lỗi, ảnh rỗng"""
    print(">>> [1/4] Đang kiểm tra dữ liệu đầu vào...")
    
    try:
        with open(yaml_path, 'r') as f:
            data = yaml.safe_load(f)
    except Exception as e:
        print(f"❌ Lỗi đọc file YAML: {e}")
        return

    root_dir = data.get('path')
    # Xử lý đường dẫn tương đối/tuyệt đối
    if not os.path.isabs(root_dir): 
         # Nếu path trong yaml là tương đối, nối với thư mục chứa file yaml (tuỳ trường hợp)
         pass 

    if not root_dir or not os.path.exists(root_dir):
        print(f"⚠️ Cảnh báo: Không check được ảnh do đường dẫn trong YAML: {root_dir}")
        return

    valid_exts = ['.jpg', '.jpeg', '.png', '.bmp']
    deleted = 0
    
    # Duyệt qua cả train và valid (hoặc test)
    for split in ['train', 'valid', 'test']: 
        img_dir = os.path.join(root_dir, split, 'images')
        if not os.path.exists(img_dir): 
            continue
        
        print(f" -> Đang quét: {img_dir}")
        for root, dirs, files in os.walk(img_dir):
            for file in files:
                file_path = os.path.join(root, file)
                ext = os.path.splitext(file)[1].lower()
                
                # 1. Xóa file rác không phải ảnh
                if ext not in valid_exts:
                    try:
                        os.remove(file_path)
                        deleted += 1
                    except: pass
                    continue
                
                # 2. Xóa ảnh lỗi không đọc được bằng OpenCV
                try:
                    img = cv2.imread(file_path)
                    if img is None or img.size == 0:
                        print(f"   [XÓA] Ảnh lỗi: {file}")
                        os.remove(file_path)
                        deleted += 1
                except:
                    pass
                    
    print(f">>> Đã quét xong. Tổng số file đã xóa: {deleted}")

def main():
    # 1. Quét lỗi ảnh
    check_images_local(DATA_YAML_PATH)
    
    # 2. Load Model
    print(f">>> [2/4] Đang tải model {BASE_MODEL}...")
    model = YOLO(BASE_MODEL)

    # 3. Training
    print(f">>> [3/4] Bắt đầu training {EPOCHS} epochs...")
    
    try:
        results = model.train(
            data=DATA_YAML_PATH,
            epochs=EPOCHS,
            imgsz=IMGSZ,
            batch=BATCH_SIZE,
            patience=15,       # Nếu 15 epoch ko cải thiện thì dừng sớm (Early Stopping)
            save=True,         # Lưu checkpoint
            name='day_chuyen_metal', # Tên folder lưu kết quả
            exist_ok=True,     # Cho phép ghi đè folder cũ
            
            # --- CẤU HÌNH QUAN TRỌNG CHO WINDOWS ---
            workers=0,         # BẮT BUỘC = 0 trên Windows để tránh lỗi
            device='cpu',          # 0 là GPU, 'cpu' là CPU. (Sửa thành 'cpu' nếu ko có card rời)
            
            # --- AUGMENTATION (Tăng cường dữ liệu cho lỗi kim loại) ---
            degrees=10.0,      # Xoay ảnh +/- 10 độ
            flipud=0.5,        # Lật ảnh dọc (quan trọng với vết xước/lỗ)
            fliplr=0.5,        # Lật ảnh ngang
            mosaic=1.0,        # Ghép 4 ảnh (giúp học tốt vật thể nhỏ)
        )
    except Exception as e:
        print(f"\n❌ LỖI KHI TRAIN: {e}")
        return

    # 4. Export
    print(">>> [4/4] Training xong! Đang export...")
    try:
        model.export(format='onnx')
        # model.export(format='torchscript') # Bật nếu cần deploy mobile/edge
    except Exception as e:
        print(f"⚠️ Lỗi export (không ảnh hưởng file .pt): {e}")

    print("✅ HOÀN TẤT!")

if __name__ == '__main__':
    # Fix lỗi multiprocessing trên Windows
    from multiprocessing import freeze_support
    freeze_support()
    
    main()
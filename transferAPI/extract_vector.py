# transferAPI/extract_vector.py
import os
import glob
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image
import numpy as np

# --- CẤU HÌNH ---
THU_MUC_ANH_CHUAN = "E:/University/NCKH/Dataset/Dataset/200_Free" 

# Nơi lưu file "chuẩn" (Đã khớp với cấu trúc thư mục của bạn)
SAVE_DIR = "transferAPI/saved"
FILE_VECTOR_TRUNG_BINH = os.path.join(SAVE_DIR, "vector_trung_binh.npy")
FILE_NGUONG_KHOANG_CACH = os.path.join(SAVE_DIR, "nguong_khoang_cach.txt")
# --- KẾT THÚC CẤU HÌNH ---

os.makedirs(SAVE_DIR, exist_ok=True)

# Định nghĩa hàm tiền xử lý (GIỐNG TRONG app.py kiểm tra)
tien_xu_ly = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# Tải model ResNet50
print("Đang tải mô hình ResNet50...")
model = models.resnet50(weights='IMAGENET1K_V1')
model = torch.nn.Sequential(*list(model.children())[:-1]) # Bỏ lớp cuối
model.eval() # Chuyển sang chế độ đánh giá
print("Tải mô hình thành công.")

def trich_xuat_vector(image_path):
    """Hàm trích xuất vector đặc trưng từ một ảnh."""
    try:
        img = Image.open(image_path).convert('RGB')
        img_t = tien_xu_ly(img)
        batch_t = torch.unsqueeze(img_t, 0) # Tạo batch
        
        with torch.no_grad(): # Không tính gradient
            vector = model(batch_t)
            
        return vector.flatten() # Làm phẳng vector
    except Exception as e:
        print(f"Lỗi khi xử lý ảnh {image_path}: {e}")
        return None

# Trích xuất vector từ N ảnh chuẩn
print(f"Đang đọc ảnh từ: {THU_MUC_ANH_CHUAN}")
cac_vector = []
# Tìm tất cả các file ảnh (jpg, png)
image_paths = glob.glob(os.path.join(THU_MUC_ANH_CHUAN, "*.jpg")) + \
              glob.glob(os.path.join(THU_MUC_ANH_CHUAN, "*.png"))

if not image_paths:
    print(f"!!! LỖI: Không tìm thấy ảnh nào trong '{THU_MUC_ANH_CHUAN}'.")
    print("Vui lòng kiểm tra lại đường dẫn CẤU HÌNH 1.")
else:
    print(f"Tìm thấy {len(image_paths)} ảnh. Bắt đầu trích xuất vector...")
    for path in image_paths:
        vec = trich_xuat_vector(path)
        if vec is not None:
            cac_vector.append(vec)

    if not cac_vector:
        print("!!! LỖI: Không thể trích xuất vector từ bất kỳ ảnh nào.")
    else:
        # Chuyển list các tensor thành 1 tensor 2D
        ma_tran_vector = torch.stack(cac_vector)
        print(f"Kích thước ma trận vector: {ma_tran_vector.shape}") # (n_images, 2048)
        
        # Tính vector trung bình
        vector_trung_binh = torch.mean(ma_tran_vector, dim=0)
        print(f"Kích thước vector trung bình: {vector_trung_binh.shape}") # (2048)
        
        # Tính khoảng cách lớn nhất (ngưỡng)
        khoang_cach = [torch.dist(v, vector_trung_binh) for v in cac_vector]
        nguong_khoang_cach = max(khoang_cach).item()
        
        print(f"Khoảng cách lớn nhất (ngưỡng): {nguong_khoang_cach}")
        
        # Lưu file
        np.save(FILE_VECTOR_TRUNG_BINH, vector_trung_binh.numpy())
        with open(FILE_NGUONG_KHOANG_CACH, 'w') as f:
            f.write(str(nguong_khoang_cach))
            
        print("--- THÀNH CÔNG ---")
        print(f"Đã lưu vector trung bình tại: {FILE_VECTOR_TRUNG_BINH}")
        print(f"Đã lưu ngưỡng khoảng cách tại: {FILE_NGUONG_KHOANG_CACH}")
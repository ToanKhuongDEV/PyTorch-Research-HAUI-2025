import os
import glob
import time
import torch
import torchvision.models as models
import torchvision.transforms as transforms
import numpy as np
from PIL import Image

# --- THƯ VIỆN MỚI ---
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
import joblib

# --- CẤU HÌNH ---
THU_MUC_ANH_CHUAN = "E:/University/NCKH/Dataset/NEU-DET-train-yolo/train/images"  # Chỉ chứa ảnh Kim loại chuẩn
SAVE_DIR = "transferAPI/saved"
FILE_MODEL_OOD = os.path.join(SAVE_DIR, "ood_pipeline.pkl")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def main():
    os.makedirs(SAVE_DIR, exist_ok=True)

    # 1. Tiền xử lý
    tien_xu_ly = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    # 2. ResNet50
    print("Đang tải mô hình ResNet50...")
    model = models.resnet50(weights='IMAGENET1K_V1')
    model = torch.nn.Sequential(*list(model.children())[:-1])
    model.to(DEVICE)
    model.eval()

    # 3. Đọc ảnh
    print(f"Đang đọc ảnh từ: {THU_MUC_ANH_CHUAN}")
    image_paths = glob.glob(os.path.join(THU_MUC_ANH_CHUAN, "*.jpg")) + \
                  glob.glob(os.path.join(THU_MUC_ANH_CHUAN, "*.png"))

    if len(image_paths) == 0:
        print("!!! LỖI: Không có ảnh training.")
        return

    print(f"Tìm thấy {len(image_paths)} ảnh chuẩn. Bắt đầu xử lý...")

    raw_vectors = []
    with torch.no_grad():
        for i, path in enumerate(image_paths):
            try:
                img = Image.open(path).convert('RGB')
                img_t = tien_xu_ly(img)
                batch_t = torch.unsqueeze(img_t, 0).to(DEVICE)

                vector = model(batch_t).flatten()
                raw_vectors.append(vector.cpu().numpy())
            except Exception as e:
                print(f"Lỗi ảnh {path}: {e}")

    # 4. Huấn luyện Isolation Forest
    print("\n--- BẮT ĐẦU HUẤN LUYỆN (Isolation Forest) ---")

    X_train = np.array(raw_vectors)

    # A. PCA: Nén chặt xuống  chiều
    print("1. Đang chạy PCA (nén xuống 64 chiều)...")
    pca = PCA(n_components=44, random_state=42)
    X_pca = pca.fit_transform(X_train)

    # B. Isolation Forest
    print("2. Đang xây dựng Rừng cô lập (Isolation Forest)...")
    ood_model = IsolationForest(n_estimators=100,
                                contamination=0.012,
                                random_state=42,
                                n_jobs=-1)
    ood_model.fit(X_pca)

    # 5. Lưu Pipeline
    pipeline = {
        "pca": pca,
        "ood_model": ood_model,
        "type": "IsolationForest"
    }

    joblib.dump(pipeline, FILE_MODEL_OOD)
    print("\n--- HOÀN THÀNH ---")
    print(f"Đã lưu model mới (chặt chẽ hơn) tại: {FILE_MODEL_OOD}")


if __name__ == "__main__":
    main()
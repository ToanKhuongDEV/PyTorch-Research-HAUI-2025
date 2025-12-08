# transferAPI/test_ood.py
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image
import joblib
import sys
import os
import glob  # Thư viện để tìm danh sách file

# --- CẤU HÌNH ---
FILE_MODEL = "transferAPI/saved/ood_pipeline.pkl"
THU_MUC_TEST = r"D:\DATASET\Data\TEST_data"  # Thư mục chứa ảnh cần test

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- LOAD MODEL & SETUP (Chạy 1 lần) ---
if not os.path.exists(FILE_MODEL):
    print("!!! LỖI: Chưa có file model. Hãy chạy extract_vector.py trước!")
    sys.exit()

print("--- ĐANG TẢI MODEL... ---")
pipeline = joblib.load(FILE_MODEL)
pca = pipeline["pca"]
ood_model = pipeline["ood_model"]

resnet = models.resnet50(weights='IMAGENET1K_V1')
resnet = torch.nn.Sequential(*list(resnet.children())[:-1])
resnet.to(DEVICE)
resnet.eval()

preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def check_image(image_path):
    img = Image.open(image_path).convert('RGB')
    input_t = preprocess(img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        # 1. Lấy vector thô
        vec_raw = resnet(input_t).flatten().cpu().numpy().reshape(1, -1)
        # 2. Giảm chiều PCA
        vec_pca = pca.transform(vec_raw)
        # 3. Dự đoán
        pred = ood_model.predict(vec_pca)[0]  # 1 hoặc -1
        score = ood_model.decision_function(vec_pca)[0]  # Điểm số

        return pred, score


# --- CHẠY THỬ TRÊN CẢ THƯ MỤC ---
if __name__ == "__main__":
    # 1. Lấy danh sách ảnh (jpg và png)
    print(f"Đang tìm ảnh trong: {THU_MUC_TEST}")
    list_anh = glob.glob(os.path.join(THU_MUC_TEST, "*.jpg")) + \
               glob.glob(os.path.join(THU_MUC_TEST, "*.png"))

    if len(list_anh) == 0:
        print("!!! Không tìm thấy ảnh nào trong thư mục này.")
    else:
        print(f"Tìm thấy {len(list_anh)} ảnh. Bắt đầu kiểm tra...\n")
        print(f"{'KẾT QUẢ':<15} | {'ĐIỂM SỐ':<10} | {'TÊN FILE'}")
        print("-" * 60)

        count_in = 0
        count_out = 0

        for path in list_anh:
            try:
                ket_qua, diem = check_image(path)
                filename = os.path.basename(path)

                if ket_qua == 1:
                    status_str = "✅ IN-DOMAIN"
                    count_in += 1
                else:
                    status_str = "❌ OUT-DOMAIN"
                    count_out += 1

                # In kết quả từng dòng
                # :<15 căn lề trái, :7.4f làm tròn 4 số thập phân
                print(f"{status_str:<15} | {diem:7.4f}    | {filename}")

            except Exception as e:
                print(f"⚠️ Lỗi file {os.path.basename(path)}: {e}")

        # TỔNG KẾT
        print("\n" + "=" * 30)
        print(f"TỔNG KẾT KIỂM TRA ({len(list_anh)} ảnh)")
        print(f" - Số lượng Hợp lệ (In-domain):   {count_in}")
        print(f" - Số lượng Bất thường (Out-domain): {count_out}")
        print("=" * 30)
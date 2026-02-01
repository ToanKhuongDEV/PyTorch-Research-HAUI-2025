# 🏭 Hệ Thống Nhận Diện Khuyết Tật Kim Loại

(Industrial Metal Surface Defect Detection System)

Hệ thống tích hợp trí tuệ nhân tạo để phát hiện, nhận diện và phân loại các khuyết tật trên bề mặt kim loại trong thời gian thực. Dự án sử dụng mô hình lai (Hybrid AI Pipeline) kết hợp giữa Deep Learning và Machine Learning truyền thống.

-----

## 🚀 Tính Năng Nổi Bật

1.  Pipeline AI Đa Tầng "All-in-One":
       Validation: Loại bỏ ảnh không hợp lệ/sai domain (ResNet50 + Cosine Similarity).
       Detection: Phát hiện vị trí vật thể (YOLOv8).
       Classification: Phân loại chi tiết lỗi (ResNet + SVM).
2.  Video Realtime: Xử lý luồng video trực tiếp, vẽ khung cảnh báo lỗi ngay lập tức (FPS tối ưu).
3.  Chụp & Upload Ảnh: Kiểm tra kỹ lưỡng từng ảnh tĩnh.
4.  Dashboard: Thống kê và nhật ký phát hiện theo thời gian thực.

-----

## 🛠️ Yêu Cầu Hệ Thống

   Python: Phiên bản 3.8 trở lên.
   Editor: VS Code (Khuyên dùng để chạy Frontend).
   Extension VS Code: "Live Server" (Bắt buộc để chạy Frontend không bị lỗi CORS).
   Phần cứng: Webcam (cho Realtime), GPU NVIDIA (Khuyến nghị để xử lý nhanh hơn).

-----

## 📝 Hướng Dẫn Cài Đặt (Từ Đầu Đến Cuối)

### Bước 1: Cài đặt Môi trường Backend

Mở terminal tại thư mục gốc của dự án:

1.  Di chuyển vào thư mục API:

    ```bash
    cd transferAPI
    ```

2.  Cài đặt các thư viện cần thiết:

    ```bash
    pip install -r requirements.txt
    ```

### Bước 2: Chuẩn bị Model và Dữ liệu

Đảm bảo thư mục `transferAPI/saved/` có đủ các file model sau (nếu thiếu phải copy vào):

   `yolo.pt` (hoặc model YOLO custom của bạn).
   `resnet_weights.pth` (Trọng số ResNet train cho SVM).
   `svm_model.pkl` (Model SVM).
   `scaler.pkl` & `classes.npy`.

### Bước 3: Tạo Dữ Liệu Validation (QUAN TRỌNG)

Bạn bắt buộc phải chạy bước này 1 lần đầu tiên để hệ thống học được "thế nào là ảnh chuẩn".

1.  Mở file `transferAPI/extract_vector.py`.
2.  Tìm dòng `THU_MUC_ANH_CHUAN = "..."` và sửa đường dẫn trỏ đến thư mục chứa các ảnh mẫu (ảnh sạch, không lỗi) trên máy bạn.
3.  Chạy script:
    ```bash
    python extract_vector.py
    ```
    Thành công khi thấy thông báo: "Đã lưu vector trung bình..."

-----

## ▶️ Hướng Dẫn Chạy Hệ Thống

Bạn cần mở 2 terminal (hoặc 2 cửa sổ): 1 cái chạy Backend, 1 cái chạy Frontend.

### 1\. Khởi động Backend (Server)

Tại terminal (đang ở thư mục `transferAPI`), chạy lệnh:

```bash
python -m uvicorn app:app --reload --port 8000
```

   Chờ đến khi thấy thông báo: `--- SERVER SẴN SÀNG ---` và `Uvicorn running on http://127.0.0.1:8000`.
   Lưu ý: Không tắt cửa sổ này.

### 2\. Khởi động Frontend (Giao diện)

Tuyệt đối không mở trực tiếp file HTML (double click). Bạn phải dùng Live Server để tránh lỗi chặn Camera và lỗi CORS.

1.  Mở VS Code tại thư mục gốc dự án.
2.  Mở file `front-end/video.html` (hoặc `photo.html`).
3.  Nhấn chuột phải vào vùng code -\> Chọn "Open with Live Server".
4.  Trình duyệt sẽ tự bật trang web (thường là `http://127.0.0.1:5500/front-end/video.html`).

-----

## 📁 Cấu Trúc Thư Mục Dự Án

```
PyTorch-Research-HAUI-2025/
├── front-end/              # GIAO DIỆN NGƯỜI DÙNG
│   ├── css/                    # (style, base, components, layout, pages)
│   ├── js/                     # MÃ NGUỒN FRONTEND
│   │   ├── core.js                 # AppStore (State), APIManager, Theme
│   │   ├── camera-lib.js           # Xử lý Camera & Tính toán Metadata ảnh
│   │   ├── page-dashboard.js       # Logic trang Thống kê
│   │   ├── page-photo.js           # Logic trang Chụp ảnh
│   │   ├── page-video.js           # Logic trang Video Realtime
│   ├── photo.html              # Trang Chụp ảnh/Upload
│   ├── video.html              # Trang Video Realtime
|   └── dashboard.html          # Trang Thống kê
│
├── transferAPI/            # BACKEND SERVER
│   ├── app.py                  # File chính chạy Server (Pipeline Logic)
│   ├── model_def.py            # Định nghĩa mạng ResNet
│   ├── extract_vector.py       # Script tạo dữ liệu Validation
│   ├── requirements.txt        # Danh sách thư viện
│   └── saved/                  # KHO CHỨA MODEL
│       ├── yolo.pt                 
│       ├── resnet_weights.pth
│       ├── vector_trung_binh.npy
│       └── ...
│
└── README.md                 # Hướng dẫn sử dụng
```
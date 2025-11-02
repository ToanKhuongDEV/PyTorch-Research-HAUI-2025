# 🏭 Hệ Thống Nhận Diện Khuyết Tật Kim Loại

(Industrial Metal Surface Defect Detection System)

## 🎯 Tổng quan

Đây là một hệ thống machine learning hoàn chỉnh để phát hiện các khuyết tật trên bề mặt kim loại. Dự án sử dụng cách tiếp cận "lai" (hybrid):

  * **Deep Learning (PyTorch)**: Sử dụng kiến trúc ResNet tùy chỉnh để trích xuất đặc trưng (feature extraction).
  * **Machine Learning Cổ điển**: Sử dụng bộ phân loại SVM để phân loại khuyết tật từ các đặc trưng đã trích xuất.
  * **Web Interface**: Giao diện web (HTML/JS) cung cấp khả năng xử lý camera thời gian thực và trực quan hóa khuyết tật.
  * **API Backend**: Một REST API sử dụng FastAPI để phục vụ mô hình (model inference).

## 🏗️ Kiến trúc hệ thống

Kiến trúc tổng thể bao gồm 3 thành phần chính giao tiếp với nhau:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   ML Pipeline   │
│   (HTML/JS)     │◄──►│   (FastAPI)     │◄──►│   (PyTorch)     │
│                 │    │                 │    │                 │
│ • Camera Feed   │    │ • /predict      │    │ • ResNet CNN    │
│ • Image Capture │    │ • /kiem-tra-anh │    │ • SVM Classifier│
│ • Dashboard     │    │ • Model Serving │    │ • Feature Ext.  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📁 Cấu trúc thư mục

Dự án được chia thành 3 thư mục chính:

```
PyTorch-Research-HAUI-2025/
├── front-end/                # Giao diện web
│   ├── css/                  # Toàn bộ file CSS
│   ├── js/                   # Toàn bộ code JavaScript (đã refactor)
│   │   ├── main.js           # File chính: Khởi tạo và điều phối
│   │   ├── store.js          # Quản lý state (ảnh, metadata, trang)
│   │   ├── camera.js         # Quản lý stream camera
│   │   ├── api.js            # Gọi API (predict, kiem-tra-anh)
│   │   ├── ui.js             # Cập nhật giao diện (list ảnh, lỗi)
│   │   ├── modal.js          # Quản lý modal xem chi tiết ảnh
│   │   ├── metadata.js       # Tính toán metadata cho ảnh
│   │   └── utils.js          # Các hàm tiện ích chung
│   ├── photo.html            # Giao diện chụp ảnh
│   └── video.html            # Giao diện video thời gian thực
│
├── main-model/               # Code huấn luyện ML
│   ├── Resnet_SVM.py         # Code huấn luyện mô hình ResNet + SVM
│   └── ...
│
├── transferAPI/              # Backend API
│   ├── app.py                # File FastAPI chính (khởi động server)
│   ├── model_def.py          # Định nghĩa kiến trúc model
│   ├── extract_vector.py     # Script tạo vector chuẩn (cho validation)
│   ├── requirements.txt      # Các thư viện Python cần thiết
│   └── saved/                # Các file model đã huấn luyện
│       ├── resnet_weights.pth
│       ├── svm_model.pkl
│       ├── vector_trung_binh.npy
│       └── ...
│
└── README.md                 # File này
```

## 🚀 Cách chạy dự án

### 1\. Cài đặt Python

Đi tới thư mục `transferAPI` và cài đặt các thư viện cần thiết:

```bash
cd transferAPI
pip install -r requirements.txt
```

### 2\. Chuẩn bị Mô hình Validation

(Chỉ cần chạy 1 lần đầu tiên)
Chạy script này để tạo file vector trung bình và ngưỡng cho chức năng "Kiểm tra ảnh":

```bash
cd transferAPI
python extract_vector.py
```

### 3\. Khởi động Backend API

Vẫn ở trong thư mục `transferAPI`, khởi động server FastAPI:

```bash
python -m uvicorn app:app --reload --port 8000
```

Server sẽ chạy tại `http://localhost:8000`.

### 4\. Khởi động Frontend

Mở file `front-end/photo.html` trong trình duyệt của bạn (khuyến khích sử dụng "Live Server" trong VS Code để tránh lỗi CORS).

## 🔌 Tài liệu API

Hệ thống cung cấp 2 API chính tại `http://localhost:8000`.

### 1\. POST `/kiem-tra-anh`

Kiểm tra xem ảnh có "đạt chuẩn" (giống ảnh mẫu) hay không.

  * **Request**: `multipart/form-data` với một file ảnh (key là `image_file`).
  * **Response (JSON)**:
    ```json
    {
      "hop_le": true,
      "thong_bao": "Ảnh đạt chuẩn"
    }
    ```

### 2\. POST `/predict`

Phân loại khuyết tật trên ảnh (chỉ nên gọi sau khi ảnh đã "đạt chuẩn").

  * **Request**: `multipart/form-data` với một file ảnh (key là `file`).
  * **Response (JSON)**:
    ```json
    {
      "class": "scratch",
      "confidence": 0.95,
      "probabilities": {
        "scratch": 0.95,
        "surface_hole": 0.03,
        "deformation": 0.02
      }
    }
    ```
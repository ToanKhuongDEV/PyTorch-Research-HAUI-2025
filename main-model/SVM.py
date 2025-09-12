import os
import numpy as np
from sklearn import svm
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, classification_report
from sklearn.preprocessing import LabelEncoder
from skimage.io import imread
from skimage.transform import resize
from skimage.color import rgb2gray
import time

# ========= CẤU HÌNH =========
data_dir = "/kaggle/input/neu-det/NEU-DET"
img_size = (128, 128)

def load_images_from_folder(folder):
    data = []
    labels = []
    for label_name in os.listdir(folder):
        label_path = os.path.join(folder, label_name)
        if not os.path.isdir(label_path):
            continue
        for filename in os.listdir(label_path):
            file_path = os.path.join(label_path, filename)
            try:
                img = imread(file_path)
                img = resize(img, img_size, anti_aliasing=True)
                img = rgb2gray(img)
                vector = img.flatten()
                data.append(vector)
                labels.append(label_name)
            except Exception as e:
                print(f"Error loading {file_path}: {e}")
    return np.array(data), np.array(labels)

# --- Bắt đầu đo thời gian tổng
total_start_time = time.process_time()

print("🔄 Đang load dữ liệu...")
X_train, y_train = load_images_from_folder(os.path.join(data_dir, 'train'))
X_test, y_test = load_images_from_folder(os.path.join(data_dir, 'val'))

# Mã hóa nhãn
le = LabelEncoder()
y_train_enc = le.fit_transform(y_train)
y_test_enc = le.transform(y_test)

# ================= TRAINING =================
print("🔧 Huấn luyện SVM với kernel='rbf', C=100, gamma=0.01...")

train_start_time = time.time()
clf = svm.SVC(kernel='rbf', C=100, gamma=0.01)
clf.fit(X_train, y_train_enc)
train_end_time = time.time()

# ================= TESTING =================
print("\n🔍 Đánh giá trên tập validation...")

test_start_time = time.time()
y_pred = clf.predict(X_test)
test_end_time = time.time()

# ================= METRICS =================
acc  = accuracy_score(y_test_enc, y_pred)
prec = precision_score(y_test_enc, y_pred, average="macro")
rec  = recall_score(y_test_enc, y_pred, average="macro")
f1m  = f1_score(y_test_enc, y_pred, average="macro")
f1w  = f1_score(y_test_enc, y_pred, average="weighted")

print("\n📊 Final Evaluation on Validation set:")
print(f"Accuracy            : {acc:.4f}")
print(f"Precision (Macro)   : {prec:.4f}")
print(f"Recall (Macro)      : {rec:.4f}")
print(f"F1-score (Macro)    : {f1m:.4f}")
print(f"F1-score (Weighted) : {f1w:.4f}")
print(f"Training time (s)   : {train_end_time - train_start_time:.4f}")
print(f"Testing time (s)    : {test_end_time - test_start_time:.4f}")

# --- Kết thúc đo thời gian tổng
total_end_time = time.process_time()
print(f"\n[CPU TIME] Total process time: {total_end_time - total_start_time:.2f} seconds")

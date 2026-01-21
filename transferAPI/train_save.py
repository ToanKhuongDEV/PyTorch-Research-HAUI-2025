# transferAPI/train_save.py
import os
import time
import copy
import numpy as np
from tqdm import tqdm
import joblib

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torchvision import datasets, transforms
from torch.utils.data import DataLoader

from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report

# ==== CẤU HÌNH ====

TRAIN_DIR = "E:/University/NCKH/Dataset/Defection/NEU-DET-added-free-label/train"
TEST_DIR  = "E:/University/NCKH/Dataset/Defection/NEU-DET-added-free-label/test"

# TRAIN_DIR = "E:/University/NCKH/Dataset/Defection/NEU-DET_Full/NEU Metal Surface Defects Data/train"
# TEST_DIR  = "E:/University/NCKH/Dataset/Defection/NEU-DET_Full/NEU Metal Surface Defects Data/test"

BATCH_SIZE = 32
LR = 0.001
NUM_EPOCHS = 100        
PATIENCE = 10
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ==== 1. ĐỊNH NGHĨA MODEL ====
class MetalConvNet(nn.Module):
    def __init__(self, in_channels=1, num_classes=10, feat_dim=128):
        super().__init__()
        # Input: (Batch, 1, 200, 200)
        self.conv1 = nn.Conv2d(in_channels, 16, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(16)
        
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(32)
        
        self.conv3 = nn.Conv2d(32, 64, 3, padding=1)
        self.bn3 = nn.BatchNorm2d(64)
        
        self.pool = nn.MaxPool2d(2, 2)
        self.gap = nn.AdaptiveAvgPool2d(1) # Global Average Pooling -> (Batch, 64, 1, 1)
        
        self.fc_feat = nn.Linear(64, feat_dim)
        self.fc_out = nn.Linear(feat_dim, num_classes)

    def forward(self, x, feature_extract=False):
        # Layer 1
        x = self.pool(F.relu(self.bn1(self.conv1(x))))
        # Layer 2
        x = self.pool(F.relu(self.bn2(self.conv2(x))))
        # Layer 3
        x = self.pool(F.leaky_relu(self.bn3(self.conv3(x)), 0.1))
        
        # Global Avg Pool & Flatten
        x = self.gap(x)
        x = x.view(x.size(0), -1) # (Batch, 64)
        
        # Feature Vector
        feat = F.relu(self.fc_feat(x)) # (Batch, 128)
        
        if feature_extract:
            return feat
            
        # Classification Head (chỉ dùng lúc train CNN)
        out = self.fc_out(feat)
        return out

# ==== 2. TIỀN XỬ LÝ DỮ LIỆU ====
# Transform cho tập Train
train_transform = transforms.Compose([
    transforms.Grayscale(num_output_channels=1),
    
    # 1. Biến đổi hình học
    transforms.Resize((220, 220)), # Resize lớn hơn chút
    transforms.RandomCrop(200),    # Cắt ngẫu nhiên về 200 -> Tạo sự dịch chuyển
    transforms.RandomHorizontalFlip(p=0.5),
    transforms.RandomVerticalFlip(p=0.5),
    transforms.RandomRotation(degrees=15), # Xoay nhẹ +/- 15 độ
    transforms.RandomAffine(degrees=0, translate=(0.1, 0.1), scale=(0.9, 1.1)), # Co giãn nhẹ
    
    # 2. Biến đổi chất lượng ảnh
    transforms.ColorJitter(brightness=0.2, contrast=0.2), # Thay đổi độ sáng/tương phản
    transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 2.0)), # Làm mờ nhẹ
    transforms.ToTensor(),
    transforms.Normalize([0.5], [0.5])
])

# Transform cho tập Test
test_transform = transforms.Compose([
    transforms.Grayscale(num_output_channels=1), 
    transforms.Resize((200, 200)),
    transforms.ToTensor(),
    transforms.Normalize([0.5], [0.5])
])

print(f"Loading data from: {TRAIN_DIR}")
# Lưu ý: Train dùng train_transform, Test dùng test_transform
train_dataset = datasets.ImageFolder(TRAIN_DIR, transform=train_transform)
test_dataset = datasets.ImageFolder(TEST_DIR, transform=test_transform)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False)

class_names = train_dataset.classes
num_classes = len(class_names)
print(f"Detected {num_classes} classes: {class_names}")

# ==== 3. KHỞI TẠO MODEL ====
# in_channels=1 vì ta dùng Grayscale
model = MetalConvNet(in_channels=1, num_classes=num_classes, feat_dim=128).to(DEVICE)

# ==== 4. HUẤN LUYỆN CNN VỚI EARLY STOPPING ====
def train_model_with_patience(model, train_loader, val_loader, epochs, patience):
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=LR)
    
    best_model_wts = copy.deepcopy(model.state_dict())
    best_acc = 0.0
    patience_counter = 0 # Đếm số epoch không cải thiện
    
    start_time = time.time()
    
    print(f"\n--- Starting Training (Patience={patience}) ---")
    
    for epoch in range(epochs):
        # A. Training Phase
        model.train()
        running_loss = 0.0
        correct_train = 0
        total_train = 0
        
        for images, labels in train_loader:
            images, labels = images.to(DEVICE), labels.to(DEVICE)
            
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            total_train += labels.size(0)
            correct_train += (preds == labels).sum().item()
            
        epoch_loss = running_loss / total_train
        epoch_acc = 100 * correct_train / total_train
        
        # B. Validation Phase
        model.eval()
        correct_val = 0
        total_val = 0
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(DEVICE), labels.to(DEVICE)
                outputs = model(images)
                _, preds = torch.max(outputs, 1)
                total_val += labels.size(0)
                correct_val += (preds == labels).sum().item()
        
        val_acc = 100 * correct_val / total_val
        
        print(f"Epoch [{epoch+1}/{epochs}] "
              f"Train Loss: {epoch_loss:.4f} Acc: {epoch_acc:.2f}% | "
              f"Val Acc: {val_acc:.2f}%")
        
        # C. Early Stopping Logic
        if val_acc > best_acc:
            best_acc = val_acc
            best_model_wts = copy.deepcopy(model.state_dict())
            patience_counter = 0 # Reset đếm
            print(f"  -> New best model found! (Acc: {best_acc:.2f}%)")
        else:
            patience_counter += 1
            print(f"  -> No improvement. Patience: {patience_counter}/{patience}")
            
        if patience_counter >= patience:
            print(f"\nEarly stopping triggered after {epoch+1} epochs.")
            break
            
    time_elapsed = time.time() - start_time
    print(f"Training complete in {time_elapsed // 60:.0f}m {time_elapsed % 60:.0f}s")
    print(f"Best Val Acc: {best_acc:.2f}%")
    
    # Load trọng số tốt nhất vào model
    model.load_state_dict(best_model_wts)
    return model

# Bắt đầu train
model = train_model_with_patience(model, train_loader, test_loader, NUM_EPOCHS, PATIENCE)

# ==== 5. TRÍCH XUẤT ĐẶC TRƯNG CHO SVM ====
print("\n--- Extracting Features for SVM ---")
def extract_features(model, dataloader):
    model.eval()
    all_feats = []
    all_labels = []
    with torch.no_grad():
        for images, labels in tqdm(dataloader, desc="Extracting"):
            images = images.to(DEVICE)
            # feature_extract=True để lấy vector 128 chiều thay vì logits
            feats = model(images, feature_extract=True)
            all_feats.append(feats.cpu().numpy())
            all_labels.append(labels.numpy())
    X = np.concatenate(all_feats, axis=0)
    y = np.concatenate(all_labels, axis=0)
    return X, y

X_train, y_train = extract_features(model, train_loader)
X_test, y_test = extract_features(model, test_loader)

# ==== 6. HUẤN LUYỆN SVM ====
print("\n--- Training SVM ---")
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

svm = SVC(kernel='rbf', C=10.0, probability=True) 
svm.fit(X_train_scaled, y_train)
print("SVM Training Finished.")

# ==== 7. ĐÁNH GIÁ KẾT QUẢ ====
y_pred = svm.predict(X_test_scaled)
acc = accuracy_score(y_test, y_pred)
print(f"\nSVM Accuracy on Test Set: {acc:.4f}")
print(classification_report(y_test, y_pred, target_names=class_names))

# ==== 8. LƯU FILE ====
os.makedirs("saved", exist_ok=True)

# Lưu Model CNN
torch.save(model.state_dict(), "saved/resnet_weights.pth")
# Lưu Scaler
joblib.dump(scaler, "saved/scaler.pkl")
# Lưu SVM
joblib.dump(svm, "saved/svm_model.pkl")
# Lưu Classes
NAME_MAPPING = {
    "MT_Blowhole": "Rỗ khí (Blowhole)",
    "MT_Break":    "Gãy nứt (Break)",
    "MT_Crack":    "Vết nứt (Crack)",
    "MT_Fray":     "Xước xơ (Fray)",
    "MT_Free":     "Sản phẩm tốt",
    "MT_Uneven":   "Bề mặt lồi lõm (Uneven)",
}

new_class_names = [NAME_MAPPING.get(name, name) for name in class_names]

print("\nĐang lưu danh sách tên lỗi mới:", new_class_names)

np.save("saved/classes.npy", np.array(new_class_names))

print("Files created: resnet_weights.pth, scaler.pkl, svm_model.pkl, classes.npy")
# CNN_SVM.py
import os
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import datasets, transforms
from torch.utils.data import DataLoader
from sklearn.svm import SVC
from sklearn.metrics import classification_report, accuracy_score
from sklearn.metrics import precision_score, recall_score, f1_score
from sklearn.preprocessing import StandardScaler
import numpy as np
from tqdm import tqdm
import time


# ==== CẤU HÌNH ====
TRAIN_DIR = ""
TEST_DIR = ""
BATCH_SIZE = 32
LR = 0.001
NUM_EPOCHS = 50
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ==== TIỀN XỬ LÝ ====
transform = transforms.Compose([
    transforms.Grayscale(num_output_channels=1),
    transforms.Resize((200, 200)),
    transforms.ToTensor(),
    transforms.Normalize([0.5], [0.5])
])

train_dataset = datasets.ImageFolder(TRAIN_DIR, transform=transform)
test_dataset = datasets.ImageFolder(TEST_DIR, transform=transform)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False)

class_names = train_dataset.classes
num_classes = len(class_names)

# ==== MÔ HÌNH RESNET ĐƠN GIẢN ====
class BasicBlock(nn.Module):
    def __init__(self, in_channels, out_channels, stride=1):
        super(BasicBlock, self).__init__()
        self.conv1 = nn.Conv2d(in_channels, out_channels, 3, stride, 1, bias=False)
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.conv2 = nn.Conv2d(out_channels, out_channels, 3, 1, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_channels)

        self.shortcut = nn.Sequential()
        if stride != 1 or in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, 1, stride, bias=False),
                nn.BatchNorm2d(out_channels)
            )

    def forward(self, x):
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += self.shortcut(x)
        out = F.relu(out)
        return out

class SimpleResNet(nn.Module):
    def __init__(self, block, num_blocks, num_classes):
        super(SimpleResNet, self).__init__()
        self.in_channels = 16

        self.conv1 = nn.Conv2d(1, 16, 3, 1, 1, bias=False)
        self.bn1 = nn.BatchNorm2d(16)

        self.layer1 = self._make_layer(block, 16, num_blocks[0], stride=1)
        self.layer2 = self._make_layer(block, 32, num_blocks[1], stride=2)
        self.layer3 = self._make_layer(block, 64, num_blocks[2], stride=2)

        self.avgpool = nn.AdaptiveAvgPool2d((1, 1))
        self.fc = nn.Linear(64, num_classes)

    def _make_layer(self, block, out_channels, blocks, stride):
        strides = [stride] + [1]*(blocks-1)
        layers = []
        for s in strides:
            layers.append(block(self.in_channels, out_channels, s))
            self.in_channels = out_channels
        return nn.Sequential(*layers)

    def forward(self, x, feature_extract=False):
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.layer1(out)
        out = self.layer2(out)
        out = self.layer3(out)
        out = self.avgpool(out)
        out = out.view(out.size(0), -1)
        if feature_extract:
            return out
        else:
            out = self.fc(out)
            return out

# ==== HUẤN LUYỆN MẠNG RESNET ====
total_start_cpu = time.process_time()
def train_cnn(model, dataloader, num_epochs):
    model.train()
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)

    for epoch in range(num_epochs):
        total, correct, running_loss = 0, 0, 0
        for images, labels in dataloader:
            images, labels = images.to(DEVICE), labels.to(DEVICE)
            outputs = model(images)
            loss = criterion(outputs, labels)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            running_loss += loss.item()
            _, preds = torch.max(outputs, 1)
            total += labels.size(0)
            correct += (preds == labels).sum().item()

        print(f"[Epoch {epoch+1}] Loss: {running_loss:.4f} Accuracy: {100*correct/total:.2f}%")
    return model

# ==== TRÍCH XUẤT ĐẶC TRƯNG BẰNG MẠNG ====
def extract_features(model, dataloader):
    model.eval()
    all_features = []
    all_labels = []
    with torch.no_grad():
        for images, labels in tqdm(dataloader, desc="Extracting features"):
            images = images.to(DEVICE)
            feats = model(images, feature_extract=True)
            all_features.append(feats.cpu().numpy())
            all_labels.append(labels.numpy())
    return np.concatenate(all_features), np.concatenate(all_labels)

# ==== HUẤN LUYỆN VÀ ĐÁNH GIÁ SVM (CÓ THỐNG KÊ) ====
def train_and_test_svm(X_train, y_train, X_test, y_test):
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    # Bắt đầu đo thời gian train SVM
    train_start = time.time()
    svm = SVC(kernel='linear', C=1.0)
    svm.fit(X_train, y_train)
    train_end = time.time()

    # Đo thời gian test
    test_start = time.time()
    y_pred = svm.predict(X_test)
    test_end = time.time()

    # Tính các chỉ số
    acc = accuracy_score(y_test, y_pred)
    precision_macro = precision_score(y_test, y_pred, average='macro')
    recall_macro = recall_score(y_test, y_pred, average='macro')
    f1_macro = f1_score(y_test, y_pred, average='macro')
    f1_weighted = f1_score(y_test, y_pred, average='weighted')

    # In kết quả
    print("\n===== KẾT QUẢ ĐÁNH GIÁ =====")
    print(f"Accuracy           : {acc:.4f}")
    print(f"Precision (Macro)  : {precision_macro:.4f}")
    print(f"Recall (Macro)     : {recall_macro:.4f}")
    print(f"F1-score (Macro)   : {f1_macro:.4f}")
    print(f"F1-score (Weighted): {f1_weighted:.4f}")
    print(f"Training time (s)  : {train_end - train_start:.4f}")
    print(f"Testing time (s)   : {test_end - test_start:.4f}")


# ==== MAIN ====
if __name__ == "__main__":
    print("🔧 Training ResNet feature extractor...")
    model = SimpleResNet(BasicBlock, [1,1,1], num_classes).to(DEVICE)

    # Đo thời gian train CNN
    cnn_train_start = time.time()
    model = train_cnn(model, train_loader, NUM_EPOCHS)
    cnn_train_end = time.time()
    print(f"\n[INFO] CNN Training time: {cnn_train_end - cnn_train_start:.4f} seconds")

    print("\nExtracting features from train and test sets...")
    X_train, y_train = extract_features(model, train_loader)
    X_test, y_test = extract_features(model, test_loader)

    print("\nTraining and evaluating SVM classifier...")
    train_and_test_svm(X_train, y_train, X_test, y_test)
# train_save.py
import os
import time
import numpy as np
from tqdm import tqdm
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
import joblib

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import datasets, transforms
from torch.utils.data import DataLoader

from model_def import SimpleResNet, BasicBlock

# ==== CẤU HÌNH ====
TRAIN_DIR = "D:/DATASET/GC10-DET-DIVIDED/train"
TEST_DIR  = "D:/DATASET/GC10-DET-DIVIDED/val"
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
print("Classes:", class_names)

# ==== MÔ HÌNH ====
model = SimpleResNet(BasicBlock, [1,1,1], num_classes).to(DEVICE)

# ==== HUẤN LUYỆN CNN ====
def train_cnn(model, dataloader, num_epochs):
    model.train()
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)

    start = time.time()
    for epoch in range(num_epochs):
        running_loss = 0.0
        total = 0
        correct = 0
        for images, labels in dataloader:
            images, labels = images.to(DEVICE), labels.to(DEVICE)
            outputs = model(images)
            loss = criterion(outputs, labels)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            total += labels.size(0)
            correct += (preds == labels).sum().item()

        epoch_loss = running_loss / total
        epoch_acc = 100 * correct / total
        print(f"[Epoch {epoch+1}/{num_epochs}] Loss: {epoch_loss:.4f} Acc: {epoch_acc:.2f}%")
    print("Finished CNN training. Time:", time.time() - start)
    return model

model = train_cnn(model, train_loader, NUM_EPOCHS)

# ==== TRÍCH XUẤT ĐẶC TRƯNG ====
def extract_features(model, dataloader):
    model.eval()
    all_feats = []
    all_labels = []
    with torch.no_grad():
        for images, labels in tqdm(dataloader, desc="Extracting features"):
            images = images.to(DEVICE)
            feats = model(images, feature_extract=True)
            all_feats.append(feats.cpu().numpy())
            all_labels.append(labels.numpy())
    X = np.concatenate(all_feats, axis=0)
    y = np.concatenate(all_labels, axis=0)
    return X, y

X_train, y_train = extract_features(model, train_loader)
X_test, y_test = extract_features(model, test_loader)

# ==== HUẤN LUYỆN SVM (probability=True) ====
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

svm = SVC(kernel='linear', C=1.0, probability=True)  # BẬT probability
print("Training SVM (this may take time)...")
t0 = time.time()
svm.fit(X_train_scaled, y_train)
print("SVM trained in", time.time() - t0, "s")

# ==== ĐÁNH GIÁ SVM ====
y_pred = svm.predict(X_test_scaled)
acc = accuracy_score(y_test, y_pred)
precision_macro = precision_score(y_test, y_pred, average='macro', zero_division=0)
recall_macro = recall_score(y_test, y_pred, average='macro', zero_division=0)
f1_macro = f1_score(y_test, y_pred, average='macro', zero_division=0)
f1_weighted = f1_score(y_test, y_pred, average='weighted', zero_division=0)

print("\n===== SVM EVAL =====")
print(f"Accuracy: {acc:.4f}")
print(f"Precision (macro): {precision_macro:.4f}")
print(f"Recall (macro): {recall_macro:.4f}")
print(f"F1 (macro): {f1_macro:.4f}")
print(f"F1 (weighted): {f1_weighted:.4f}")

# ==== LƯU MÔ HÌNH & SCALER & CLASSES ====
os.makedirs("saved", exist_ok=True)
torch.save(model.state_dict(), "saved/resnet_weights.pth")
joblib.dump(scaler, "saved/scaler.pkl")
joblib.dump(svm, "saved/svm_model.pkl")
np.save("saved/classes.npy", np.array(class_names))

print("Saved files to ./saved: resnet_weights.pth, scaler.pkl, svm_model.pkl, classes.npy")

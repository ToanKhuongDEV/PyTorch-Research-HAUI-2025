import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import datasets, transforms
from torch.utils.data import DataLoader
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report
import numpy as np
from tqdm import tqdm
import torch.optim as optim

# -----------------------------
# 1) CNN Model
# -----------------------------
class MetalConvNet(nn.Module):
    def __init__(self, in_channels=3, num_classes=10, feat_dim=128):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels, 16, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(16)
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(32)
        self.conv3 = nn.Conv2d(32, 64, 3, padding=1)
        self.bn3 = nn.BatchNorm2d(64)
        self.pool = nn.MaxPool2d(2,2)
        self.gap = nn.AdaptiveAvgPool2d(1)
        self.fc_feat = nn.Linear(64, feat_dim)
        self.fc_out = nn.Linear(feat_dim, num_classes)  # Softmax head

    def forward(self, x, return_feat=False):
        x = self.pool(F.relu(self.bn1(self.conv1(x))))
        x = self.pool(F.relu(self.bn2(self.conv2(x))))
        x = self.pool(F.leaky_relu(self.bn3(self.conv3(x)), 0.1))
        x = self.gap(x)
        x = x.view(x.size(0), -1)
        feat = F.relu(self.fc_feat(x))
        if return_feat:
            return feat
        out = self.fc_out(feat)
        return out

# -----------------------------
# 2) Data loader
# -----------------------------
def get_loaders(data_dir, batch_size=32, img_size=128):
    transform = transforms.Compose([
        transforms.Resize((img_size,img_size)),
        transforms.ToTensor(),
        transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])
    ])
    train_ds = datasets.ImageFolder(f"{data_dir}/train", transform=transform)
    val_ds = datasets.ImageFolder(f"{data_dir}/test", transform=transform)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)
    return train_loader, val_loader, train_ds.classes

# -----------------------------
# 3) Feature extraction
# -----------------------------
def extract_features(model, loader, device):
    model.eval()
    feats_list = []
    labels_list = []
    with torch.no_grad():
        for imgs, lbls in tqdm(loader, desc="Extract features"):
            imgs = imgs.to(device)
            feat = model(imgs, return_feat=True)
            feats_list.append(feat.cpu().numpy())
            labels_list.append(lbls.numpy())
    X = np.vstack(feats_list)
    y = np.concatenate(labels_list)
    return X, y

# -----------------------------
# 4) Main pipeline
# -----------------------------
def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    data_dir = "NEU-DET"  # train/ val/ subfolders per class
    epochs = 10
    batch_size = 32
    lr = 1e-3

    print("Using device:", device)
    train_loader, val_loader, classes = get_loaders(data_dir, batch_size=batch_size)
    print("Classes:", classes)

    # 4.1 CNN model
    model = MetalConvNet(num_classes=len(classes), feat_dim=128).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr)

    # 4.2 Train CNN
    print("Training CNN...")
    for epoch in range(epochs):
        model.train()
        running_loss = 0
        for imgs, labels in train_loader:
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(imgs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()
        print(f"Epoch {epoch+1}/{epochs}, Loss: {running_loss/len(train_loader):.4f}")

    # 4.3 Extract features
    print("Extracting features...")
    X_train, y_train = extract_features(model, train_loader, device)
    X_val, y_val = extract_features(model, val_loader, device)
    print("Feature shapes:", X_train.shape, X_val.shape)

    # 4.4 Standardize features
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_val_s = scaler.transform(X_val)

    # 4.5 Train SVM
    print("Training SVM...")
    svm = SVC(kernel='linear', C=1.0)
    svm.fit(X_train_s, y_train)

    # 4.6 Predict & evaluate
    y_train_pred = svm.predict(X_train_s)
    y_val_pred = svm.predict(X_val_s)

    print("=== Train set ===")
    print("Accuracy:", accuracy_score(y_train, y_train_pred))
    print(classification_report(y_train, y_train_pred, target_names=classes))

    print("=== Validation set ===")
    print("Accuracy:", accuracy_score(y_val, y_val_pred))
    print(classification_report(y_val, y_val_pred, target_names=classes))

if __name__ == "__main__":
    main()

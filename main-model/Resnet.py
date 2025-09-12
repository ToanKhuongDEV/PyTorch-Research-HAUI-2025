# Resnet
import os
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, transforms
from torch.utils.data import DataLoader
import torch.nn.functional as F
import time
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

# ========= CẤU HÌNH ==========
data_dir = "/kaggle/input/severstal-steel-defect-detection"
batch_size = 32
num_epochs = 50
learning_rate = 0.001
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

total_start_cpu = time.process_time()

# ========= TIỀN XỬ LÝ ẢNH ==========
transform = transforms.Compose([
    transforms.Resize((128, 128)),
    transforms.ToTensor(),
    transforms.Normalize([0.5], [0.5])
])

train_dataset = datasets.ImageFolder(os.path.join(data_dir, 'train_images'), transform=transform)
val_dataset = datasets.ImageFolder(os.path.join(data_dir, 'test_images'), transform=transform)

train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

num_classes = len(train_dataset.classes)
class_names = train_dataset.classes

# ========= RESIDUAL BLOCK ==========
class ResidualBlock(nn.Module):
    def __init__(self, in_channels, out_channels, stride=1):
        super(ResidualBlock, self).__init__()
        self.conv1 = nn.Conv2d(in_channels, out_channels, kernel_size=3, stride=stride, padding=1)
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.relu = nn.ReLU()
        self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=3, stride=1, padding=1)
        self.bn2 = nn.BatchNorm2d(out_channels)

        self.skip = nn.Sequential()
        if stride != 1 or in_channels != out_channels:
            self.skip = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, kernel_size=1, stride=stride),
                nn.BatchNorm2d(out_channels)
            )

    def forward(self, x):
        identity = self.skip(x)
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += identity
        return self.relu(out)

# ========= MẠNG RESNET ==========
class SimpleResNet(nn.Module):
    def __init__(self, num_classes):
        super(SimpleResNet, self).__init__()
        self.layer1 = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, stride=1, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU()
        )
        self.res1 = ResidualBlock(32, 32)
        self.res2 = ResidualBlock(32, 64, stride=2)
        self.res3 = ResidualBlock(64, 128, stride=2)
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.fc = nn.Linear(128, num_classes)

    def forward(self, x):
        out = self.layer1(x)
        out = self.res1(out)
        out = self.res2(out)
        out = self.res3(out)
        out = self.pool(out)
        out = out.view(out.size(0), -1)
        return self.fc(out)

# ========= HUẤN LUYỆN ==========
def train(model, loader, optimizer, criterion):
    model.train()
    running_loss, correct, total = 0.0, 0, 0
    for imgs, labels in loader:
        imgs, labels = imgs.to(device), labels.to(device)

        outputs = model(imgs)
        loss = criterion(outputs, labels)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * imgs.size(0)
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()

    return running_loss / total, 100.0 * correct / total

# ========= ĐÁNH GIÁ ==========
def evaluate(model, loader, criterion):
    model.eval()
    running_loss, correct, total = 0.0, 0, 0
    all_labels, all_preds = [], []
    with torch.no_grad():
        for imgs, labels in loader:
            imgs, labels = imgs.to(device), labels.to(device)

            outputs = model(imgs)
            loss = criterion(outputs, labels)

            running_loss += loss.item() * imgs.size(0)
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()

            all_labels.extend(labels.cpu().numpy())
            all_preds.extend(predicted.cpu().numpy())

    acc = accuracy_score(all_labels, all_preds)
    precision_macro = precision_score(all_labels, all_preds, average='macro')
    recall_macro = recall_score(all_labels, all_preds, average='macro')
    f1_macro = f1_score(all_labels, all_preds, average='macro')
    f1_weighted = f1_score(all_labels, all_preds, average='weighted')

    return (running_loss / total, acc, precision_macro, recall_macro, f1_macro, f1_weighted)

# ========= CHẠY ==========
def main():
    model = SimpleResNet(num_classes=num_classes).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=learning_rate)

    train_start_time = time.time()
    for epoch in range(1, num_epochs + 1):
        train_loss, train_acc = train(model, train_loader, optimizer, criterion)
        val_loss, acc, prec, rec, f1m, f1w = evaluate(model, val_loader, criterion)

        print(f"Epoch {epoch}/{num_epochs} | "
              f"Train Loss: {train_loss:.4f}, Acc: {train_acc:.2f}% | "
              f"Val Loss: {val_loss:.4f}, "
              f"Acc: {acc*100:.2f}%, Precision(Macro): {prec:.4f}, Recall(Macro): {rec:.4f}, "
              f"F1(Macro): {f1m:.4f}, F1(Weighted): {f1w:.4f}")

    train_end_time = time.time()

    # Testing
    test_start_time = time.time()
    val_loss, acc, prec, rec, f1m, f1w = evaluate(model, val_loader, criterion)
    test_end_time = time.time()

    print("\n📊 Final Evaluation on Validation set:")
    print(f"Accuracy            : {acc:.4f}")
    print(f"Precision (Macro)   : {prec:.4f}")
    print(f"Recall (Macro)      : {rec:.4f}")
    print(f"F1-score (Macro)    : {f1m:.4f}")
    print(f"F1-score (Weighted) : {f1w:.4f}")
    print(f"Training time (s)   : {train_end_time - train_start_time:.4f}")
    print(f"Testing time (s)    : {test_end_time - test_start_time:.4f}")


    torch.save(model.state_dict(), "simple_resnet_neudet.pth")

if __name__ == "__main__":
    main()
    total_end_cpu = time.process_time()
    print(f"[CPU TIME] Total process time: {total_end_cpu - total_start_cpu:.2f} seconds")

import torch
import torch.nn as nn
import torch.nn.functional as F

class CNN(nn.Module):
    def __init__(self):
        super(CNN, self).__init__()
        # --- 3 lớp Convolution ---
        self.conv1 = nn.Conv2d(in_channels=1, out_channels=32, kernel_size=3, padding=1)   # 28x28 -> 28x28
        self.conv2 = nn.Conv2d(in_channels=32, out_channels=64, kernel_size=3, padding=1)  # 14x14 -> 14x14
        self.conv3 = nn.Conv2d(in_channels=64, out_channels=128, kernel_size=3, padding=1) # 7x7 -> 7x7
        # --- 3 lớp Pooling ---
        self.pool = nn.MaxPool2d(kernel_size=2, stride=2)
        # --- 3 lớp Fully Connected ---
        self.fc1 = nn.Linear(128 * 3 * 3, 256)
        self.fc2 = nn.Linear(256, 64)
        self.fc3 = nn.Linear(64, 10)  # 10 lớp cho MNIST

        torch.manual_seed(42)  # seed cố định
        nn.init.uniform_(self.fc1.weight, a=-10, b=10)
        nn.init.uniform_(self.fc2.weight, a=-10, b=10)
        nn.init.uniform_(self.fc3.weight, a=-10, b=10)

        nn.init.constant_(self.fc1.bias, 0.0)
        nn.init.constant_(self.fc2.bias, 0.0)
        nn.init.constant_(self.fc3.bias, 0.0)


    def forward(self, x): # định nghĩa cấu trúc mạng
        # --- Convolution + ReLU + Pooling ---
        x = self.pool(F.relu(self.conv1(x)))  # 1 -> 32, 28x28 -> 14x14
        x = self.pool(F.relu(self.conv2(x)))  # 32 -> 64, 14x14 -> 7x7
        x = self.pool(F.relu(self.conv3(x)))  # 64 -> 128, 7x7 -> 3x3
        x = torch.flatten(x, start_dim=1)
        # --- Fully Connected ---
        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))
        x = self.fc3(x)
        return x


class CNN2(nn.Module): #cat or dog
    def __init__(self):
        super(CNN2, self).__init__()
        # --- Convolution ---
        self.conv1 = nn.Conv2d(in_channels=3, out_channels=32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        # --- Fully Connected ---
        self.fc1 = nn.Linear(128 * 16 * 16, 256)
        self.fc2 = nn.Linear(256, 2)
        #self.fc3 = nn.Linear(64, 2)  # 2 lớp: cats, dogs

    def forward(self, x):
        x = self.conv1(x)
        x = F.relu(x)
        x = self.pool(x)
        x = self.conv2(x)
        x = F.relu(x)
        x = self.pool(x)
        x = self.conv3(x)
        x = F.relu(x)
        x = self.pool(x)

        x = torch.flatten(x, start_dim=1)
        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))


        #x = self.fc3(x)
        return x

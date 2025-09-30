# app.py
import io
import numpy as np
import joblib
from PIL import Image

import torch
from torchvision import transforms

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from model_def import SimpleResNet, BasicBlock

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Load classes
classes = np.load("saved/classes.npy", allow_pickle=True).tolist()
num_classes = len(classes)

# Load CNN weights
model = SimpleResNet(BasicBlock, [1,1,1], num_classes).to(DEVICE)
model.load_state_dict(torch.load("saved/resnet_weights.pth", map_location=DEVICE))
model.eval()

# Load scaler + svm
scaler = joblib.load("saved/scaler.pkl")
svm = joblib.load("saved/svm_model.pkl")  # trained with probability=True

# Preprocess
transform = transforms.Compose([
    transforms.Grayscale(num_output_channels=1),
    transforms.Resize((200, 200)),
    transforms.ToTensor(),
    transforms.Normalize([0.5], [0.5])
])

app = FastAPI(title="Defect Classification API")

# Allow CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        tensor = transform(img).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            feats = model(tensor, feature_extract=True).cpu().numpy()

        feats_scaled = scaler.transform(feats)
        probs = svm.predict_proba(feats_scaled)[0]  # shape (n_classes,)
        pred_idx = int(np.argmax(probs))
        confidence = float(probs[pred_idx])

        # Build per-class probabilities dict
        per_class = {classes[i]: float(probs[i]) for i in range(len(classes))}

        return JSONResponse({
            "class": classes[pred_idx],
            "confidence": confidence,
            "probabilities": per_class
        })

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

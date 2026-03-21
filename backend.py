import os
import base64
import io
import numpy as np
from PIL import Image
import tensorflow as tf
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# ── Cấu hình ────────────────────────────────────────────────
DATA_DIR   = "PlantDiseases/"
MODELS_DIR = "models_new/"
IMG_SIZE   = (256, 256)

# ── Xây crop_dict ────────────────────────────────────────────
class_folders = sorted([
    f for f in os.listdir(DATA_DIR)
    if os.path.isdir(os.path.join(DATA_DIR, f))
])

crop_dict = {}
for folder in class_folders:
    crop = folder.split("___")[0] if "___" in folder else folder.split("_")[0]
    if crop not in crop_dict:
        crop_dict[crop] = []
    crop_dict[crop].append(folder)

crop_names = list(crop_dict.keys())
print(f"crop_names   : {crop_names}")
print(f"Total classes: {len(class_folders)}")

# ── Load models ──────────────────────────────────────────────
print("\nĐang load models...")
crop_model = tf.keras.models.load_model(
    os.path.join(MODELS_DIR, "0_crop_classifier.keras")
)
print(f"  ✅ Crop classifier: output {crop_model.output_shape}")

disease_models = {}
for crop in crop_names:
    path = os.path.join(MODELS_DIR, f"{crop}_disease_classifier.keras")
    disease_models[crop] = tf.keras.models.load_model(path)
    print(f"  ✅ {crop}: {disease_models[crop].output_shape[-1]} classes")

print(f"\nĐã load xong {1 + len(disease_models)} models!")

# ── Validate weights ngay khi khởi động ─────────────────────
# Phát hiện sớm nếu convert_models_h5py.py không copy được weights.
# Model lỗi cho phân phối gần đều → max_prob thấp → argmax luôn = 0.
print("\n[VALIDATION] Kiểm tra weights với dummy input [-1, 1]...")
_dummy = np.random.uniform(-1, 1, (1, 256, 256, 3)).astype(np.float32)

_crop_out = crop_model.predict(_dummy, verbose=0)[0]
_crop_max = float(np.max(_crop_out))
print(f"  Crop    — probs={np.round(_crop_out*100,1).tolist()}  max={_crop_max:.4f}")
if _crop_max < 0.4:
    print("  ⚠ WARNING: Crop model cho phân phối gần đều!")
    print("    Nguyên nhân: convert_models_h5py.py chưa copy đúng Dense output layer.")
    print("    Fix: xem phần 'Nếu vẫn sai' bên dưới README.")
else:
    print("  ✅ Crop model OK")

for crop in crop_names:
    _d_out = disease_models[crop].predict(_dummy, verbose=0)[0]
    _d_max = float(np.max(_d_out))
    _n     = len(crop_dict[crop])
    status = "✅" if _d_max > (1.0/_n + 0.15) else "⚠ WARNING"
    print(f"  {status} {crop} disease — max={_d_max:.4f} (n={_n})")

print()

# ── Preprocess ───────────────────────────────────────────────
def preprocess(image_bytes: bytes) -> np.ndarray:
    """
    Decode ảnh → resize (256×256) → scale về [-1, 1].

    Model convert bởi convert_models_h5py.py KHÔNG có preprocess layer bên trong.
    → PHẢI scale thủ công về [-1, 1] trước khi truyền vào model.
    → MobileNetV2 yêu cầu: output = (pixel / 127.5) - 1.0
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize(IMG_SIZE)
    arr = np.array(img, dtype=np.float32)   # range [0, 255]
    arr = (arr / 127.5) - 1.0              # range [-1, 1]  ← đây là fix chính
    return np.expand_dims(arr, axis=0)     # (1, 256, 256, 3)

# ── Schema ───────────────────────────────────────────────────
class PredictRequest(BaseModel):
    image: str  # base64, hỗ trợ cả raw lẫn data URL (có "data:image/...")

# ── Endpoint predict ─────────────────────────────────────────
@app.post("/predict")
def predict_endpoint(req: PredictRequest):
    # 1. Decode base64
    b64         = req.image.split(",")[-1]
    image_bytes = base64.b64decode(b64)

    # 2. Preprocess → (1, 256, 256, 3) trong [-1, 1]
    arr = preprocess(image_bytes)

    # 3. Bước 1 — Crop Classifier
    crop_probs     = crop_model.predict(arr, verbose=0)[0]
    crop_idx       = int(np.argmax(crop_probs))
    predicted_crop = crop_names[crop_idx]

    # Debug log — in ra terminal để theo dõi
    print(f"[predict] crop_probs  = {np.round(crop_probs * 100, 1).tolist()}")
    print(f"[predict] → crop      = {predicted_crop} ({crop_probs[crop_idx]*100:.1f}%)")

    crop_top_k = sorted(
        [{"name": crop_names[i], "confidence": round(float(crop_probs[i]) * 100, 2)}
         for i in range(len(crop_names))],
        key=lambda x: -x["confidence"]
    )

    # 4. Bước 2 — Disease Expert của cây đã nhận diện
    disease_probs     = disease_models[predicted_crop].predict(arr, verbose=0)[0]
    disease_idx       = int(np.argmax(disease_probs))
    diseases          = crop_dict[predicted_crop]
    predicted_disease = diseases[disease_idx]

    top3 = sorted(zip(diseases, disease_probs.tolist()), key=lambda x: -x[1])[:3]
    print(f"[predict] disease top3 = {[(n, round(p*100,1)) for n,p in top3]}")
    print(f"[predict] → disease    = {predicted_disease} ({disease_probs[disease_idx]*100:.1f}%)")

    disease_top_k = sorted(
        [{"name": diseases[i], "confidence": round(float(disease_probs[i]) * 100, 2)}
         for i in range(len(diseases))],
        key=lambda x: -x["confidence"]
    )[:4]

    return {
        "crop"             : predicted_crop,
        "cropConfidence"   : round(float(crop_probs[crop_idx]) * 100, 2),
        "cropTopK"         : crop_top_k,
        "disease"          : predicted_disease,
        "diseaseConfidence": round(float(disease_probs[disease_idx]) * 100, 2),
        "diseaseTopK"      : disease_top_k,
        "isHealthy"        : "healthy" in predicted_disease.lower(),
    }

# ── Health check ─────────────────────────────────────────────
@app.get("/")
def health():
    return {
        "status": "ok",
        "crops" : crop_names,
        "models": list(disease_models.keys()),
    }
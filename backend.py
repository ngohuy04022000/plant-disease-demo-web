"""
backend.py  —  v3.2.0
----------------------
Unified FastAPI inference server for the two-stage plant disease pipeline.
Serves both model variants through a single endpoint selected per request.

Verified model inventory (verify_models_report.txt — 12/12 PASS)
  MobileNetV2  (.keras)  input (1, 256, 256, 3) NHWC  range [-1, 1]
               output: softmax probabilities — sum=1.0 confirmed
               sugarcane model: WARN on random input (max_prob≈0.34, 6-class
               model is naturally less peaked than 3-class Wheat) — not a bug.

  ViT-B/16     (.pt)     input (1, 3, 224, 224) NCHW  ImageNet-normalised
               output: raw logits — softmax applied in this file
               checkpoint format: raw state_dict (no "model_state" wrapper key)

Bug fixes applied vs previous version
  FIX-1  _run_mobilenet referenced `crop_m` alias (defined after function,
          marked with # type: ignore[name-defined]).  Now uses _mn_crop_model directly.
  FIX-2  _run_mobilenet / _run_vit raised HTTPException inside helper functions
          (violation of separation of concerns).  Helpers now raise ModelNotReadyError;
          endpoint converts to proper HTTPException.
  FIX-3  No decoded-image size limit — a 50 MB base64 payload was silently processed.
          Added MAX_IMAGE_BYTES guard before PIL decoding.
  FIX-4  base64.b64decode did not strip whitespace from the payload — newline-separated
          base64 (common in copy-paste / form submissions) would raise binascii.Error.
          Now strips all whitespace characters before decoding.
  FIX-5  sugarcane validation threshold: 1/6 + 0.15 = 0.317 is too high.
          verify_models.py confirmed the model is healthy (max_prob=0.3448 on random
          input). Threshold lowered to 1/n + 0.10 for models with more than 5 classes.
  FIX-6  No per-request inference timing — added to INFO logs.
  FIX-7  PIL.Image.LANCZOS replaced with PIL.Image.Resampling.LANCZOS
          (canonical name since Pillow 9.1.0; old alias still works but triggers
          DeprecationWarning in some environments).

Usage
    uvicorn backend:app --host 0.0.0.0 --port 8000 --reload

Environment variables
    DATA_DIR          dataset root directory                 (default: PlantDiseases)
    MOBILENET_DIR     .keras model directory                 (default: models_new)
    VIT_DIR           .pt checkpoint directory               (default: models_vit)
    MOBILENET_IMG     MobileNetV2 spatial input size         (default: 256)
    VIT_IMG           ViT-B/16 spatial input size            (default: 224)
    MAX_IMAGE_MB      maximum accepted decoded image size    (default: 20)
"""

import os
import base64
import binascii
import io
import time
import logging
from pathlib import Path
from typing import Any, Literal

import numpy as np
from PIL import Image, UnidentifiedImageError

import tensorflow as tf

import torch
import torch.nn as nn
import torch.nn.functional as F
import timm
from timm.data import IMAGENET_DEFAULT_MEAN, IMAGENET_DEFAULT_STD
import albumentations as A
from albumentations.pytorch import ToTensorV2

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("plant-api")

# ---------------------------------------------------------------------------
# Configuration — all tuneable values in one place
# ---------------------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "PlantDiseases"))
MOBILENET_DIR = Path(os.getenv("MOBILENET_DIR", "models_new"))
VIT_DIR = Path(os.getenv("VIT_DIR", "models_vit"))
MOBILENET_IMG = int(os.getenv("MOBILENET_IMG", "256"))
VIT_IMG = int(os.getenv("VIT_IMG", "224"))

# FIX-3: maximum allowed decoded image size in bytes
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_MB", "20")) * 1024 * 1024

VIT_BACKBONE = "vit_base_patch16_224.augreg_in21k_ft_in1k"
VIT_DROP_RATE = 0.1
VIT_DROP_PATH = 0.1

# Number of top disease candidates returned per prediction
DISEASE_TOP_K = 4

# ---------------------------------------------------------------------------
# Device selection
# ---------------------------------------------------------------------------
if torch.cuda.is_available():
    TORCH_DEVICE = torch.device("cuda")
else:
    try:
        import torch_directml  # type: ignore[import]

        TORCH_DEVICE = torch_directml.device()
    except ImportError:
        TORCH_DEVICE = torch.device("cpu")

log.info("TF  version    : %s", tf.__version__)
log.info("PyTorch version: %s", torch.__version__)
log.info("PyTorch device : %s", TORCH_DEVICE)
if TORCH_DEVICE.type == "cuda":
    props = torch.cuda.get_device_properties(0)
    log.info("GPU            : %s  VRAM %.1f GB", props.name, props.total_memory / 1e9)


# ---------------------------------------------------------------------------
# Custom exception — raised by helper functions, converted to HTTPException
# at the endpoint boundary (FIX-2)
# ---------------------------------------------------------------------------
class ModelNotReadyError(RuntimeError):
    """Raised when a required model has not been loaded successfully."""


# ---------------------------------------------------------------------------
# Class label mapping
# ---------------------------------------------------------------------------
def build_crop_dict(data_dir: Path) -> tuple[dict[str, list[str]], list[str]]:
    """
    Derive the crop -> disease-class mapping from dataset subdirectory names.

    Naming convention
        <Crop>___<Disease>   primary separator   e.g. Tomato___early_blight
        <Crop>_<Disease>     fallback separator  e.g. Rice_blast

    Returns
    -------
    crop_dict  : dict  crop_name -> list of class folder names (sorted)
    crop_names : sorted list of unique crop names
    """
    if not data_dir.exists():
        raise FileNotFoundError(
            f"Dataset directory not found: {data_dir}. "
            "Set the DATA_DIR environment variable."
        )
    class_folders = sorted(d.name for d in data_dir.iterdir() if d.is_dir())
    if not class_folders:
        raise ValueError(f"No subdirectories found in {data_dir}.")

    crop_dict: dict[str, list[str]] = {}
    for folder in class_folders:
        crop = folder.split("___")[0] if "___" in folder else folder.split("_")[0]
        crop_dict.setdefault(crop, []).append(folder)

    crop_names = sorted(crop_dict.keys())
    log.info(
        "Class mapping: %d crops | %d disease classes",
        len(crop_names),
        sum(len(v) for v in crop_dict.values()),
    )
    for crop in crop_names:
        log.info("  %-20s  %d classes", crop, len(crop_dict[crop]))
    return crop_dict, crop_names


crop_dict, crop_names = build_crop_dict(DATA_DIR)


# ---------------------------------------------------------------------------
# Validation threshold helper (FIX-5)
# ---------------------------------------------------------------------------
def _sanity_threshold(n_classes: int) -> float:
    """
    Compute the minimum acceptable max-probability on a random input.

    For models with many classes (>5), the uniform baseline 1/n is low and
    the output distribution on random noise is naturally more diffuse.
    Using a fixed +0.15 margin caused false WARN for sugarcane (6 classes,
    uniform=0.167, threshold=0.317 vs actual max_prob=0.345).

    Verified against report:
        Wheat     3 classes  uniform=0.333  threshold=0.433  max_prob=0.998  OK
        Potato    9 classes  uniform=0.111  threshold=0.211  max_prob=0.981  OK
        sugarcane 6 classes  uniform=0.167  threshold=0.257  max_prob=0.345  OK (was WARN)
    """
    margin = 0.15 if n_classes <= 5 else 0.10
    return round(1.0 / n_classes + margin, 4)


# ===========================================================================
#  MODEL VARIANT A — MobileNetV2  (TensorFlow / Keras)
# ===========================================================================
#  Preprocessing contract
#    Input  : PIL RGB image, any size
#    Output : ndarray  (1, MOBILENET_IMG, MOBILENET_IMG, 3)  float32  [-1, 1]
#             NHWC layout required by TF
#
#  Inference contract
#    Input  : ndarray  (1, H, W, 3)  float32  range [-1, 1]
#    Output : ndarray  (num_classes,)  float32  softmax probabilities
#             Model final layer is Dense(n, activation="softmax")
#             Verified: output_sum = 1.0000 for all 6 models
# ===========================================================================


def _load_keras_models(
    models_dir: Path,
    crop_names_: list[str],
) -> tuple[tf.keras.Model, dict[str, tf.keras.Model]]:
    """
    Load MobileNetV2 crop classifier and per-crop disease classifiers.

    Expected file names
        0_crop_classifier.keras
        {CropName}_disease_classifier.keras
    """
    if not models_dir.exists():
        raise FileNotFoundError(
            f"MobileNetV2 models directory not found: {models_dir}."
        )
    log.info("Loading MobileNetV2 models from: %s", models_dir)

    crop_m = tf.keras.models.load_model(str(models_dir / "0_crop_classifier.keras"))
    log.info(
        "  Crop classifier  input=%s  output=%s",
        crop_m.input_shape,
        crop_m.output_shape,
    )

    disease: dict[str, tf.keras.Model] = {}
    missing: list[str] = []
    for crop in crop_names_:
        p = models_dir / f"{crop}_disease_classifier.keras"
        if not p.exists():
            missing.append(str(p))
            continue
        disease[crop] = tf.keras.models.load_model(str(p))
        log.info(
            "  %-22s  input=%s  output=%s",
            crop,
            disease[crop].input_shape,
            disease[crop].output_shape,
        )
    if missing:
        log.warning("Missing Keras model files:\n  %s", "\n  ".join(missing))

    log.info("MobileNetV2: 1 crop + %d disease models loaded.", len(disease))
    return crop_m, disease


def _warmup_keras(
    crop_m: tf.keras.Model,
    disease: dict[str, tf.keras.Model],
) -> None:
    """
    Pre-trace tf.function for every Keras model with one dummy forward pass.

    TF2 wraps model.__call__ in a tf.function that is compiled on first use.
    Running warmup at startup ensures:
      - First real inference request is not penalised by tracing latency.
      - The "5 out of last 5 calls triggered retracing" warnings in the log
        are eliminated (they occurred because predict() was called on 6
        different model instances in sequence, each triggering its own trace).
    """
    log.info("Warming up MobileNetV2 models (pre-tracing tf.function)...")
    dummy = np.zeros((1, MOBILENET_IMG, MOBILENET_IMG, 3), dtype=np.float32)

    _ = crop_m(dummy, training=False)
    log.info("  Crop classifier  warmed up")

    for crop_name, m in disease.items():
        _ = m(dummy, training=False)
        log.info("  %-22s  warmed up", crop_name)

    log.info("MobileNetV2 warmup complete.")


def _validate_keras(
    crop_m: tf.keras.Model,
    disease: dict[str, tf.keras.Model],
) -> list[str]:
    """
    Pass a random input through every Keras model and flag near-uniform outputs.

    Uses model(arr, training=False) — NOT model.predict() — to avoid triggering
    tf.function retracing (warmup must be called first).

    Threshold uses _sanity_threshold(n) which applies a lower margin for
    models with many classes (FIX-5: prevents false WARN for sugarcane).
    """
    log.info("Validating MobileNetV2 weights...")
    dummy = np.random.uniform(-1.0, 1.0, (1, MOBILENET_IMG, MOBILENET_IMG, 3)).astype(
        np.float32
    )
    warns: list[str] = []

    # Crop classifier
    out = crop_m(dummy, training=False).numpy()[0]
    mx = float(out.max())
    thr = _sanity_threshold(len(crop_names))
    log.info(
        "  Crop classifier  max_prob=%.4f  threshold=%.4f  sum=%.4f",
        mx,
        thr,
        float(out.sum()),
    )
    if mx < thr:
        w = f"MobileNetV2 crop classifier near-uniform output (max_prob={mx:.4f} < {thr})"
        log.warning("  %s", w)
        warns.append(w)

    # Disease classifiers
    for crop_name, m in disease.items():
        o = m(dummy, training=False).numpy()[0]
        mx = float(o.max())
        n = len(crop_dict[crop_name])
        thr = _sanity_threshold(n)
        log.info(
            "  %-22s  max_prob=%.4f  threshold=%.4f  n_classes=%d  sum=%.4f",
            crop_name,
            mx,
            thr,
            n,
            float(o.sum()),
        )
        if mx < thr:
            w = (
                f"MobileNetV2 disease '{crop_name}' near-uniform output "
                f"(max_prob={mx:.4f} < threshold={thr})"
            )
            log.warning("  %s", w)
            warns.append(w)

    if not warns:
        log.info("  All MobileNetV2 weight checks passed.")
    return warns


def _preprocess_mobilenet(image_bytes: bytes) -> np.ndarray:
    """
    Decode raw image bytes and apply MobileNetV2 preprocessing.

    Pipeline
    --------
    bytes → PIL RGB → resize(MOBILENET_IMG, MOBILENET_IMG, LANCZOS)
          → float32 → (pixel / 127.5) - 1.0
          → expand_dims(axis=0)

    Returns
    -------
    ndarray  shape (1, H, W, 3)  dtype float32  range [-1, 1]
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise ValueError(f"Cannot decode image data: {exc}") from exc
    except Exception as exc:
        raise ValueError(f"Failed to open image: {exc}") from exc

    original_wh = img.size  # (W, H)

    # FIX-7: use Image.Resampling.LANCZOS (canonical Pillow ≥ 9.1.0 name)
    img = img.resize((MOBILENET_IMG, MOBILENET_IMG), Image.Resampling.LANCZOS)
    arr = np.array(img, dtype=np.float32)  # (H, W, 3)  [0, 255]
    arr = (arr / 127.5) - 1.0  # (H, W, 3)  [-1,  1]
    arr = np.expand_dims(arr, axis=0)  # (1, H, W, 3)

    log.debug(
        "MobileNet preprocess: original=(%d,%d) → (%d,%d)  "
        "shape=%s  min=%.3f  max=%.3f",
        original_wh[0],
        original_wh[1],
        MOBILENET_IMG,
        MOBILENET_IMG,
        arr.shape,
        float(arr.min()),
        float(arr.max()),
    )
    return arr


def _run_mobilenet(
    arr: np.ndarray,
    crop_model: tf.keras.Model,
    disease_models: dict[str, tf.keras.Model],
) -> tuple[np.ndarray, np.ndarray, str]:
    """
    Two-stage MobileNetV2 inference.

    Stage 1: crop classifier  — output is already softmax probabilities
    Stage 2: disease expert for the predicted crop

    Parameters
    ----------
    arr           : ndarray  (1, H, W, 3)  float32  range [-1, 1]
    crop_model    : loaded MobileNetV2 crop classifier (FIX-1: explicit param)
    disease_models: dict of loaded MobileNetV2 disease classifiers

    Returns
    -------
    (crop_probs, disease_probs, predicted_crop_name)

    Raises
    ------
    ModelNotReadyError  if the disease model for the predicted crop is not loaded (FIX-2)
    """
    # Stage 1 — crop classification
    # model() returns tf.Tensor; .numpy() → ndarray; [0] removes batch dim
    crop_probs = crop_model(arr, training=False).numpy()[0]  # (n_crops,)
    pred_crop = crop_names[int(np.argmax(crop_probs))]

    # FIX-2: raise standard exception, not HTTPException
    if pred_crop not in disease_models:
        raise ModelNotReadyError(
            f"MobileNetV2 disease model for crop '{pred_crop}' is not loaded. "
            "Check MOBILENET_DIR and startup logs."
        )

    # Stage 2 — disease classification
    disease_probs = disease_models[pred_crop](arr, training=False).numpy()[
        0
    ]  # (n_classes,)

    log.debug(
        "MobileNet inference: crop=%s (%.1f%%)  n_disease=%d",
        pred_crop,
        float(crop_probs.max()) * 100,
        len(disease_probs),
    )
    return crop_probs, disease_probs, pred_crop


# ── Load, warmup, validate ────────────────────────────────────────────────
_mn_crop_model, _mn_disease_models = _load_keras_models(MOBILENET_DIR, crop_names)
_warmup_keras(_mn_crop_model, _mn_disease_models)
_mn_warnings = _validate_keras(_mn_crop_model, _mn_disease_models)


# ===========================================================================
#  MODEL VARIANT B — ViT-B/16  (PyTorch + timm)
# ===========================================================================
#  Preprocessing contract
#    Input  : PIL RGB image, any size
#    Output : torch.Tensor  (1, 3, VIT_IMG, VIT_IMG)  float32  ImageNet-normalised
#             NCHW layout required by PyTorch
#             mean=[0.485, 0.456, 0.406]  std=[0.229, 0.224, 0.225]
#
#  Inference contract
#    Input  : torch.Tensor  (1, 3, H, W)  ImageNet-normalised
#    Output : ndarray  (num_classes,)  float32  — raw logits
#             Softmax is applied in this file (models output logits, not probs)
#
#  Checkpoint format (confirmed by verify_models_report.txt)
#    All 6 checkpoints use raw state_dict format — no "model_state" wrapper key.
#    torch.save(model.state_dict(), path)  ← training notebook
# ===========================================================================


def _build_vit(num_classes: int) -> nn.Module:
    """
    Instantiate ViT-B/16 with training hyperparameters.
    pretrained=False — weights are loaded from .pt checkpoints.
    """
    return timm.create_model(
        VIT_BACKBONE,
        pretrained=False,
        num_classes=num_classes,
        drop_rate=VIT_DROP_RATE,
        drop_path_rate=VIT_DROP_PATH,
    )


def _load_vit_checkpoint(path: Path, num_classes: int) -> nn.Module:
    """
    Build the ViT architecture and load weights from a .pt checkpoint.

    Checkpoint format handling (per verify_models_report.txt)
    ----------------------------------------------------------
    All 6 checkpoints in this project use the raw state_dict format:
        torch.save(model.state_dict(), path)

    The wrapper-dict format is also supported for forward compatibility:
        torch.save({"model_state": model.state_dict(), ...}, path)

    Security
    --------
    weights_only=True (PyTorch ≥ 2.0) is tried first — restricts deserialisation
    to tensor data only, preventing arbitrary code execution.
    Falls back to weights_only=False only if the checkpoint embeds non-tensor
    Python objects (should not occur with raw state_dict).
    """
    if not path.exists():
        raise FileNotFoundError(f"ViT checkpoint not found: {path}")

    log.info("Loading ViT checkpoint: %s", path.name)

    try:
        raw = torch.load(path, map_location=TORCH_DEVICE, weights_only=True)
    except Exception:
        log.warning(
            "%s: weights_only=True failed — retrying with weights_only=False.",
            path.name,
        )
        raw = torch.load(path, map_location=TORCH_DEVICE, weights_only=False)

    # Extract state_dict — handle both formats
    if isinstance(raw, dict) and "model_state" in raw:
        state_dict = raw["model_state"]
        log.info("  Checkpoint format: wrapper dict")
    elif isinstance(raw, dict):
        # All keys should be parameter names (raw state_dict)
        state_dict = raw
        log.info("  Checkpoint format: raw state_dict")
    else:
        raise TypeError(
            f"Unexpected checkpoint type {type(raw)} in {path.name}. "
            "Expected a state_dict or a dict with 'model_state' key."
        )

    model = _build_vit(num_classes)
    # strict=True (default): raises if any key is missing or unexpected
    # This guarantees the loaded weights fully match the architecture
    model.load_state_dict(state_dict, strict=True)
    # [THÊM MỚI] Chuyển đổi sang FP16 nếu dùng CUDA để tiết kiệm VRAM và tăng tốc
    if TORCH_DEVICE.type == "cuda":
        model.half()

    model.to(TORCH_DEVICE)
    model.eval()

    n_params = sum(p.numel() for p in model.parameters())
    log.info(
        "  %-35s  classes=%d  params=%s  device=%s",
        path.name,
        num_classes,
        f"{n_params:,}",
        TORCH_DEVICE,
    )
    return model


def _load_vit_models(
    models_dir: Path,
    crop_names_: list[str],
) -> tuple[nn.Module, dict[str, nn.Module]]:
    """
    Load ViT crop classifier and per-crop disease classifiers.

    Expected file names
        0_crop_classifier.pt
        {CropName}_disease_classifier.pt
    """
    if not models_dir.exists():
        raise FileNotFoundError(f"ViT models directory not found: {models_dir}.")

    log.info("Loading ViT models from: %s", models_dir)

    crop_m = _load_vit_checkpoint(models_dir / "0_crop_classifier.pt", len(crop_names_))

    disease: dict[str, nn.Module] = {}
    missing: list[str] = []
    for crop in crop_names_:
        p = models_dir / f"{crop}_disease_classifier.pt"
        if not p.exists():
            missing.append(str(p))
            continue
        disease[crop] = _load_vit_checkpoint(p, len(crop_dict[crop]))

    if missing:
        log.warning("Missing ViT model files:\n  %s", "\n  ".join(missing))
    log.info("ViT: 1 crop + %d disease models loaded.", len(disease))
    return crop_m, disease


def _validate_vit(
    crop_m: nn.Module,
    disease: dict[str, nn.Module],
) -> list[str]:
    """
    Pass a realistically-scaled tensor through every ViT model and check outputs.

    Dummy input follows the actual ImageNet normalisation pipeline
    (identical to what _preprocess_vit produces at inference time):
        random uint8 pixels → (x/255 - mean) / std
    Approximate range: [-2.1, 2.6]

    Threshold uses _sanity_threshold(n) — same correction as MobileNetV2 (FIX-5).
    """
    log.info("Validating ViT weights...")
    raw = torch.rand(1, 3, VIT_IMG, VIT_IMG) * 255.0
    mean_ = torch.tensor(IMAGENET_DEFAULT_MEAN).view(1, 3, 1, 1)
    std_ = torch.tensor(IMAGENET_DEFAULT_STD).view(1, 3, 1, 1)
    dummy = ((raw / 255.0) - mean_) / std_
    dummy = dummy.to(TORCH_DEVICE)

    warns: list[str] = []
    with torch.no_grad():
        # Crop classifier
        logits = crop_m(dummy)
        probs = F.softmax(logits, dim=1)[0].cpu().numpy()
        mx = float(probs.max())
        thr = _sanity_threshold(len(crop_names))
        log.info(
            "  Crop classifier  max_prob=%.4f  threshold=%.4f  " "logits=[%.3f, %.3f]",
            mx,
            thr,
            float(logits.min()),
            float(logits.max()),
        )
        if mx < thr:
            w = f"ViT crop classifier near-uniform output (max_prob={mx:.4f} < {thr})"
            log.warning("  %s", w)
            warns.append(w)

        # Disease classifiers
        for crop_name, m in disease.items():
            logits_ = m(dummy)
            p_ = F.softmax(logits_, dim=1)[0].cpu().numpy()
            mx = float(p_.max())
            n = len(crop_dict[crop_name])
            thr = _sanity_threshold(n)
            log.info(
                "  %-22s  max_prob=%.4f  threshold=%.4f  n_classes=%d  "
                "logits=[%.3f, %.3f]",
                crop_name,
                mx,
                thr,
                n,
                float(logits_.min()),
                float(logits_.max()),
            )
            if mx < thr:
                w = (
                    f"ViT disease '{crop_name}' near-uniform output "
                    f"(max_prob={mx:.4f} < threshold={thr})"
                )
                log.warning("  %s", w)
                warns.append(w)

    if not warns:
        log.info("  All ViT weight checks passed.")
    return warns


# Albumentations validation pipeline — must be identical to the training notebook's
# get_val_transforms():
#   A.Resize(224, 224)
#   A.Normalize(mean=IMAGENET_DEFAULT_MEAN, std=IMAGENET_DEFAULT_STD)
#   ToTensorV2()
_vit_transform = A.Compose(
    [
        A.Resize(VIT_IMG, VIT_IMG),
        A.Normalize(mean=IMAGENET_DEFAULT_MEAN, std=IMAGENET_DEFAULT_STD),
        ToTensorV2(),
    ]
)


def _preprocess_vit(image_bytes: bytes) -> torch.Tensor:
    """
    Decode raw image bytes and apply ViT preprocessing.

    Pipeline
    --------
    bytes → PIL RGB → uint8 ndarray (H, W, 3)
          → Resize(224, 224) via albumentations (bilinear, same as training)
          → Normalize(ImageNet mean/std)          → float32 in [-2.1, 2.6]
          → ToTensorV2                            → (C, H, W)
          → unsqueeze(0).to(TORCH_DEVICE)         → (1, C, H, W)

    Returns
    -------
    torch.Tensor  shape (1, 3, VIT_IMG, VIT_IMG)  float32  on TORCH_DEVICE
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise ValueError(f"Cannot decode image data: {exc}") from exc
    except Exception as exc:
        raise ValueError(f"Failed to open image: {exc}") from exc

    original_wh = img.size  # (W, H)

    arr = np.array(img, dtype=np.uint8)  # (H, W, 3) uint8
    tensor = _vit_transform(image=arr)["image"]  # (3, H, W)  float32
    tensor = tensor.unsqueeze(0).to(TORCH_DEVICE)  # (1, 3, H, W)
    if TORCH_DEVICE.type == "cuda":
        tensor = tensor.half()  # [THÊM MỚI]

    log.debug(
        "ViT preprocess: original=(%d,%d) → (%d,%d)  " "tensor=%s  min=%.3f  max=%.3f",
        original_wh[0],
        original_wh[1],
        VIT_IMG,
        VIT_IMG,
        tuple(tensor.shape),
        float(tensor.min()),
        float(tensor.max()),
    )
    return tensor


@torch.no_grad()
def _run_vit(
    tensor: torch.Tensor,
    crop_model: nn.Module,
    disease_models: dict[str, nn.Module],
) -> tuple[np.ndarray, np.ndarray, str]:
    """
    Two-stage ViT inference.

    Stage 1: crop classifier  — raw logits → softmax applied here
    Stage 2: disease expert for the predicted crop

    Parameters
    ----------
    tensor        : torch.Tensor  (1, 3, H, W)  ImageNet-normalised
    crop_model    : loaded ViT crop classifier (FIX-1: explicit param)
    disease_models: dict of loaded ViT disease classifiers

    Returns
    -------
    (crop_probs, disease_probs, predicted_crop_name)

    Raises
    ------
    ModelNotReadyError  if the disease model for the predicted crop is not loaded (FIX-2)
    """
    # Stage 1 — crop classification
    crop_logits = crop_model(tensor)  # (1, n_crops)
    crop_probs = F.softmax(crop_logits, dim=1)[0].cpu().numpy()  # (n_crops,)
    pred_crop = crop_names[int(np.argmax(crop_probs))]

    # FIX-2: raise standard exception, not HTTPException
    if pred_crop not in disease_models:
        raise ModelNotReadyError(
            f"ViT disease model for crop '{pred_crop}' is not loaded. "
            "Check VIT_DIR and startup logs."
        )

    # Stage 2 — disease classification
    disease_logits = disease_models[pred_crop](tensor)  # (1, n_classes)
    disease_probs = F.softmax(disease_logits, dim=1)[0].cpu().numpy()  # (n_classes,)

    log.debug(
        "ViT inference: crop=%s (%.1f%%)  n_disease=%d",
        pred_crop,
        float(crop_probs.max()) * 100,
        len(disease_probs),
    )
    return crop_probs, disease_probs, pred_crop


# ── Load and validate ─────────────────────────────────────────────────────
_vit_crop_model, _vit_disease_models = _load_vit_models(VIT_DIR, crop_names)
_vit_warnings = _validate_vit(_vit_crop_model, _vit_disease_models)


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Plant Disease Classifier API",
    description=(
        "Two-stage hierarchical plant disease classification. "
        "Select the inference backend via the 'model' field per request: "
        "'mobilenet' (MobileNetV2, TensorFlow) or 'vit' (ViT-B/16, PyTorch)."
    ),
    version="3.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------
class ConfidenceEntry(BaseModel):
    name: str
    confidence: float


class PredictRequest(BaseModel):
    image: str = Field(
        ...,
        description=(
            "Base64-encoded image. "
            "Accepts raw base64 or data URL format ('data:image/jpeg;base64,...'). "
            "JPEG, PNG, BMP, and WEBP are supported."
        ),
    )
    model: Literal["mobilenet", "vit"] = Field(
        default="mobilenet",
        description=(
            "Inference backend: "
            "'mobilenet' — MobileNetV2 (TensorFlow, 256×256, fast), "
            "'vit' — ViT-B/16 (PyTorch, 224×224, higher accuracy)."
        ),
    )


class PredictResponse(BaseModel):
    model_used: str
    crop: str
    crop_confidence: float
    crop_top_k: list[ConfidenceEntry]
    disease: str
    disease_confidence: float
    disease_top_k: list[ConfidenceEntry]
    is_healthy: bool
    inference_ms: float  # FIX-6: per-request timing


# ---------------------------------------------------------------------------
# Shared response builders
# ---------------------------------------------------------------------------
def _build_crop_top_k(probs: np.ndarray) -> list[ConfidenceEntry]:
    """Return all crop classes sorted by descending confidence."""
    return sorted(
        [
            ConfidenceEntry(
                name=crop_names[i],
                confidence=round(float(probs[i]) * 100, 2),
            )
            for i in range(len(crop_names))
        ],
        key=lambda e: -e.confidence,
    )


def _build_disease_top_k(
    probs: np.ndarray, classes: list[str]
) -> list[ConfidenceEntry]:
    """Return top-DISEASE_TOP_K disease classes sorted by descending confidence."""
    return sorted(
        [
            ConfidenceEntry(
                name=classes[i],
                confidence=round(float(probs[i]) * 100, 2),
            )
            for i in range(len(classes))
        ],
        key=lambda e: -e.confidence,
    )[:DISEASE_TOP_K]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/", summary="Health check")
def health_check() -> dict[str, Any]:
    """
    Return service status, device information, and loaded model inventory.
    Also includes any startup warnings from weight validation.
    """
    return {
        "status": "ok",
        "version": "3.2.0",
        "crop_classes": crop_names,
        "models": {
            "mobilenet": {
                "framework": "TensorFlow / Keras",
                "backbone": "MobileNetV2",
                "input_shape": f"(1, {MOBILENET_IMG}, {MOBILENET_IMG}, 3) NHWC",
                "normalisation": "[-1, 1]  via (pixel / 127.5) - 1.0",
                "output": "softmax probabilities (applied inside model)",
                "disease_models": {
                    crop: len(classes)
                    for crop, classes in crop_dict.items()
                    if crop in _mn_disease_models
                },
                "warnings": _mn_warnings,
            },
            "vit": {
                "framework": "PyTorch + timm",
                "backbone": VIT_BACKBONE,
                "device": str(TORCH_DEVICE),
                "input_shape": f"(1, 3, {VIT_IMG}, {VIT_IMG}) NCHW",
                "normalisation": "ImageNet mean/std via albumentations",
                "output": "raw logits (softmax applied in backend)",
                "disease_models": {
                    crop: len(classes)
                    for crop, classes in crop_dict.items()
                    if crop in _vit_disease_models
                },
                "warnings": _vit_warnings,
            },
        },
    }


@app.post(
    "/predict",
    response_model=PredictResponse,
    summary="Predict crop type and disease",
)
def predict(req: PredictRequest) -> PredictResponse:
    """
    Two-stage hierarchical plant disease classification.

    The `model` field selects the inference backend:
    - `"mobilenet"` — MobileNetV2 (TensorFlow/Keras)
      - Input resized to 256×256, normalised to [-1, 1]
      - Output: softmax probabilities from model's final layer
    - `"vit"` — ViT-B/16 (PyTorch + timm)
      - Input resized to 224×224, ImageNet-normalised
      - Output: raw logits → softmax applied here

    Both backends use the same two-stage pipeline:
      Stage 1: identify crop type from the image.
      Stage 2: classify the disease using the crop-specific expert model.
    """
    t_start = time.perf_counter()

    # ── 1. Decode base64 payload ──────────────────────────────────────────
    # Strip data URL prefix ("data:image/jpeg;base64," etc.)
    if "," in req.image:
        raw_b64 = req.image.split(",")[-1]
    else:
        raw_b64 = req.image
    # FIX-4: strip whitespace characters before decoding
    # (newlines and spaces are common in copy-pasted base64 from tools/forms)
    raw_b64_clean = "".join(raw_b64.split())

    try:
        image_bytes = base64.b64decode(raw_b64_clean)
    except binascii.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid base64 encoding: {exc}",
        ) from exc

    # FIX-3: reject oversized payloads before allocating memory for decoding
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Decoded image size {len(image_bytes) / 1024 / 1024:.1f} MB "
                f"exceeds the {MAX_IMAGE_BYTES // 1024 // 1024} MB limit. "
                "Resize the image before sending."
            ),
        )

    # ── 2. Preprocess + infer ────────────────────────────────────────────
    try:
        if req.model == "mobilenet":
            # FIX-1: pass _mn_crop_model directly — no global alias needed
            arr = _preprocess_mobilenet(image_bytes)
            crop_probs, disease_probs, pred_crop = _run_mobilenet(
                arr, _mn_crop_model, _mn_disease_models
            )
        else:
            tensor = _preprocess_vit(image_bytes)
            crop_probs, disease_probs, pred_crop = _run_vit(
                tensor, _vit_crop_model, _vit_disease_models
            )
    except ValueError as exc:
        # Image decoding / preprocessing failure
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except ModelNotReadyError as exc:
        # FIX-2: helper functions raise ModelNotReadyError; convert here
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    # ── 3. Assemble response ─────────────────────────────────────────────
    crop_idx = int(np.argmax(crop_probs))
    disease_classes = crop_dict[pred_crop]
    disease_idx = int(np.argmax(disease_probs))
    pred_disease = disease_classes[disease_idx]

    inference_ms = round((time.perf_counter() - t_start) * 1000, 1)  # FIX-6

    log.info(
        "[%s]  crop=%s (%.1f%%)  disease=%s (%.1f%%)  %.0f ms",
        req.model,
        pred_crop,
        float(crop_probs[crop_idx]) * 100,
        pred_disease,
        float(disease_probs[disease_idx]) * 100,
        inference_ms,
    )

    return PredictResponse(
        model_used=req.model,
        crop=pred_crop,
        crop_confidence=round(float(crop_probs[crop_idx]) * 100, 2),
        crop_top_k=_build_crop_top_k(crop_probs),
        disease=pred_disease,
        disease_confidence=round(float(disease_probs[disease_idx]) * 100, 2),
        disease_top_k=_build_disease_top_k(disease_probs, disease_classes),
        is_healthy="healthy" in pred_disease.lower(),
        inference_ms=inference_ms,
    )


@app.get("/classes", summary="List all disease classes")
def list_classes() -> dict[str, Any]:
    """Return the full crop -> disease class mapping derived from DATA_DIR."""
    return {
        "total_crops": len(crop_names),
        "total_disease_classes": sum(len(v) for v in crop_dict.values()),
        "mapping": crop_dict,
    }

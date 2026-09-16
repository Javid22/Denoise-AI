"""
DenoiseAI backend — FastAPI server that serves an RGB image-denoising CNN
(denoising.h5, a fully-convolutional residual U-Net) for inference.

Architecture summary (inspected from the .h5 file, and confirmed against
this project's own training script, model/denoise.py, before writing this
code):
    - Input:  (None, None, None, 3)  -> fully convolutional, accepts ANY
              spatial resolution as long as height/width are divisible by 4
              (the network has two 2x2 max-pool stages).
    - Output: (None, None, None, 3)  -> same spatial size as the (padded)
              input. The network is residual: output = input + predicted
              residual, so pixel values are expected in the [0, 1] range
              that the model was trained on (image / 255.0).
    - No custom layers are needed for inference; the model is loaded with
      compile=False so the "charbonnier" training loss and "psnr" training
      metric (only needed for training, not forward inference) never have
      to be reconstructed.

IMPORTANT — matching training preprocessing exactly:
The model was trained on native-resolution crops of real (SIDD) sensor
noise. Downscaling a noisy photo before running it through the model would
partially average out the very noise pattern the network learned to
remove — the training script's own docs warn against this explicitly. So,
instead of resizing large uploads down to a small fixed size, this backend
runs TILED inference at the image's native resolution:
    1. The image is split into overlapping tiles (default 512x512,
       32px overlap).
    2. Each tile is reflect-padded up to a multiple of 4 (for the U-Net's
       pooling/skip connections), denoised, then cropped back to its
       original tile size.
    3. Overlapping tile predictions are averaged together (weighted by
       coverage) to avoid seams at tile boundaries.
No resizing of the input pixels ever happens — every pixel is denoised at
its original resolution, and the output is exactly the same size as the
upload.
"""

import io
import os
import logging

import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from PIL import Image, UnidentifiedImageError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("denoiseai")

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

# Comma-separated list of allowed frontend origins for CORS.
# In development this defaults to "*" (allow everything). For production,
# set FRONTEND_URL to your deployed Netlify URL, e.g.:
#   FRONTEND_URL=https://denoiseai.netlify.app
FRONTEND_URL = os.getenv("FRONTEND_URL", "*")
ALLOWED_ORIGINS = [o.strip() for o in FRONTEND_URL.split(",")] if FRONTEND_URL != "*" else ["*"]

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model", "denoising.h5")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB, matches the frontend limit
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}

# The network downsamples twice by 2x (two 2x2 max-pool layers), so any
# region fed to the model must have height/width divisible by this value.
SIZE_MULTIPLE = 4

# Tiled inference parameters (mirrors model/denoise.py, the training
# script's own reference inference implementation). Images are processed
# in overlapping tiles at native resolution rather than being resized.
TILE_SIZE = 512
TILE_OVERLAP = 32

# --------------------------------------------------------------------------
# App setup
# --------------------------------------------------------------------------

app = FastAPI(
    title="DenoiseAI API",
    description="AI-powered RGB image denoising backend, serving a trained CNN (denoising.h5).",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------
# Model loading (once, at startup — never per-request)
# --------------------------------------------------------------------------

model = None
model_load_error = None
MODEL_INPUT_SHAPE = None
MODEL_OUTPUT_SHAPE = None


def load_denoising_model():
    """Load the Keras model once at process startup."""
    global model, model_load_error, MODEL_INPUT_SHAPE, MODEL_OUTPUT_SHAPE
    try:
        # Imported lazily so the module import (and /health checks before
        # the model finishes loading) stay fast and don't hard-fail if
        # TensorFlow itself has an import issue unrelated to the route.
        from tensorflow.keras.models import load_model

        logger.info("Loading model from %s ...", MODEL_PATH)
        # compile=False: we only need forward inference, not the training
        # configuration (custom loss/metric), which avoids having to supply
        # custom_objects for functions that aren't used at inference time.
        loaded = load_model(MODEL_PATH, compile=False)
        MODEL_INPUT_SHAPE = loaded.input_shape
        MODEL_OUTPUT_SHAPE = loaded.output_shape
        logger.info("Model loaded. input_shape=%s output_shape=%s", MODEL_INPUT_SHAPE, MODEL_OUTPUT_SHAPE)
        model = loaded
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to load model")
        model_load_error = str(exc)


@app.on_event("startup")
def on_startup():
    load_denoising_model()


# --------------------------------------------------------------------------
# Image preprocessing helpers
# --------------------------------------------------------------------------


def read_and_validate_image(raw_bytes: bytes) -> Image.Image:
    """Open the uploaded bytes as a Pillow image and normalize to RGB.

    Handles RGBA, grayscale ("L"), and palette ("P") images by converting
    them all to plain RGB, since the model was trained on 3-channel input.
    """
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        image = Image.open(io.BytesIO(raw_bytes))
        image.load()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    if image.mode != "RGB":
        image = image.convert("RGB")

    return image


def predict_patch(patch: np.ndarray) -> np.ndarray:
    """Run the model on a single HxWx3 float32 array in [0, 1].

    Reflect-pads up to a multiple of SIZE_MULTIPLE (required by the U-Net's
    two pooling/skip stages) and crops the padding back off afterwards, so
    the caller always gets back exactly the size it passed in.
    """
    h, w = patch.shape[:2]
    pad_h = (-h) % SIZE_MULTIPLE
    pad_w = (-w) % SIZE_MULTIPLE
    padded = np.pad(patch, ((0, pad_h), (0, pad_w), (0, 0)), mode="reflect")

    prediction = model.predict(padded[None, ...], verbose=0)[0]
    return prediction[:h, :w]


def denoise_array(img: np.ndarray, tile: int = TILE_SIZE, overlap: int = TILE_OVERLAP) -> np.ndarray:
    """Tiled, native-resolution denoising — mirrors model/denoise.py.

    Splits the image into overlapping tiles so the model never sees a
    downscaled version of the input (which would wash out the sensor noise
    it was trained to remove), runs each tile through the network, and
    blends overlapping predictions to avoid visible seams at tile borders.
    """
    h, w, _ = img.shape
    out = np.zeros_like(img)
    weight = np.zeros((h, w, 1), np.float32)
    step = tile - overlap

    for i in range(0, max(h - overlap, 1), step):
        for j in range(0, max(w - overlap, 1), step):
            i0 = min(i, max(h - tile, 0))
            j0 = min(j, max(w - tile, 0))
            patch = img[i0 : i0 + tile, j0 : j0 + tile]
            ph, pw = patch.shape[:2]
            out[i0 : i0 + ph, j0 : j0 + pw] += predict_patch(patch)
            weight[i0 : i0 + ph, j0 : j0 + pw] += 1.0

    return np.clip(out / np.maximum(weight, 1e-8), 0.0, 1.0)


def run_inference(image: Image.Image) -> Image.Image:
    """Run the full RGB image through the CNN and return the denoised result.

    The output is always the exact same pixel dimensions as the input —
    no resizing of the uploaded image ever happens.
    """
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="The AI model is not available right now. Please try again shortly.",
        )

    arr = np.asarray(image, dtype=np.float32) / 255.0  # normalize exactly as in training

    try:
        denoised = denoise_array(arr)
    except Exception:  # noqa: BLE001
        logger.exception("Model inference failed")
        raise HTTPException(
            status_code=500,
            detail="Something went wrong while processing the image.",
        )

    result_arr = (denoised * 255.0).round().astype(np.uint8)
    return Image.fromarray(result_arr, mode="RGB")


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    # GET and HEAD both supported: some hosting platforms' health checks
    # (and uptime monitors) probe with HEAD, which FastAPI's default
    # @app.get() does not answer, causing spurious "unhealthy" restarts.
    return {"status": "ok", "message": "DenoiseAI backend is running.", "docs": "/docs"}


@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {
        "status": "ok" if model is not None else "degraded",
        "model": "loaded" if model is not None else "not_loaded",
        "error": model_load_error,
        "model_input_shape": MODEL_INPUT_SHAPE,
        "model_output_shape": MODEL_OUTPUT_SHAPE,
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Accepts an uploaded image, runs it through the denoising CNN, and
    returns the cleaned-up image as a PNG stream.
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a JPG, PNG, or WEBP image.",
        )

    raw_bytes = await file.read()

    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image size must be below 10 MB.")

    image = read_and_validate_image(raw_bytes)

    result_image = run_inference(image)

    buffer = io.BytesIO()
    result_image.save(buffer, format="PNG")
    buffer.seek(0)

    return StreamingResponse(buffer, media_type="image/png")


@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):  # noqa: ARG001
    logger.exception("Unhandled error")
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong while processing the image."},
    )

"""Flask API: upload a noisy image, get back the denoised image.

Loads model/denoising.h5 once at startup (fully convolutional residual U-Net,
same architecture as denoise.py) and reuses the tiled, native-resolution
inference from denoise.py -- never resize the input before predicting.
"""

import io
import os

from flask import Flask, request, send_file, jsonify, render_template_string
from PIL import Image
from tensorflow import keras

from denoise import denoise_image, charbonnier, psnr

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "denoising.h5")
ALLOWED_EXT = {"png", "jpg", "jpeg", "bmp", "webp"}

app = Flask(__name__)

print(f"Loading model from {MODEL_PATH} ...")
model = keras.models.load_model(
    MODEL_PATH, custom_objects={"charbonnier": charbonnier, "psnr": psnr}
)
print("Model loaded.")


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


INDEX_HTML = """
<!doctype html>
<title>Image Denoiser</title>
<h1>Image Denoiser</h1>
<p>Upload a noisy image; the model returns the denoised result.</p>
<form method="post" action="/predict" enctype="multipart/form-data">
  <input type="file" name="image" accept="image/*" required>
  <button type="submit">Denoise</button>
</form>
"""


@app.route("/", methods=["GET"])
def index():
    return render_template_string(INDEX_HTML)


@app.route("/health", methods=["GET"])
def health():
    return jsonify(status="ok")


@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify(error="no file part, expected form field 'image'"), 400

    file = request.files["image"]
    if file.filename == "":
        return jsonify(error="no file selected"), 400
    if not allowed_file(file.filename):
        return jsonify(error=f"unsupported file type, allowed: {sorted(ALLOWED_EXT)}"), 400

    try:
        img = Image.open(file.stream).convert("RGB")
    except Exception as e:
        return jsonify(error=f"could not read image: {e}"), 400

    tmp_in = io.BytesIO()
    img.save(tmp_in, format="PNG")
    tmp_in.seek(0)
    tmp_in.name = "input.png"  # PIL.Image.open accepts a path or file-like with .read

    denoised = denoise_image(model, tmp_in)  # HxWx3 float32 in [0,1]
    out_arr = (denoised * 255.0).round().astype("uint8")
    out_img = Image.fromarray(out_arr)

    buf = io.BytesIO()
    out_img.save(buf, format="PNG")
    buf.seek(0)

    return send_file(buf, mimetype="image/png", download_name="denoised.png")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)

"""SIDD real-noise denoiser: patch extraction, residual model, training, full-image inference.

Why this replaces the notebook pipeline:
  * SIDD images are 5328x3000. Resizing them to 256x256 averages ~20x20 pixel
    blocks, which destroys the real sensor noise -- the "noisy" input becomes
    almost identical to the clean target. The model never sees the noise it is
    supposed to remove. We take random crops at NATIVE resolution instead.
  * The notebook trained on `X_train + 0.2*N(0,1)` (synthetic gaussian on top of
    the real noise) but you feed it a plain noisy photo at inference. That
    train/test mismatch alone produces garbage. We train noisy -> clean.
  * A 3x MaxPool bottleneck autoencoder with no skip connections has to squeeze
    a 128x128 patch through 16x16 feature maps. Everything fine is lost. We use
    skip connections and predict the *residual* (the noise), so the identity
    path is free and the net only has to model what to subtract.
  * MSE is the classic blur-inducing loss (it averages over plausible outputs).
    We use Charbonnier (a smooth L1).
"""

import glob
import os

import numpy as np
import tensorflow as tf
from PIL import Image
from tensorflow import keras
from tensorflow.keras import layers

Image.MAX_IMAGE_PIXELS = None

DATA_DIR = "/Users/javid-67239/mdj/noise_reduce/files/Data"
CACHE = "/Users/javid-67239/mdj/noise_reduce/files/patches.npz"
MODEL_PATH = "/Users/javid-67239/mdj/noise_reduce/model/sidd_denoiser.keras"

PATCH = 128           # crop size, native resolution
CROPS_PER_IMAGE = 32
BATCH_SIZE = 16


# --------------------------------------------------------------------------- #
# Data
# --------------------------------------------------------------------------- #
def find_pairs(data_dir=DATA_DIR):
    """Pair NOISY/GT by their scene directory instead of trusting glob order."""
    pairs = []
    for noisy in sorted(glob.glob(os.path.join(data_dir, "**", "*NOISY_SRGB*.PNG"), recursive=True)):
        scene = os.path.dirname(noisy)
        gt = sorted(glob.glob(os.path.join(scene, "*GT_SRGB*.PNG")))
        if gt:
            pairs.append((noisy, gt[0]))
    return pairs


def build_patches(pairs, patch=PATCH, crops=CROPS_PER_IMAGE, seed=0):
    """Random co-located crops from each pair, kept as uint8 to stay in RAM."""
    rng = np.random.default_rng(seed)
    xs, ys = [], []
    for k, (nf, gf) in enumerate(pairs, 1):
        n = np.asarray(Image.open(nf).convert("RGB"))
        g = np.asarray(Image.open(gf).convert("RGB"))
        if n.shape != g.shape:
            continue
        h, w, _ = n.shape
        for _ in range(crops):
            i = rng.integers(0, h - patch)
            j = rng.integers(0, w - patch)
            xs.append(n[i:i + patch, j:j + patch])
            ys.append(g[i:i + patch, j:j + patch])
        print(f"\r  {k}/{len(pairs)} scenes", end="", flush=True)
    print()
    return np.asarray(xs, np.uint8), np.asarray(ys, np.uint8)


def load_patches(rebuild=False):
    if os.path.exists(CACHE) and not rebuild:
        d = np.load(CACHE)
        return d["x"], d["y"]
    pairs = find_pairs()
    print(f"Found {len(pairs)} noisy/clean pairs. Cropping...")
    x, y = build_patches(pairs)
    np.savez_compressed(CACHE, x=x, y=y)
    return x, y


def make_datasets(x, y, val_frac=0.1, seed=42):
    """Split by scene block so validation crops come from unseen images."""
    n = len(x)
    cut = int(n * (1 - val_frac))
    idx = np.random.default_rng(seed).permutation(n)
    tr, va = idx[:cut], idx[cut:]

    def prep(xi, yi, training):
        ds = tf.data.Dataset.from_tensor_slices((x[xi], y[yi]))
        ds = ds.map(lambda a, b: (tf.cast(a, tf.float32) / 255.0,
                                  tf.cast(b, tf.float32) / 255.0),
                    num_parallel_calls=tf.data.AUTOTUNE)
        if training:
            ds = ds.map(_augment, num_parallel_calls=tf.data.AUTOTUNE).shuffle(2048)
        return ds.batch(BATCH_SIZE).prefetch(tf.data.AUTOTUNE)

    return prep(tr, tr, True), prep(va, va, False)


def _augment(a, b):
    k = tf.random.uniform([], 0, 4, dtype=tf.int32)
    a, b = tf.image.rot90(a, k), tf.image.rot90(b, k)
    if tf.random.uniform([]) < 0.5:
        a, b = tf.image.flip_left_right(a), tf.image.flip_left_right(b)
    return a, b


# --------------------------------------------------------------------------- #
# Model: residual U-Net. Output = input + predicted correction.
# --------------------------------------------------------------------------- #
def conv_block(t, f):
    for _ in range(2):
        t = layers.Conv2D(f, 3, padding="same")(t)
        t = layers.Activation("relu")(t)
    return t


def build_model(base=48):
    inp = keras.Input((None, None, 3))          # fully convolutional: any size

    c1 = conv_block(inp, base)
    c2 = conv_block(layers.MaxPool2D()(c1), base * 2)
    c3 = conv_block(layers.MaxPool2D()(c2), base * 4)

    u2 = layers.Concatenate()([layers.UpSampling2D()(c3), c2])
    u2 = conv_block(u2, base * 2)
    u1 = layers.Concatenate()([layers.UpSampling2D()(u2), c1])
    u1 = conv_block(u1, base)

    residual = layers.Conv2D(3, 3, padding="same")(u1)   # no sigmoid: signed noise
    out = layers.Add()([inp, residual])
    return keras.Model(inp, out, name="residual_unet_denoiser")


def charbonnier(y_true, y_pred, eps=1e-3):
    """Smooth L1. Unlike MSE it does not average competing details into blur."""
    return tf.reduce_mean(tf.sqrt(tf.square(y_true - y_pred) + eps ** 2))


def psnr(y_true, y_pred):
    return tf.image.psnr(tf.clip_by_value(y_pred, 0.0, 1.0), y_true, max_val=1.0)


def train(epochs=40, lr=2e-4, rebuild=False):
    x, y = load_patches(rebuild)
    print("patches:", x.shape)
    train_ds, val_ds = make_datasets(x, y)

    model = build_model()
    model.compile(optimizer=keras.optimizers.Adam(lr), loss=charbonnier, metrics=[psnr])
    model.summary()

    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=epochs,
        callbacks=[
            keras.callbacks.ModelCheckpoint(MODEL_PATH, monitor="val_psnr",
                                            mode="max", save_best_only=True),
            keras.callbacks.ReduceLROnPlateau(monitor="val_psnr", mode="max",
                                              factor=0.5, patience=4, min_lr=1e-6),
            keras.callbacks.EarlyStopping(monitor="val_psnr", mode="max",
                                          patience=10, restore_best_weights=True),
        ],
    )
    return model


# --------------------------------------------------------------------------- #
# Inference: run at native resolution, tiled. Never resize a noisy image first.
# --------------------------------------------------------------------------- #
def predict_patch(model, patch):
    """Run the net on any HxWx3 float array in [0,1]; pads to the pooling stride."""
    h, w = patch.shape[:2]
    padded = np.pad(patch, ((0, (-h) % 4), (0, (-w) % 4), (0, 0)), "reflect")
    return model.predict(padded[None], verbose=0)[0][:h, :w]


def denoise_image(model, path, tile=512, overlap=32):
    img = np.asarray(Image.open(path).convert("RGB"), np.float32) / 255.0
    h, w, _ = img.shape
    out = np.zeros_like(img)
    weight = np.zeros((h, w, 1), np.float32)
    step = tile - overlap

    for i in range(0, max(h - overlap, 1), step):
        for j in range(0, max(w - overlap, 1), step):
            i0, j0 = min(i, max(h - tile, 0)), min(j, max(w - tile, 0))
            patch = img[i0:i0 + tile, j0:j0 + tile]
            ph, pw = patch.shape[:2]
            out[i0:i0 + ph, j0:j0 + pw] += predict_patch(model, patch)
            weight[i0:i0 + ph, j0:j0 + pw] += 1.0

    return np.clip(out / np.maximum(weight, 1e-8), 0.0, 1.0)


def save_denoised(model, in_path, out_path):
    arr = (denoise_image(model, in_path) * 255.0).round().astype(np.uint8)
    Image.fromarray(arr).save(out_path)
    return out_path


if __name__ == "__main__":
    train()

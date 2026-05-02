"""Pre-compute 576-dim embeddings for all sprite PNGs using the TFLite embedding model.

Writes data/sprite-embeddings.bin in this format:
  Header (16B): [4B magic "MWFE"][4B version=1][4B count][4B dim=576]
  Per entry:    [2304B embedding (576 × float32 LE)][1B labelLen][NB label UTF-8]

Usage: python ml/build_embeddings.py
"""

import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ML_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = ML_DIR.parent
SPRITES_DIR = PROJECT_ROOT / "data" / "sprites" / "png"
OUTPUT_FILE = PROJECT_ROOT / "data" / "sprite-embeddings.bin"
EMBEDDING_MODEL_PATH = ML_DIR / "output" / "mewgenics_items_embeddings.tflite"

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
EMBEDDING_DIM = 576


def preprocess_image(img_path: Path) -> np.ndarray:
    """Load and preprocess a sprite image for the embedding model.

    Returns shape [1, 224, 224, 3] float32 (NHWC) with ImageNet normalization.
    onnx2tf converts models to NHWC layout (TFLite convention).
    """
    img = Image.open(img_path).convert("RGB").resize((224, 224))
    arr = np.array(img, dtype=np.float32) / 255.0  # [H, W, 3]

    # Normalize with ImageNet stats
    for c in range(3):
        arr[:, :, c] = (arr[:, :, c] - IMAGENET_MEAN[c]) / IMAGENET_STD[c]

    return arr[np.newaxis, ...]  # [1, 224, 224, 3] NHWC


def main() -> None:
    if not SPRITES_DIR.exists():
        print(f"ERROR: Sprites directory not found: {SPRITES_DIR}")
        print('Run "npm run crawl" first to fetch sprites.')
        sys.exit(1)

    if not EMBEDDING_MODEL_PATH.exists():
        print(f"ERROR: Embedding model not found: {EMBEDDING_MODEL_PATH}")
        print('Run "python ml/export_tflite.py" first.')
        sys.exit(1)

    try:
        import tensorflow as tf
    except ImportError:
        print("ERROR: tensorflow is required. Install with: pip install tensorflow")
        sys.exit(1)

    # Load TFLite model
    interpreter = tf.lite.Interpreter(model_path=str(EMBEDDING_MODEL_PATH))
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    # Get all sprite PNGs
    files = sorted(f for f in SPRITES_DIR.iterdir() if f.suffix == ".png")
    print(f"Processing {len(files)} sprites...")

    entries: list[tuple[str, np.ndarray]] = []  # (label, embedding)

    for i, sprite_path in enumerate(files):
        label = sprite_path.stem

        try:
            input_data = preprocess_image(sprite_path)
            interpreter.set_tensor(input_details[0]["index"], input_data)
            interpreter.invoke()
            embedding = interpreter.get_tensor(output_details[0]["index"])[0]

            # L2 normalize
            norm = np.linalg.norm(embedding)
            if norm > 0:
                embedding = embedding / norm

            entries.append((label, embedding.astype(np.float32)))

            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{len(files)}")
        except Exception as e:
            print(f"  Skipping {sprite_path.name}: {e}")

    print(f"Computed embeddings for {len(entries)} sprites.")

    # Verify embedding dimension
    if entries:
        actual_dim = len(entries[0][1])
        if actual_dim != EMBEDDING_DIM:
            print(f"WARNING: Expected dim={EMBEDDING_DIM}, got {actual_dim}")

    # Write binary file
    dim = len(entries[0][1]) if entries else EMBEDDING_DIM

    # Calculate total size
    header_size = 16
    total_size = header_size
    for label, emb in entries:
        label_bytes = label.encode("utf-8")
        total_size += dim * 4 + 1 + len(label_bytes)

    buf = bytearray(total_size)
    offset = 0

    # Header
    struct.pack_into("4s", buf, offset, b"MWFE")
    offset += 4
    struct.pack_into("<I", buf, offset, 1)  # version
    offset += 4
    struct.pack_into("<I", buf, offset, len(entries))  # count
    offset += 4
    struct.pack_into("<I", buf, offset, dim)  # dimension
    offset += 4

    # Entries
    for label, embedding in entries:
        # Embedding as float32 LE
        for val in embedding:
            struct.pack_into("<f", buf, offset, float(val))
            offset += 4

        # Label
        label_bytes = label.encode("utf-8")
        struct.pack_into("B", buf, offset, len(label_bytes))
        offset += 1
        buf[offset : offset + len(label_bytes)] = label_bytes
        offset += len(label_bytes)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_bytes(buf)

    print(
        f"Wrote {OUTPUT_FILE} ({total_size / 1024:.1f} KB, {len(entries)} entries, dim={dim})"
    )


if __name__ == "__main__":
    main()

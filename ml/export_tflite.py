"""TFLite export: convert best PyTorch checkpoint to two TFLite models.

Pipeline: PyTorch → ONNX → TFLite (via onnx2tf)

1. Classifier  (mewgenics_items_classifier.tflite)  — full model, softmax output
2. Embedding   (mewgenics_items_embeddings.tflite)  — penultimate layer, 576-dim output

Install: pip install torch torchvision onnx onnxscript onnx2tf tensorflow
"""

import json
import shutil
import sys
from pathlib import Path

import torch
import torch.nn as nn

from train import build_model

ML_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = ML_DIR / "output"
CLASS_NAMES_PATH = ML_DIR / "class_names.json"


class EmbeddingModel(nn.Module):
    """MobileNetV3-Small truncated at avgpool — outputs 576-dim embedding."""

    def __init__(self, base_model: nn.Module):
        super().__init__()
        self.features = base_model.features
        self.avgpool = base_model.avgpool

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.avgpool(x)
        x = torch.flatten(x, 1)
        return x


def export_to_tflite(model: nn.Module, tflite_path: Path, label: str) -> Path:
    """Export PyTorch model → ONNX → TFLite via onnx2tf."""
    import onnx2tf

    example_input = torch.randn(1, 3, 224, 224)
    onnx_path = OUTPUT_DIR / f"_temp_{label}.onnx"
    saved_model_dir = str(OUTPUT_DIR / f"_temp_{label}_saved")

    # Step 1: PyTorch → ONNX
    print(f"  [{label}] Exporting to ONNX...")
    torch.onnx.export(
        model,
        example_input,
        str(onnx_path),
        input_names=["input"],
        output_names=["output"],
        opset_version=18,
    )

    # Step 2: ONNX → TFLite via onnx2tf
    print(f"  [{label}] Converting ONNX → TFLite...")
    onnx2tf.convert(
        input_onnx_file_path=str(onnx_path),
        output_folder_path=saved_model_dir,
        non_verbose=True,
        copy_onnx_input_output_names_to_tflite=True,
    )

    # Find the float32 tflite output
    temp_dir = Path(saved_model_dir)
    tflite_files = list(temp_dir.glob("*.tflite"))
    if not tflite_files:
        print(f"  [{label}] ERROR: No .tflite file produced")
        sys.exit(1)

    # Prefer float32 model
    float_models = [f for f in tflite_files if "float32" in f.name]
    source = float_models[0] if float_models else tflite_files[0]

    shutil.copy2(source, tflite_path)

    # Cleanup
    onnx_path.unlink(missing_ok=True)
    shutil.rmtree(saved_model_dir, ignore_errors=True)

    return tflite_path


def export() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not CLASS_NAMES_PATH.exists():
        print("ERROR: class_names.json not found. Run prepare_dataset.py first.")
        sys.exit(1)

    checkpoint_path = OUTPUT_DIR / "best_model.pth"
    if not checkpoint_path.exists():
        print("ERROR: best_model.pth not found. Run train.py first.")
        sys.exit(1)

    with open(CLASS_NAMES_PATH) as f:
        class_labels = json.load(f)
    num_classes = len(class_labels)
    print(f"Exporting TFLite models with {num_classes} classes")

    model = build_model(num_classes)
    model.load_state_dict(
        torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    )
    model.eval()

    # Export classifier (full model)
    print("\n=== Exporting classifier TFLite ===")
    p = export_to_tflite(
        model,
        OUTPUT_DIR / "mewgenics_items_classifier.tflite",
        "classifier",
    )
    print(f"Saved: {p} ({p.stat().st_size / 1024:.1f} KB)")

    # Export embedding model (truncated at avgpool → 576-dim)
    print("\n=== Exporting embedding TFLite ===")
    embed_model = EmbeddingModel(model)
    embed_model.eval()

    with torch.no_grad():
        test_out = embed_model(torch.randn(1, 3, 224, 224))
    print(f"Embedding output shape: {test_out.shape}")

    p = export_to_tflite(
        embed_model,
        OUTPUT_DIR / "mewgenics_items_embeddings.tflite",
        "embedding",
    )
    print(f"Saved: {p} ({p.stat().st_size / 1024:.1f} KB)")

    print("\nDone! TFLite models saved to ml/output/")


if __name__ == "__main__":
    export()

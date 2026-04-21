"""CoreML export: convert best PyTorch checkpoint to .mlpackage."""

import json
import sys
from pathlib import Path

import coremltools as ct
import numpy as np
import torch
from PIL import Image
from torchvision import transforms

from train import IMAGENET_MEAN, IMAGENET_STD, build_model

ML_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = ML_DIR / "output"
DATASET_DIR = ML_DIR / "dataset"
CLASS_NAMES_PATH = ML_DIR / "class_names.json"


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

    print(f"Exporting model with {num_classes} classes")

    # Load PyTorch model
    model = build_model(num_classes)
    model.load_state_dict(torch.load(checkpoint_path, map_location="cpu", weights_only=True))
    model.eval()

    # Trace model
    example_input = torch.rand(1, 3, 224, 224)
    traced = torch.jit.trace(model, example_input)

    # Convert to CoreML
    print("Converting to CoreML...")
    mlmodel = ct.convert(
        traced,
        inputs=[ct.ImageType(
            shape=(1, 3, 224, 224),
            scale=1 / 255.0,
            bias=[-0.485 / 0.229, -0.456 / 0.224, -0.406 / 0.225],
        )],
        classifier_config=ct.ClassifierConfig(class_labels),
        compute_units=ct.ComputeUnit.ALL,
        convert_to="mlprogram",
        minimum_deployment_target=ct.target.iOS16,
    )

    output_path = OUTPUT_DIR / "mewgenics_items.mlpackage"
    mlmodel.save(str(output_path))
    print(f"Saved CoreML model to {output_path}")

    # Verify: compare PyTorch vs CoreML on test images
    print("\nVerification: comparing PyTorch vs CoreML predictions...")
    test_dir = DATASET_DIR / "test"
    if not test_dir.exists():
        print("WARNING: test dataset not found, skipping verification")
        return

    test_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])

    # Grab up to 10 test images
    test_images = list(test_dir.rglob("original.png"))[:10]
    matches = 0
    total = 0

    for img_path in test_images:
        class_name = img_path.parent.name
        img = Image.open(img_path).convert("RGB")

        # PyTorch prediction
        tensor = test_transform(img).unsqueeze(0)
        with torch.no_grad():
            output = model(tensor)
            _, pytorch_pred_idx = output.max(1)
            pytorch_pred = class_labels[pytorch_pred_idx.item()]

        # CoreML prediction — use the model's actual input name
        img_resized = img.resize((224, 224))
        input_name = mlmodel.get_spec().description.input[0].name
        coreml_output = mlmodel.predict({input_name: img_resized})
        coreml_pred = coreml_output.get("classLabel", "unknown")

        match = pytorch_pred == coreml_pred
        if match:
            matches += 1
        total += 1

        status = "MATCH" if match else "MISMATCH"
        print(f"  [{status}] {class_name}: PyTorch={pytorch_pred}, CoreML={coreml_pred}")

    print(f"\nVerification: {matches}/{total} predictions match")
    if matches < total:
        print("WARNING: Some predictions differ. This may be due to floating-point differences.")


if __name__ == "__main__":
    export()

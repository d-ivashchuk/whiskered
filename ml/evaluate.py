"""Evaluation: test set metrics, confusion matrix, per-class accuracy."""

import csv
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

from train import IMAGENET_MEAN, IMAGENET_STD, build_model

ML_DIR = Path(__file__).resolve().parent
DATASET_DIR = ML_DIR / "dataset"
OUTPUT_DIR = ML_DIR / "output"
CLASS_NAMES_PATH = ML_DIR / "class_names.json"


def evaluate_model() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not CLASS_NAMES_PATH.exists():
        print("ERROR: class_names.json not found. Run prepare_dataset.py first.")
        sys.exit(1)

    checkpoint_path = OUTPUT_DIR / "best_model.pth"
    if not checkpoint_path.exists():
        print("ERROR: best_model.pth not found. Run train.py first.")
        sys.exit(1)

    with open(CLASS_NAMES_PATH) as f:
        class_names = json.load(f)
    num_classes = len(class_names)

    # Device
    if torch.backends.mps.is_available():
        device = torch.device("mps")
    elif torch.cuda.is_available():
        device = torch.device("cuda")
    else:
        device = torch.device("cpu")
    print(f"Using device: {device}")

    # Load model
    model = build_model(num_classes)
    model.load_state_dict(torch.load(checkpoint_path, map_location=device, weights_only=True))
    model = model.to(device)
    model.eval()

    # Test dataset
    test_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    test_dataset = datasets.ImageFolder(DATASET_DIR / "test", test_transform)
    test_loader = DataLoader(test_dataset, batch_size=32, shuffle=False, num_workers=4)

    print(f"Test set: {len(test_dataset)} images, {num_classes} classes")

    # Collect predictions
    all_preds: list[int] = []
    all_labels: list[int] = []
    all_top3: list[list[int]] = []
    all_probs: list[np.ndarray] = []

    with torch.no_grad():
        for inputs, labels in test_loader:
            inputs = inputs.to(device)
            outputs = model(inputs)
            probs = torch.softmax(outputs, dim=1)

            _, preds = outputs.max(1)
            _, top3 = outputs.topk(3, dim=1)

            all_preds.extend(preds.cpu().numpy().tolist())
            all_labels.extend(labels.numpy().tolist())
            all_top3.extend(top3.cpu().numpy().tolist())
            all_probs.extend(probs.cpu().numpy())

    all_preds_arr = np.array(all_preds)
    all_labels_arr = np.array(all_labels)

    # Top-1 accuracy
    top1_correct = (all_preds_arr == all_labels_arr).sum()
    top1_acc = top1_correct / len(all_labels_arr)

    # Top-3 accuracy
    top3_correct = sum(1 for label, top3 in zip(all_labels, all_top3) if label in top3)
    top3_acc = top3_correct / len(all_labels)

    print(f"\nResults:")
    print(f"  Top-1 Accuracy: {top1_acc:.4f} ({top1_correct}/{len(all_labels_arr)})")
    print(f"  Top-3 Accuracy: {top3_acc:.4f} ({top3_correct}/{len(all_labels)})")

    # Per-class accuracy
    per_class_correct = np.zeros(num_classes)
    per_class_total = np.zeros(num_classes)
    for pred, label in zip(all_preds_arr, all_labels_arr):
        per_class_total[label] += 1
        if pred == label:
            per_class_correct[label] += 1

    per_class_acc = np.divide(
        per_class_correct, per_class_total,
        out=np.zeros(num_classes), where=per_class_total > 0,
    )

    # Save per-class accuracy CSV
    csv_path = OUTPUT_DIR / "per_class_accuracy.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["class_name", "correct", "total", "accuracy"])
        for i, name in enumerate(class_names):
            writer.writerow([name, int(per_class_correct[i]), int(per_class_total[i]), f"{per_class_acc[i]:.4f}"])
    print(f"  Saved per-class accuracy to {csv_path}")

    # Confusion matrix — find top-20 most confused pairs
    confusion = np.zeros((num_classes, num_classes), dtype=int)
    for pred, label in zip(all_preds_arr, all_labels_arr):
        confusion[label][pred] += 1

    # Find most confused pairs (off-diagonal)
    confused_pairs: list[tuple[int, int, int]] = []
    for i in range(num_classes):
        for j in range(num_classes):
            if i != j and confusion[i][j] > 0:
                confused_pairs.append((i, j, confusion[i][j]))
    confused_pairs.sort(key=lambda x: x[2], reverse=True)
    top_confused = confused_pairs[:20]

    if top_confused:
        # Get unique classes involved in top confused pairs
        confused_classes = sorted(set(c for pair in top_confused for c in (pair[0], pair[1])))
        n = len(confused_classes)

        sub_confusion = np.zeros((n, n), dtype=int)
        for i, ci in enumerate(confused_classes):
            for j, cj in enumerate(confused_classes):
                sub_confusion[i][j] = confusion[ci][cj]

        fig, ax = plt.subplots(figsize=(max(12, n * 0.5), max(10, n * 0.5)))
        im = ax.imshow(sub_confusion, cmap="YlOrRd")
        confused_labels = [class_names[c][:20] for c in confused_classes]
        ax.set_xticks(range(n))
        ax.set_yticks(range(n))
        ax.set_xticklabels(confused_labels, rotation=45, ha="right", fontsize=7)
        ax.set_yticklabels(confused_labels, fontsize=7)
        ax.set_xlabel("Predicted")
        ax.set_ylabel("True")
        ax.set_title("Confusion Matrix (Top Confused Classes)")
        plt.colorbar(im)
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / "confusion_matrix.png", dpi=150)
        plt.close()
        print(f"  Saved confusion matrix to {OUTPUT_DIR / 'confusion_matrix.png'}")

        print("\n  Top confused pairs:")
        for true_idx, pred_idx, count in top_confused[:10]:
            print(f"    {class_names[true_idx]} -> {class_names[pred_idx]}: {count}")

    # Worst misclassified examples grid
    misclassified = [
        (i, all_labels[i], all_preds[i], max(all_probs[i]))
        for i in range(len(all_labels))
        if all_preds[i] != all_labels[i]
    ]
    misclassified.sort(key=lambda x: x[3], reverse=True)  # most confident wrong first

    if misclassified:
        n_show = min(16, len(misclassified))
        fig, axes = plt.subplots(4, 4, figsize=(16, 16))
        axes_flat = axes.flatten()

        # Denormalization for display
        inv_mean = [-m / s for m, s in zip(IMAGENET_MEAN, IMAGENET_STD)]
        inv_std = [1.0 / s for s in IMAGENET_STD]
        inv_normalize = transforms.Normalize(inv_mean, inv_std)

        for idx in range(16):
            ax = axes_flat[idx]
            if idx < n_show:
                sample_idx, true_label, pred_label, confidence = misclassified[idx]
                img_tensor, _ = test_dataset[sample_idx]
                img_display = inv_normalize(img_tensor).permute(1, 2, 0).clamp(0, 1).numpy()
                ax.imshow(img_display)
                ax.set_title(
                    f"True: {class_names[true_label][:15]}\n"
                    f"Pred: {class_names[pred_label][:15]}\n"
                    f"Conf: {confidence:.2f}",
                    fontsize=7,
                )
            ax.axis("off")

        plt.suptitle("Worst Misclassified Examples (most confident wrong predictions)", fontsize=12)
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / "worst_misclassified.png", dpi=150)
        plt.close()
        print(f"  Saved worst misclassified grid to {OUTPUT_DIR / 'worst_misclassified.png'}")
    else:
        print("  No misclassified examples!")


if __name__ == "__main__":
    evaluate_model()

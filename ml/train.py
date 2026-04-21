"""Training script: MobileNetV3-Small two-stage fine-tuning."""

import argparse
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms

ML_DIR = Path(__file__).resolve().parent
DATASET_DIR = ML_DIR / "dataset"
OUTPUT_DIR = ML_DIR / "output"
CLASS_NAMES_PATH = ML_DIR / "class_names.json"

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def get_transforms() -> dict[str, transforms.Compose]:
    return {
        "train": transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]),
        "val": transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]),
    }


def build_model(num_classes: int) -> models.MobileNetV3:
    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    # Replace classifier head
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)
    return model


def freeze_backbone(model: models.MobileNetV3) -> None:
    for param in model.features.parameters():
        param.requires_grad = False


def unfreeze_last_blocks(model: models.MobileNetV3, num_blocks: int = 3) -> None:
    # MobileNetV3 features is a Sequential of InvertedResidual blocks
    total = len(model.features)
    for i, block in enumerate(model.features):
        if i >= total - num_blocks:
            for param in block.parameters():
                param.requires_grad = True


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: optim.Optimizer,
    device: torch.device,
) -> tuple[float, float]:
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for inputs, labels in loader:
        inputs, labels = inputs.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * inputs.size(0)
        _, preds = outputs.max(1)
        correct += preds.eq(labels).sum().item()
        total += labels.size(0)

    return running_loss / total, correct / total


def evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> tuple[float, float]:
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for inputs, labels in loader:
            inputs, labels = inputs.to(device), labels.to(device)
            outputs = model(inputs)
            loss = criterion(outputs, labels)

            running_loss += loss.item() * inputs.size(0)
            _, preds = outputs.max(1)
            correct += preds.eq(labels).sum().item()
            total += labels.size(0)

    return running_loss / total, correct / total


def save_training_curves(history: dict, output_path: Path) -> None:
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

    ax1.plot(history["train_loss"], label="Train Loss")
    ax1.plot(history["val_loss"], label="Val Loss")
    ax1.set_xlabel("Epoch")
    ax1.set_ylabel("Loss")
    ax1.set_title("Training & Validation Loss")
    ax1.legend()
    ax1.grid(True)

    ax2.plot(history["train_acc"], label="Train Acc")
    ax2.plot(history["val_acc"], label="Val Acc")
    ax2.set_xlabel("Epoch")
    ax2.set_ylabel("Accuracy")
    ax2.set_title("Training & Validation Accuracy")
    ax2.legend()
    ax2.grid(True)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print(f"Saved training curves to {output_path}")


def train(
    epochs_head: int = 10,
    epochs_finetune: int = 30,
    batch_size: int = 32,
    lr_head: float = 1e-3,
    lr_finetune: float = 1e-4,
) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Check for class names
    if not CLASS_NAMES_PATH.exists():
        print("ERROR: class_names.json not found. Run prepare_dataset.py first.")
        sys.exit(1)

    with open(CLASS_NAMES_PATH) as f:
        class_names = json.load(f)
    num_classes = len(class_names)
    print(f"Training with {num_classes} classes")

    # Device
    if torch.backends.mps.is_available():
        device = torch.device("mps")
    elif torch.cuda.is_available():
        device = torch.device("cuda")
    else:
        device = torch.device("cpu")
    print(f"Using device: {device}")

    # Data
    data_transforms = get_transforms()
    train_dataset = datasets.ImageFolder(DATASET_DIR / "train", data_transforms["train"])
    val_dataset = datasets.ImageFolder(DATASET_DIR / "val", data_transforms["val"])

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, num_workers=4, pin_memory=True)

    print(f"Train: {len(train_dataset)} images, Val: {len(val_dataset)} images")

    # Model
    model = build_model(num_classes)
    model = model.to(device)
    criterion = nn.CrossEntropyLoss()

    # Verify class ordering matches
    folder_classes = train_dataset.classes
    if folder_classes != class_names:
        print("WARNING: ImageFolder class order differs from class_names.json")
        print("Saving ImageFolder ordering as the canonical class_names.json")
        with open(CLASS_NAMES_PATH, "w") as f:
            json.dump(folder_classes, f, indent=2)

    history: dict[str, list[float]] = {
        "train_loss": [], "val_loss": [], "train_acc": [], "val_acc": [],
    }
    best_val_acc = 0.0

    # ── Stage 1: Head only ──
    print(f"\n{'='*60}")
    print(f"Stage 1: Training classifier head ({epochs_head} epochs, lr={lr_head})")
    print(f"{'='*60}")
    freeze_backbone(model)
    optimizer = optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=lr_head, weight_decay=1e-4,
    )

    for epoch in range(epochs_head):
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc = evaluate(model, val_loader, criterion, device)

        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["train_acc"].append(train_acc)
        history["val_acc"].append(val_acc)

        print(f"  Epoch {epoch+1:3d}/{epochs_head} | "
              f"Train Loss: {train_loss:.4f} Acc: {train_acc:.4f} | "
              f"Val Loss: {val_loss:.4f} Acc: {val_acc:.4f}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), OUTPUT_DIR / "best_model.pth")
            print(f"    -> New best model (val_acc={val_acc:.4f})")

    # ── Stage 2: Fine-tune top blocks ──
    print(f"\n{'='*60}")
    print(f"Stage 2: Fine-tuning last 3 blocks ({epochs_finetune} epochs, lr={lr_finetune})")
    print(f"{'='*60}")
    unfreeze_last_blocks(model, num_blocks=3)
    optimizer = optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=lr_finetune, weight_decay=1e-4,
    )
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs_finetune)

    for epoch in range(epochs_finetune):
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc = evaluate(model, val_loader, criterion, device)
        scheduler.step()

        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["train_acc"].append(train_acc)
        history["val_acc"].append(val_acc)

        current_lr = scheduler.get_last_lr()[0]
        print(f"  Epoch {epoch+1:3d}/{epochs_finetune} | "
              f"Train Loss: {train_loss:.4f} Acc: {train_acc:.4f} | "
              f"Val Loss: {val_loss:.4f} Acc: {val_acc:.4f} | "
              f"LR: {current_lr:.6f}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), OUTPUT_DIR / "best_model.pth")
            print(f"    -> New best model (val_acc={val_acc:.4f})")

    # Save final model too
    torch.save(model.state_dict(), OUTPUT_DIR / "final_model.pth")

    # Save training curves
    save_training_curves(history, OUTPUT_DIR / "training_curves.png")

    print(f"\nTraining complete. Best val accuracy: {best_val_acc:.4f}")
    print(f"Best checkpoint: {OUTPUT_DIR / 'best_model.pth'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train MobileNetV3-Small for Mewgenics item recognition")
    parser.add_argument("--epochs-head", type=int, default=10, help="Epochs for head-only training (default: 10)")
    parser.add_argument("--epochs-finetune", type=int, default=30, help="Epochs for fine-tuning (default: 30)")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size (default: 32)")
    parser.add_argument("--lr-head", type=float, default=1e-3, help="Learning rate for head training (default: 1e-3)")
    parser.add_argument("--lr-finetune", type=float, default=1e-4, help="Learning rate for fine-tuning (default: 1e-4)")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    train(
        epochs_head=args.epochs_head,
        epochs_finetune=args.epochs_finetune,
        batch_size=args.batch_size,
        lr_head=args.lr_head,
        lr_finetune=args.lr_finetune,
    )

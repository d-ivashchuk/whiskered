"""Dataset preparation: organize sprites into ImageFolder layout with augmentation.

Includes game-tile background compositing and screen-photo simulation
so the model generalizes to real photos of game screens.
"""

import json
import random
import shutil
import sys
from pathlib import Path

import albumentations as A
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES_DIR = ROOT / "data" / "sprites" / "png"
DATASET_DIR = Path(__file__).resolve().parent / "dataset"
CLASS_NAMES_PATH = Path(__file__).resolve().parent / "class_names.json"

TRAIN_AUG_COUNT = 100
VAL_AUG_COUNT = 10
IMAGE_SIZE = 224

# Game inventory tile background colors
TILE_COLORS = [
    (245, 158, 11),   # amber   #f59e0b
    (168, 85, 247),   # purple  #a855f7
    (59, 130, 246),   # blue    #3b82f6
    (34, 197, 94),    # green   #22c55e
    (107, 114, 128),  # gray    #6b7280
    (31, 41, 55),     # dark gray #1f2937
    (120, 53, 15),    # brown   #78350f
    (212, 197, 169),  # beige   #d4c5a9
]


def composite_on_background(sprite_img: Image.Image) -> np.ndarray:
    """Composite a sprite onto a random background (50% colored tile, 50% white).

    Adds slight padding to simulate inventory cell spacing.
    """
    # Convert to RGBA to use alpha channel
    sprite_rgba = sprite_img.convert("RGBA")
    w, h = sprite_rgba.size

    # Random padding 4-8px on each side
    pad = random.randint(4, 8)
    bg_size = max(w, h) + pad * 2

    # 50% chance colored tile, 50% white/neutral
    if random.random() < 0.5:
        color = random.choice(TILE_COLORS)
    else:
        # White or near-white
        v = random.randint(240, 255)
        color = (v, v, v)

    bg = Image.new("RGBA", (bg_size, bg_size), (*color, 255))

    # Center the sprite on the background
    offset_x = (bg_size - w) // 2
    offset_y = (bg_size - h) // 2
    bg.paste(sprite_rgba, (offset_x, offset_y), sprite_rgba)

    # Convert to RGB (drop alpha)
    result = bg.convert("RGB")
    return np.array(result)


def build_augmentation_pipeline() -> A.Compose:
    """Augmentation pipeline with screen-photo simulation transforms."""
    return A.Compose([
        # Geometric transforms
        A.RandomRotate90(p=0.5),
        A.Rotate(limit=30, p=0.7, border_mode=0, fill=255),
        A.Perspective(scale=(0.02, 0.08), p=0.4),
        A.Affine(
            translate_percent=(-0.1, 0.1), scale=(0.85, 1.15), rotate=(-15, 15),
            p=0.6, border_mode=0, fill=255,
        ),

        # Screen-photo simulation
        A.RandomBrightnessContrast(brightness_limit=0.4, contrast_limit=0.4, p=0.7),
        A.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3, hue=0.08, p=0.6),
        A.RandomShadow(
            num_shadows_limit=(1, 2),
            shadow_dimension=5,
            p=0.3,
        ),

        # Blur / noise / compression (camera shake, low quality)
        A.OneOf([
            A.Blur(blur_limit=3, p=1.0),
            A.GaussNoise(p=1.0),
            A.MotionBlur(blur_limit=5, p=1.0),
        ], p=0.5),

        # Simulate zoomed-in / low-res phone photos
        A.Downscale(scale_range=(0.5, 0.8), p=0.3),

        A.ImageCompression(quality_range=(60, 95), p=0.5),

        # Final crop and resize
        A.RandomResizedCrop(
            size=(IMAGE_SIZE, IMAGE_SIZE), scale=(0.7, 1.0), ratio=(0.9, 1.1), p=0.8,
        ),
        A.Resize(IMAGE_SIZE, IMAGE_SIZE),  # ensure final size
    ])


def save_augmented(
    sprite_img: Image.Image,
    transform: A.Compose,
    out_dir: Path,
    count: int,
) -> None:
    """Generate augmented images with random background compositing."""
    for i in range(count):
        # Re-composite on a fresh random background each time
        img_array = composite_on_background(sprite_img)
        aug = transform(image=img_array)["image"]
        aug_img = Image.fromarray(aug)
        aug_img.save(out_dir / f"aug_{i:03d}.png")


def prepare() -> None:
    sprites = sorted(SPRITES_DIR.glob("*.png"))
    if not sprites:
        print(f"ERROR: No sprites found in {SPRITES_DIR}")
        sys.exit(1)

    print(f"Found {len(sprites)} sprites")

    # Clean previous dataset
    if DATASET_DIR.exists():
        shutil.rmtree(DATASET_DIR)

    # Build class names from sprite filenames (strip .png)
    class_names = [s.stem for s in sprites]

    # Save class names mapping
    with open(CLASS_NAMES_PATH, "w") as f:
        json.dump(class_names, f, indent=2)
    print(f"Saved {len(class_names)} class names to {CLASS_NAMES_PATH}")

    transform = build_augmentation_pipeline()

    for idx, sprite_path in enumerate(sprites):
        class_name = sprite_path.stem

        # Create split directories
        train_dir = DATASET_DIR / "train" / class_name
        val_dir = DATASET_DIR / "val" / class_name
        test_dir = DATASET_DIR / "test" / class_name
        train_dir.mkdir(parents=True, exist_ok=True)
        val_dir.mkdir(parents=True, exist_ok=True)
        test_dir.mkdir(parents=True, exist_ok=True)

        # Load image (keep RGBA for compositing)
        sprite_img = Image.open(sprite_path)

        # Copy original (RGB) to all splits
        rgb_img = sprite_img.convert("RGB")
        rgb_img.save(train_dir / "original.png")
        rgb_img.save(val_dir / "original.png")
        rgb_img.save(test_dir / "original.png")

        # Generate augmented images (with random backgrounds)
        save_augmented(sprite_img, transform, train_dir, TRAIN_AUG_COUNT)
        save_augmented(sprite_img, transform, val_dir, VAL_AUG_COUNT)

        if (idx + 1) % 100 == 0 or idx == len(sprites) - 1:
            print(f"  Processed {idx + 1}/{len(sprites)} classes")

    # Print summary
    train_count = sum(1 for _ in (DATASET_DIR / "train").rglob("*.png"))
    val_count = sum(1 for _ in (DATASET_DIR / "val").rglob("*.png"))
    test_count = sum(1 for _ in (DATASET_DIR / "test").rglob("*.png"))
    print(f"\nDataset ready:")
    print(f"  Train: {train_count} images ({len(class_names)} classes)")
    print(f"  Val:   {val_count} images ({len(class_names)} classes)")
    print(f"  Test:  {test_count} images ({len(class_names)} classes)")


if __name__ == "__main__":
    prepare()

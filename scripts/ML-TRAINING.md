# ML Training Pipeline

How we train the item classifier model. See `PRD.md` §5 for the full learning curriculum.

## Current State

- **Sprites**: ~900 item sprites in `data/sprites/png/` (224×224 PNG)
- **Model**: MobileNetV3-Small, pretrained on ImageNet, fine-tuned on our sprites
- **Export**: CoreML `.mlpackage` for iOS Neural Engine inference
- **Slot icons**: `data/sprites/slots/` — Head, Face, Neck, Weapon, Trinket, Consumable PNGs

## Training Data Augmentation

Wiki sprites are clean, isolated images on transparent backgrounds. Real in-game items
look different — they sit on **rarity backgrounds** with a **slot icon** in the corner.

### In-Game Item Appearance

Each item in the inventory has:

1. **A rarity background shape** behind the sprite:
   - **Common** — no background (plain)
   - **Uncommon** — gray circle
   - **Rare** — yellow triangle
   - **Very Rare** — red diamond
   - **Cursed** — purple splotch (overrides rarity icon)
   - **Side Quest** — blue square
   - **Quest** — green square

2. **A slot icon** in the top-left corner indicating equipment type:
   - Head (helmet shape)
   - Face (mask shape)
   - Neck (collar shape)
   - Weapon (sword shape)
   - Trinket (gem shape)
   - Consumable (potion shape)

   These sprites are already downloaded in `data/sprites/slots/*.png`.

### Composite Training Image Strategy (Future)

To improve real-world accuracy, we can generate training images that look closer to
actual in-game inventory screenshots by compositing:

```
┌─────────────────────┐
│ [slot icon]         │
│                     │
│   [rarity bg shape] │
│   [item sprite]     │
│                     │
└─────────────────────┘
```

**Steps to implement:**

1. **Create rarity background assets** — draw/extract the 7 rarity shapes
   (circle, triangle, diamond, splotch, blue square, green square, none)
   as transparent PNGs. Could be fetched from the wiki or hand-drawn to match.

2. **Composite script** — for each item, generate variants:
   - Layer: solid inventory cell background
   - Layer: rarity background shape (matching the item's rarity from data)
   - Layer: item sprite centered
   - Layer: slot icon in top-left corner (matching item's slot)
   - Apply standard augmentations on top (rotation, brightness, blur, noise, etc.)

3. **Mix clean + composite** — train on both raw sprites AND composited versions
   so the model handles both wiki lookups and live camera screenshots.

4. **Per-item variants** — since each item has a known rarity and slot, generate
   the correct composite. But also generate with random rarity backgrounds to
   teach the model that the background shape is NOT the distinguishing feature.

### Why This Should Help

The model currently trains on clean sprites but needs to identify items in screenshots
where they're surrounded by rarity shapes, slot icons, and inventory grid lines. Adding
these visual elements to training data bridges the domain gap between "wiki sprite" and
"phone photo of game screen."

### Priority

Not blocking v0 — the current clean-sprite training should hit 85%+ accuracy for
direct sprite matching. Composite training is a **v1 improvement** to boost accuracy
on real inventory screenshots, especially when items are photographed in bulk via the
grid scanner.

## Training Commands

```bash
# (future) Generate composite training images
# npm run compose-training-images

# See PRD.md §5.4 for PyTorch training config
# See PRD.md §5.6 for CoreML export
```

## Evaluation Checklist

- [ ] Top-1 accuracy ≥ 85% on held-out test set
- [ ] Top-3 accuracy ≥ 95%
- [ ] No class below 60% F1
- [ ] Inference < 80ms on iPhone 12
- [ ] CoreML predictions match PyTorch on 10 test images
- [ ] Preprocessing (scale/bias) matches between training and inference

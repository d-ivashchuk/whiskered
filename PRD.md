# Mewgenics Scanner — v0 Build Plan

**Status:** ship-fast with asymmetric automation
**v0 scope:** iOS app, single feature: point-and-identify Mewgenics items with camera, show full wiki info
**Timeline:** 6 weeks to TestFlight
**Automation philosophy:** Claude Code agents handle crawl + iOS + integration; you drive the ML with Claude help; critical ML decisions stay with you (learning goal)

This supersedes the companion-app-first plan. Companion features (breeding calculator, party tracker, events, cheatsheet) are **v1+, post-launch**. v0 is one feature only.

---

## Table of contents

1. What v0 is (and is not)
2. Three parallel tracks
3. ML learning curriculum — deep but scoped
4. Track A: crawl + data pipeline (agent-driven)
5. Track B: ML prototype + model (you + Claude, scaffolded by agent)
6. Track C: iOS app (agent-driven, you integrate the model)
7. 6-week roadmap
8. Decision gates
9. Post-v0 expansion plan
10. Resources

---

## 1. What v0 is (and is not)

### What v0 IS

**A single-purpose iOS app.** User opens → camera. Two modes:

**Mode A: Live identify.** Point camera at an item. Real-time top-3 predictions as overlay chips with confidence. Tap a prediction → full entity detail page (parsed wiki data: name, description, stats, effects, set, tags, synergies).

**Mode B: Photo mode.** Take a photo of an inventory grid. App shows the photo with manual crop UI — user drags rectangles over each item they want identified. Each cropped region runs through the same classifier. Results shown as a list with tap-through to detail pages.

**Why manual crop instead of auto-detection:** true object detection (YOLO) is 2x engineering cost and requires a separate model pipeline. Manual crop uses the single classifier model you've already trained. Ships fast. Auto-detection becomes v1. Users won't mind in v0 — they're impressed the thing works at all.

### What v0 is NOT

- No breeding calculator
- No party tracker
- No event probability calculator
- No cheatsheet
- No search UI beyond scanner results (database accessible only via scanner hits)
- No filters, no build planner, no sharing
- No Android
- No accounts, no cloud sync
- No ads, no subscription — $4.99 one-time paid app

Everything you'd find in the companion PRD moves to v1+. **v0 is "Shazam for Mewgenics items."**

### Why this scope

- Single feature = crisp product story ("take a photo, know what the item does")
- Differentiates hard from every competing app (none have this, none can build it without ML skill)
- Validates the ML approach before you invest in the companion surface
- The crawl infrastructure you build for v0 is 100% reusable for v1+
- TikTok-shaped: "watch this app read my Mewgenics inventory" is a 15-second clip

---

## 2. Three parallel tracks

### Track A — Crawl + data pipeline
**Owner: Claude Code agents, you review.**
What: wiki scraping, parsing, SQLite export, image downloading, sprite extraction for ML training.
Why agent-delegated: fully specified in v2 PRD (§4). No judgment calls. Good agent work.

### Track B — ML prototype + model
**Owner: you, with Claude help; Claude Code does scaffolding only.**
What: dataset prep, augmentation, MobileNetV3 training, evaluation, TFLite conversion.
Why you drive: this is your learning track. Agent writes boilerplate Python; you make every architecture, augmentation, and hyperparameter decision yourself. You read the confusion matrix. You decide when the model is good enough.

### Track C — iOS app
**Owner: Claude Code agents, you integrate the model.**
What: Expo project, camera integration, manual crop UI, entity detail page, paywall.
Why agent-delegated: React Native scaffolding is well-patterned work. Camera + TFLite integration is the one tricky part — you handle that personally because it's where model and app meet.

**How this scales:** Track A finishes first and unblocks Track B (needs sprites) and Track C (needs data). Track B and Track C run parallel in weeks 3-5, converging in week 6 when you integrate the trained model into the app.

---

## 3. ML learning curriculum — deep but scoped

You want to go deep. Here's the ordered concept list you'll actually encounter during Track B. Each bullet is a concept to genuinely understand, not skim. Budget ~1-2 hours per concept for reading + experimentation.

### Week 2, before writing any training code

**1. What a neural network actually is.** It's just a function `f(image) → probabilities`. Composed of layers that multiply inputs by weights, add biases, apply non-linearities. Training = find weights that make `f` output correct answers on your training set. Nothing mystical.

**2. Image classification vs detection vs segmentation.** You're doing classification. One image in, one class out. Detection finds multiple objects with boxes (YOLO); segmentation labels each pixel (SAM). Knowing the difference helps you read papers without getting confused.

**3. Transfer learning.** Training a network from scratch needs millions of images. You don't have that. Instead: take a network pretrained on ImageNet (1.2M images, 1000 classes of real-world objects), freeze most of it, retrain only the last layer on your 200-item dataset. The pretrained network already knows "edges, corners, textures, shapes" — you just teach it "these specific shapes are Mewgenics items." This is the single most important concept for small datasets.

**4. Convolutional neural networks (CNNs).** The family of architectures that dominated image tasks until transformers. MobileNet is a CNN optimized for mobile inference. Understand that convolutions are just sliding filters that detect local patterns, stacked into layers that detect increasingly abstract patterns (edges → shapes → objects).

**5. MobileNetV3 specifically.** Read the paper's abstract + intro. Understand: depthwise separable convolutions (cheap conv variant), squeeze-and-excite blocks (attention for CNNs), the NAS-derived architecture. You don't need to implement it — you need to know what you're using.

### Week 3, while building the training pipeline

**6. Train/validation/test splits.** Split your dataset 70/15/15. Train on 70%, validate on 15% (tune hyperparameters based on this), test on 15% (touch only once at the end to report real accuracy). Never tune on the test set — that's cheating yourself.

**7. Data augmentation.** Your 200 items × 1 sprite each = 200 images. Not enough. Augmentation synthesizes "new" images from existing ones: rotate, scale, brightness shift, crop, blur, JPEG compress, etc. Each epoch, the network sees different versions. Understand this isn't just padding — it's teaching the network invariance. An item is the same item whether rotated 15° or brighter or slightly blurred.

**8. Loss functions.** Cross-entropy loss for classification. Understand: the network outputs 200 probabilities that sum to 1. Loss is `-log(P(correct_class))`. Network tries to minimize this. When predictions are confident AND right, loss is ~0. Confident AND wrong, loss is huge.

**9. Optimizers.** SGD vs Adam vs AdamW. Adam is the default for a reason. Learning rate is the single most important hyperparameter — too high and the network diverges; too low and it learns glacially. `1e-3` is a reasonable starting point; `1e-4` for fine-tuning.

**10. Overfitting.** Your network memorizes the training set perfectly, fails on the validation set. Signs: train accuracy 100%, val accuracy 60%. Fixes: more augmentation, dropout, weight decay, early stopping, simpler model. You will hit this.

**11. Confusion matrix.** A 200×200 matrix showing which items get confused with which. When accuracy is below target, this tells you *where* the model is failing. Often reveals "all trinkets with skull motifs collapse into one class" — meaning your training data needs more diverse examples of those.

### Week 4, while evaluating

**12. Precision, recall, F1 per class.** Average accuracy hides per-class disparities. Some items might be 99% accurate, others 40%. Per-class metrics tell you which items need more training data.

**13. Quantization.** Your trained model is float32, maybe 10 MB. Quantization converts weights to int8, shrinking the model 4x with minimal accuracy loss. Critical for mobile deployment. Understand: there's post-training quantization (easier, slight accuracy drop) and quantization-aware training (harder, better accuracy).

**14. CoreML vs TFLite.** Apple's CoreML is native to iOS, uses the Neural Engine automatically, faster inference. TFLite works on both iOS and Android but is slower on iOS. For an iOS-only v0, convert to CoreML. For cross-platform later, TFLite.

### Week 5, while integrating

**15. Model deployment gotchas.** Preprocessing must match exactly between training and inference. If you trained with `pixel / 255.0 → normalize with ImageNet mean/std`, you MUST do the same in the iOS app. Off-by-one on preprocessing is the #1 cause of "works in Python, broken in app."

**16. Inference latency.** Measure actual ms per prediction on a real iPhone. Target: <100ms per crop. If slower, shrink the model or quantize harder.

### What you do NOT need to learn for v0

- Transformer architectures (ViT) — CNN is fine for this scale
- GANs, diffusion models — irrelevant to classification
- Reinforcement learning — irrelevant
- LLM fine-tuning — different field entirely
- Multi-GPU training — Colab free tier T4 is enough
- Custom loss functions — cross-entropy is fine
- Custom architectures — use MobileNetV3 pretrained

---

## 4. Track A: crawl + data pipeline (agent-driven)

This track is fully specified in v2 PRD §4. Claude Code agents execute it.

### Deliverables

1. `mewgenics-data-pipeline` repo, TypeScript, yargs CLI
2. `npx mew-crawl` with all subcommands: check, crawl, parse, enrich, validate, diff, export, sync, rebuild
3. Parsers for all 10 entity types via `wtf_wikipedia`
4. Zod-validated JSON for all entities in `data/*.json`
5. SQLite export → `data.sqlite` (~20 MB with just items, fewer if starting items-only)
6. Image pipeline: download all item sprites from wiki, convert to WebP, bundle
7. **New for scanner**: `npx mew-crawl export-training-set` command that produces the sprite dataset structured for ML training (see §5)
8. GitHub Action for daily sync
9. Claude Code skill `.claude/skills/mew-sync/SKILL.md`

### Scanner-specific addition: training set exporter

The companion app uses items via SQLite. The scanner needs sprites organized as `dataset/<item_id>/<sprite_file>.webp`. Add a CLI command:

```bash
npx mew-crawl export-training-set --output ../mewgenics-scanner-ml/dataset
```

This just restructures the already-downloaded sprites into the directory layout PyTorch's `ImageFolder` expects. ~15 lines of code. Let the agent write it.

### Expected timeline

Week 1: days 1-5 full pipeline ships. Daily sync running by end of week 1.

---

## 5. Track B: ML prototype + model (you drive)

This is your learning + shipping track. You do the work; Claude writes scaffolding you then modify and understand.

### 5.1 Environment

**Local + Colab hybrid.** Your Mac Mini M4 for dataset prep and iteration (fast feedback). Colab free tier T4 for actual training runs (free GPU time).

```bash
# On your Mac, create the ML repo
mkdir mewgenics-scanner-ml && cd $_
uv init  # or poetry/pyenv, your pick
uv add torch torchvision albumentations pillow wandb matplotlib scikit-learn jupyter
uv add coremltools  # for iOS export
```

Set up Weights & Biases (free tier) from day one. Every run logged. You'll thank yourself when comparing 20 experiments at week 4.

### 5.2 Dataset prep (week 2, days 1-2)

Input: `dataset/<item_id>/<sprite>.webp` from Track A.

Problem: each item has ~1 sprite from the wiki. That's 200-900 images total for 200-900 classes. **1 example per class. You cannot train on that as-is.**

Solution: **synthetic augmentation**. Each sprite becomes 50-200 augmented variants. Techniques:

```python
# scaffolding Claude can write for you, that you then understand deeply
import albumentations as A

training_augmentations = A.Compose([
    A.RandomRotate90(p=0.5),           # items appear at different orientations in-game
    A.Rotate(limit=30, p=0.5),          # small tilts from camera angle
    A.RandomBrightnessContrast(p=0.5),  # different monitor brightnesses
    A.Blur(blur_limit=3, p=0.3),        # camera autofocus imperfect
    A.ImageCompression(quality_lower=70, p=0.3),  # JPEG compression from phones
    A.RandomCrop(height=200, width=200, p=0.5),
    A.ShiftScaleRotate(p=0.5),
    A.GaussNoise(p=0.3),                # camera sensor noise
])
```

Also critical: **photograph a test set manually.** Take 50-100 real phone photos of Mewgenics items on your own screen. These go into the test set. Augmentation can't fully simulate real phone photos — lens distortion, rolling shutter, weird glare. Having real photos in your test set keeps you honest.

**Decisions you own (not the agent):**
- How many augmentations per item? Start with 100; adjust after first training
- Which augmentations to include/exclude? Depends on what real photos look like
- Should you include the raw wiki sprite in training or just augmentations? Include it
- Train size vs validation size? 70/15/15 for train/val/test

### 5.3 Model choice (week 2, day 3)

**Start with MobileNetV3-Small, pretrained on ImageNet.** Reasons:
- Designed for mobile: small (~2.5M params), fast inference
- Pretrained features transfer well to sprite classification
- Well-supported in both PyTorch and CoreML
- Battle-tested in production mobile apps

Alternative to consider if MobileNetV3-Small plateaus below 85% accuracy: MobileNetV3-Large (~5.5M params, more capacity). Try Small first; upsize only if needed.

Do NOT start with ViT, ResNet50, or anything bigger. They'll work but they're wasteful for this task and slow to train in Colab free tier.

**The training approach: two-stage fine-tuning.**

Stage 1 (fast): freeze all ImageNet weights except the final classification layer, retrain that single layer on your 200 classes. Takes ~30 min on T4, gets you to maybe 60-75% accuracy. This is your sanity check that the pipeline works.

Stage 2 (slow): unfreeze the last 2-3 conv blocks, retrain with a lower learning rate. Takes ~2-4 hours, gets you to 85-95% accuracy.

### 5.4 Training script (week 2, day 4-5)

Claude Code can write you a PyTorch training loop scaffold. Your job: understand every line. Things you must be able to explain:

- Why is there a `model.train()` vs `model.eval()` call?
- What does `optimizer.zero_grad()` do and why is it needed?
- What's the difference between `torch.no_grad()` and `model.eval()`?
- Why does validation loss start rising while training loss keeps falling?
- What's a `DataLoader` doing and why does `num_workers > 0` speed things up?

If you can't answer these, don't move on. Spend a day reading. This is where understanding compounds for future ML work.

**A reasonable training config to start:**

```python
# this is a starting point, not the final answer — you'll tune
BATCH_SIZE = 32
LEARNING_RATE_HEAD = 1e-3      # stage 1: head only
LEARNING_RATE_FINETUNE = 1e-4  # stage 2: unfrozen blocks
EPOCHS_HEAD = 10
EPOCHS_FINETUNE = 30
WEIGHT_DECAY = 1e-4
```

### 5.5 Evaluation (week 3, continuous)

Every training run, log to W&B:
- Train/val loss per epoch
- Train/val accuracy per epoch
- Per-class F1 (confusion matrix)
- Sample predictions (images + predicted + true) — W&B handles this natively

Look at the confusion matrix. Which classes confuse each other? Usually the answer is "visually similar items get confused" — those items need more diverse augmentation or more training examples.

**Target metrics for v0 ship:**
- Top-1 accuracy on held-out test set: ≥85%
- Top-3 accuracy: ≥95%
- Per-class F1: no class below 60% (items below that get flagged in UI as "uncertain")
- Inference latency on iPhone 12: <80ms per image

Show top-3 always. Mobile UX handles uncertainty well when framed as "here are your top guesses" rather than one confident answer.

### 5.6 CoreML export (week 4)

```python
# scaffold Claude can write; you verify
import coremltools as ct
import torch

model.eval()
example_input = torch.rand(1, 3, 224, 224)
traced = torch.jit.trace(model, example_input)

mlmodel = ct.convert(
    traced,
    inputs=[ct.ImageType(shape=(1, 3, 224, 224), scale=1/255.0, bias=[-0.485/0.229, -0.456/0.224, -0.406/0.225])],
    classifier_config=ct.ClassifierConfig(class_labels=class_names),
    compute_units=ct.ComputeUnit.ALL,  # uses Neural Engine
    convert_to="mlprogram",
    minimum_deployment_target=ct.target.iOS16,
)
mlmodel.save("mewgenics_items.mlpackage")
```

Verify the exported model matches the PyTorch model's predictions on 10 test images. If they diverge, it's almost always preprocessing (scale/bias above must exactly match PyTorch's `transforms.Normalize`).

### 5.7 Deliverable

End of week 4: a `.mlpackage` file (~3-8 MB), a label list, documentation of exact preprocessing, and a confidence in the reported accuracy numbers. Commit to the scanner app repo's `assets/ml/` folder.

---

## 6. Track C: iOS app (agent-driven, you integrate)

### 6.1 Scope

Minimal app around the scanner. ~6 screens total.

1. **Paywall** — first launch gate, $4.99 one-time
2. **Live scanner** — camera preview, real-time top-3 overlay
3. **Photo scanner** — photo picker/capture, manual crop tool, results list
4. **Entity detail** — full wiki info for identified item (reused from companion PRD §12)
5. **Recent scans** — history of scanned items, tap to re-view details
6. **Settings** — about, credits, CC BY-SA attribution, restore purchase

That's it. No search screen, no calculator, no party. Pure scanner.

### 6.2 Stack

```json
{
  "expo": "~52.0.0",
  "expo-router": "~4.0.0",
  "expo-sqlite": "~15.0.0",
  "expo-image": "~2.0.0",
  "react-native-vision-camera": "^4.5.0",
  "react-native-purchases": "^8.0.0",
  "posthog-react-native": "^3.0.0",
  "@sentry/react-native": "^5.30.0",
  "zustand": "^4.5.0"
}
```

**New for scanner:** `react-native-vision-camera` (camera frames), plus a CoreML integration. You have two options:

**Option 1:** `react-native-vision-camera` + a custom frame processor plugin that calls CoreML. Plugin is native Swift, ~100 lines. Ships the model at full Neural Engine speed.

**Option 2:** React Native ExecuTorch or a community TFLite package. Easier to integrate, slower inference, wider platform support.

**Recommend Option 1** for v0. The Swift plugin is the one piece you should write yourself (or pair-code with Claude) because it's where ML meets app. Understanding it debugs half your future bugs.

### 6.3 Delegation to Claude Code

Paste this doc + v2 PRD §12 (UI patterns), §14 (paywall), §6 (schema for bundled SQLite) into Claude Code. Prompt:

> Scaffold an Expo React Native app for the Mewgenics item scanner per the attached docs. Build these screens first: Paywall, Live Scanner (camera UI only, no model yet), Photo Scanner (photo capture + crop tool, no model yet), Entity Detail (reads from bundled SQLite). Use Zustand for state, Expo Router for nav. Stop when camera + crop UI work with dummy data — I'll wire up the model integration myself.

Agent delivers weeks 3-5 in parallel with your ML work. You then spend week 6 wiring the model in, which is the part that needs your understanding of how the model expects input.

### 6.4 The manual crop UI (photo mode)

Key UX detail. After photo capture:

- Show the photo full-screen
- Tap-drag a rectangle anywhere on the image = add a crop box
- Pinch to resize, drag to move existing boxes
- "Identify all" button runs each cropped region through the classifier
- Results appear as a scrollable list under the photo, each result tappable for full detail

Simple, explicit, and doesn't require an object detection model. Users who actually want auto-detection will request it and that's your v1 signal.

### 6.5 Recent scans

SQLite table in user data:

```sql
CREATE TABLE recent_scans (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  scanned_at INTEGER NOT NULL,
  thumbnail_path TEXT  -- local path to the cropped image
);
```

Lightweight personal history. Nice touch for repeat users.

---

## 7. 6-week roadmap

### Week 1 — Crawl pipeline (Track A, agent-driven)

**Goal:** all Mewgenics item data + sprites in your possession, in structured form.

Monday–Friday (agent does the work, you review PRs):
- Day 1: repo scaffold, CLI skeleton, MWN fetchers
- Day 2: recentchanges incremental sync, category listing
- Day 3: item parser (prioritize items over other entities for scanner)
- Day 4: Zod validation, fixture tests, first full item pull
- Day 5: image download + WebP conversion, `export-training-set` command, GitHub Action for daily sync

End of week: `data/items.json` has ~900 entries, `dataset/<item_id>/sprite.webp` exists for every item.

### Week 2 — ML foundations + dataset (Track B, you)

**Goal:** you understand transfer learning conceptually, dataset is prepped, first training run completes.

- Days 1-2: read ML curriculum concepts 1-5 (§3). Set up Python env, uv, PyTorch. Run a "hello world" MobileNet inference on a single sprite to verify pipeline.
- Day 3: dataset loader with `ImageFolder`. Augmentation pipeline with albumentations. Write `dataset.py`, `augment.py`. 70/15/15 split. Take 50 real phone photos for the test set.
- Day 4: Stage 1 training — frozen backbone + new classification head. Goal is just "pipeline works end-to-end", don't tune. Expect 60-75% test accuracy. Log everything to W&B.
- Day 5: review the confusion matrix. Identify the 10 worst-performing classes. Hypothesize why (similar visually? not enough augmentation?). Write it down.

### Week 3 — Real training + iOS scaffold (Tracks B + C parallel)

**Track B (you):**
- Days 1-3: Stage 2 training — unfreeze top blocks, fine-tune with lower LR. Target 85%+ top-1 accuracy. Iterate on augmentation strategy, learning rate, number of unfrozen blocks. Every iteration logged.
- Days 4-5: evaluation deep-dive. Per-class F1. Identify the "uncertain classes" that will be flagged in UI. Decide whether to ship with them or exclude from v0.

**Track C (agent, you review):**
- Days 1-5: Expo app scaffold, paywall screen, camera preview screen (no model yet), photo capture screen, entity detail screen reading from bundled `data.sqlite` copied from Track A.

End of week: ML model hits 85%+ test accuracy OR you've identified exactly what's blocking it. App has all UI screens with dummy scanner responses.

### Week 4 — CoreML export + plugin (Tracks B + C converge)

**Track B (you):**
- Days 1-2: CoreML export with coremltools. Verify predictions match PyTorch on 10 test images. Document exact preprocessing pipeline.
- Day 3: inference latency benchmark. If >80ms on iPhone 12, quantize harder or swap to MobileNetV3-Small-Minimalistic.

**Track C (you + agent):**
- Days 4-5: Swift frame processor plugin for `react-native-vision-camera`. This is the native code bridge. Claude can draft it; you understand every line. Wire the real model into the Live Scanner screen. Verify predictions appear in <100ms on device.

### Week 5 — Multi-item mode + polish (Track C, you drive)

- Days 1-2: manual crop UI for photo mode. Tap-drag rectangles, pinch to resize, "identify all" button iterates crops through model.
- Day 3: recent scans screen + history SQLite table.
- Day 4: settings screen (about, CC BY-SA attribution, non-affiliation disclaimer, restore purchase, feedback email).
- Day 5: RevenueCat sandbox testing end-to-end. Fresh install → paywall → buy (sandbox) → full access. Restore purchase. Failure modes.

### Week 6 — QA + submit + launch

- Days 1-2: manual QA on real phone. Scan 50 items from live Mewgenics play. Record what fails. Fix obvious bugs. Consider a second model training if scan failures cluster in a retrainable pattern.
- Day 3: App Store screenshots. 6 screens × 3 device sizes. Use real scanner output, not mocked.
- Day 4: App Store metadata (name, subtitle, description, keywords), privacy labels, age rating, submit.
- Day 5: TikTok clip prep, Reddit launch post draft, Discord mod outreach, wait for Apple review.

Launch when Apple approves.

---

## 8. Decision gates

### End of week 2: does the ML work at all?

If stage 1 training gets to >50% accuracy: proceed with confidence.
If <50% but confusion matrix suggests fixable data issues: keep going, Track B has slack.
If <50% AND confusion matrix suggests the task is genuinely hard (many visually similar items): **reconsider scope**. Options: cut to top 200 items, add more distinguishing augmentations, switch model to larger MobileNetV3-Large, or accept <85% top-1 with confident top-3 as the product.

### End of week 3: is the model shippable?

Target: 85% top-1, 95% top-3. If you hit it: ship-bound. If you miss it but top-3 is strong: ship with UX emphasizing top-3 ("here are your top guesses"). If both miss: decide whether to slip the timeline a week or cut item count.

### End of week 4: is CoreML + plugin working?

If inference is <100ms and predictions match Python: green light week 5.
If predictions diverge from Python: you have a preprocessing bug. This is always fixable; budget 1-2 days.

### Week 6 pre-submit: QA gate

If real-device scans succeed on ≥80% of 50 test items in normal lighting: submit.
If fails, don't submit. Retrain with better augmentation for real-world lighting OR delay submit 1 week.

---

## 9. Post-v0 expansion plan

Once v0 ships:

### v1 (weeks 7-10): companion features from v2 PRD
- Breeding calculator (hero feature, SciresM port)
- Event decision trees
- Party tracker
- Hidden mechanics cheatsheet
- Database search + filters

This is a direct execution of v2 PRD §7-12. Mostly Claude Code agent work. You review.

### v1.5: true object detection
- Replace manual crop with YOLO auto-detection
- Training data: the manual crops your users make become real-world labeled data
- Ship as free update

### v2: other games
- The crawl pipeline + ML training pipeline are both game-agnostic
- Pick next target based on player demand and wiki.gg availability
- Candidates: Balatro (visual items are highly distinct), Path of Exile 2 (massive complexity, large wiki), Hades II (community demand). Isaac has competition already.

The scanner becomes the wedge; each new game is a 4-6 week execution with infrastructure reused.

---

## 10. Resources

For the ML learning curriculum, here's what to actually read/watch. Prioritize these over random blog posts.

### Foundational (before week 2 ends)

- **fast.ai course lesson 1**: "Your deep learning journey" — most accessible intro to transfer learning with real code. Free. ~2 hours.
- **3Blue1Brown Neural Networks series**: visual intuition for backprop and gradients. Free. ~1 hour total.
- **PyTorch tutorial: Transfer Learning for Computer Vision**: official docs, exactly your use case. Free. ~2 hours.

### During training (weeks 2-3)

- **Karpathy's "A Recipe for Training Neural Networks"**: blog post, the closest thing to a ML sanity checklist that exists. Read when your model isn't learning.
- **Albumentations docs**: `https://albumentations.ai/docs/` — reference for augmentation choices.
- **MobileNetV3 paper**: skim the abstract and architecture section. Don't get lost in the NAS details.

### Deployment (week 4)

- **Apple CoreML docs**: specifically the section on `ct.convert()` and `ComputeUnit.ALL`.
- **react-native-vision-camera frame processor plugins**: the official docs have a Swift CoreML example.

### Optional, deeper understanding

- **Deep Learning book (Goodfellow, Bengio, Courville)**: chapters 6, 8, 9. For when you want the math.
- **Karpathy's "Neural Networks: Zero to Hero" YouTube series**: builds nanoGPT from scratch. Overkill for this project but if you genuinely want to get good at ML, this is the best free resource on the internet.

---

*End of v0 plan.*

*Philosophy reminder: you're building two things. A product (ship it) and a skill (learn it). The automation choices in this plan protect both. Don't let "ship fast" eat the learning. Don't let "learn deeply" eat the ship date. They coexist if you let them.*

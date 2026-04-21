"""Entry point: chain or run individual pipeline steps."""

import argparse
import sys
from pathlib import Path

# Ensure ml/ is on the path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))


def cmd_prepare() -> None:
    from prepare_dataset import prepare
    prepare()


def cmd_train(args: argparse.Namespace) -> None:
    from train import train
    train(
        epochs_head=args.epochs_head,
        epochs_finetune=args.epochs_finetune,
        batch_size=args.batch_size,
        lr_head=args.lr_head,
        lr_finetune=args.lr_finetune,
    )


def cmd_evaluate() -> None:
    from evaluate import evaluate_model
    evaluate_model()


def cmd_export() -> None:
    from export_coreml import export
    export()


def cmd_all(args: argparse.Namespace) -> None:
    print("=" * 60)
    print("Step 1/4: Preparing dataset")
    print("=" * 60)
    cmd_prepare()

    print("\n" + "=" * 60)
    print("Step 2/4: Training model")
    print("=" * 60)
    cmd_train(args)

    print("\n" + "=" * 60)
    print("Step 3/4: Evaluating model")
    print("=" * 60)
    cmd_evaluate()

    print("\n" + "=" * 60)
    print("Step 4/4: Exporting to CoreML")
    print("=" * 60)
    cmd_export()

    print("\n" + "=" * 60)
    print("Pipeline complete!")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description="Mewgenics ML Pipeline")
    subparsers = parser.add_subparsers(dest="command", help="Pipeline step to run")

    subparsers.add_parser("prepare", help="Prepare dataset from sprites")

    train_parser = subparsers.add_parser("train", help="Train the model")
    train_parser.add_argument("--epochs-head", type=int, default=10)
    train_parser.add_argument("--epochs-finetune", type=int, default=30)
    train_parser.add_argument("--batch-size", type=int, default=32)
    train_parser.add_argument("--lr-head", type=float, default=1e-3)
    train_parser.add_argument("--lr-finetune", type=float, default=1e-4)

    subparsers.add_parser("evaluate", help="Evaluate on test set")
    subparsers.add_parser("export", help="Export to CoreML")

    all_parser = subparsers.add_parser("all", help="Run full pipeline")
    all_parser.add_argument("--epochs-head", type=int, default=10)
    all_parser.add_argument("--epochs-finetune", type=int, default=30)
    all_parser.add_argument("--batch-size", type=int, default=32)
    all_parser.add_argument("--lr-head", type=float, default=1e-3)
    all_parser.add_argument("--lr-finetune", type=float, default=1e-4)

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    commands = {
        "prepare": lambda: cmd_prepare(),
        "train": lambda: cmd_train(args),
        "evaluate": lambda: cmd_evaluate(),
        "export": lambda: cmd_export(),
        "all": lambda: cmd_all(args),
    }

    commands[args.command]()


if __name__ == "__main__":
    main()

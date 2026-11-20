
from pathlib import Path
import shutil
import yaml
import torch
from ultralytics import YOLO

# Folder utama
BASE_DIR = Path(__file__).resolve().parent
DATASETS_DIR = BASE_DIR / "datasets"
OUTPUT_DIR = BASE_DIR / "runs" / "retry_failed"
MODEL_DIR = BASE_DIR / "models" / "trained"

# Hanya dua dataset yang gagal
DATASETS = [
    "Fruits and Vegetables",
    "bawang merah",
]

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

device = "mps" if torch.backends.mps.is_available() else "cpu"

print("DEVICE:", device)
print("TRAINING ULANG 2 DATASET")
print("Dataset asli tidak akan diubah.")

for index, dataset_name in enumerate(DATASETS, start=1):
    print(f"\n{'='*50}")
    print(f"DATASET {index}/2: {dataset_name}")
    print(f"{'='*50}")

    try:
        dataset_dir = DATASETS_DIR / dataset_name
        data_yaml = dataset_dir / "data.yaml"

        if not data_yaml.exists():
            raise FileNotFoundError(
                f"data.yaml tidak ditemukan: {data_yaml}"
            )

        # Membaca konfigurasi dataset
        with open(data_yaml, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)

        # Salin konfigurasi agar file asli tidak berubah
        config = dict(config)
        config["path"] = str(dataset_dir.resolve())

        # Buat YAML khusus untuk percobaan ulang
        safe_name = (
            dataset_name.lower()
            .replace(" ", "_")
            .replace("&", "and")
        )

        retry_yaml = OUTPUT_DIR / f"{safe_name}.yaml"

        with open(retry_yaml, "w", encoding="utf-8") as f:
            yaml.safe_dump(
                config,
                f,
                sort_keys=False,
                allow_unicode=True
            )

        # Training
        model = YOLO("yolov8n.pt")

        result = model.train(
            data=str(retry_yaml),
            epochs=50,
            imgsz=640,
            batch=4,
            workers=0,
            device=device,
            patience=15,
            amp=False,
            cache=False,
            project=str(OUTPUT_DIR),
            name=safe_name,
            exist_ok=True
        )

        # Simpan model terbaik dengan nama dataset
        best_model = Path(result.save_dir) / "weights" / "best.pt"

        if not best_model.exists():
            raise FileNotFoundError(
                f"best.pt tidak ditemukan: {best_model}"
            )

        destination = MODEL_DIR / f"{safe_name}.pt"
        shutil.copy2(best_model, destination)

        print(f"\nTRAINING BERHASIL: {dataset_name}")
        print(f"MODEL: {destination}")

    except Exception as error:
        print(f"\nTRAINING GAGAL: {dataset_name}")
        print("DETAIL:", error)

print("\n================================")
print("TRAINING ULANG SELESAI")
print("Periksa folder models/trained")
print("================================")


# ============================================================
# TRAINING YOLOv8 - SEMUA DATASET PERTANIAN
# MacBook Apple Silicon - MPS
# ============================================================

from pathlib import Path
import yaml
import shutil
import re
import torch
import traceback
import gc

from ultralytics import YOLO


# ============================================================
# 1. KONFIGURASI UTAMA
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

DATASETS_DIR = BASE_DIR / "datasets"
MODELS_DIR = BASE_DIR / "models" / "trained"
RUNS_DIR = BASE_DIR / "runs" / "train_all"
CONFIG_DIR = RUNS_DIR / "configs"

MODEL_BASE = "yolov8n.pt"

EPOCHS = 50
IMAGE_SIZE = 640
BATCH_SIZE = 4
WORKERS = 0

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

for folder in [MODELS_DIR, RUNS_DIR, CONFIG_DIR]:
    folder.mkdir(parents=True, exist_ok=True)


# ============================================================
# 2. DAFTAR DATASET
# ============================================================

DATASET_NAMES = [
    "Fruits and Vegetables",
    "Jenis Beras",
    "bawang merah",
    "bawang putih",
    "cabai keriting merah",
    "cabai",
    "chili",
    "deteksi timun",
    "jagung",
]


# ============================================================
# 3. INFORMASI SISTEM
# ============================================================

print("\n" + "=" * 65)
print("          YOLOv8 AGRICULTURE TRAINING SYSTEM")
print("=" * 65)

print("PyTorch       :", torch.__version__)
print("Ultralytics   : Aktif")
print("Device        :", DEVICE)
print("Epoch         :", EPOCHS)
print("Image Size    :", IMAGE_SIZE)
print("Batch Size    :", BATCH_SIZE)
print("Total Dataset :", len(DATASET_NAMES))

if DEVICE == "mps":
    print("Apple GPU     : Tersedia")
else:
    print("Apple GPU     : Tidak tersedia, menggunakan CPU")


# ============================================================
# 4. FUNGSI MENCARI FOLDER GAMBAR
# ============================================================

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".bmp", ".webp"
}


def find_image_dir(dataset_dir, split, yaml_value):

    # Nama folder yang umum digunakan Roboflow
    folder_names = {
        "train": ["train"],
        "val": ["valid", "val"],
        "test": ["test"],
    }

    candidates = []

    # Prioritaskan struktur folder standar
    for folder_name in folder_names[split]:
        candidates.append(
            dataset_dir / folder_name / "images"
        )

    # Periksa lokasi dari data.yaml
    if yaml_value:

        original = Path(yaml_value)

        if original.is_absolute():
            candidates.append(original)
        else:
            candidates.append(dataset_dir / original)

    checked = set()

    for candidate in candidates:

        candidate = candidate.resolve()

        if candidate in checked:
            continue

        checked.add(candidate)

        if candidate.is_dir():

            images = [
                file for file in candidate.rglob("*")
                if file.suffix.lower() in IMAGE_EXTENSIONS
            ]

            if images:
                return candidate

    if split == "test":
        return None

    raise FileNotFoundError(
        f"Folder gambar {split} tidak ditemukan!\n"
        f"Dataset: {dataset_dir}"
    )


# ============================================================
# 5. VALIDASI DATASET DAN PEMBUATAN YAML
# ============================================================

def validate_dataset(dataset_dir, model_name):

    yaml_file = dataset_dir / "data.yaml"

    if not yaml_file.exists():
        raise FileNotFoundError(
            f"data.yaml tidak ditemukan: {yaml_file}"
        )

    print("\nMembaca konfigurasi:", yaml_file)

    with open(yaml_file, "r", encoding="utf-8") as file:
        config = yaml.safe_load(file)

    if not isinstance(config, dict):
        raise ValueError("Isi data.yaml tidak valid")

    nc = int(config["nc"])
    names = config["names"]

    # Mengubah dictionary nama kelas menjadi list
    if isinstance(names, dict):
        names = [
            names[key]
            for key in sorted(names, key=lambda x: int(x))
        ]

    if len(names) != nc:
        raise ValueError(
            f"Jumlah kelas tidak sesuai: nc={nc}, names={len(names)}"
        )

    training_config = {
        "nc": nc,
        "names": names,
    }

    # Memeriksa train, validation, dan test
    for split in ["train", "val", "test"]:

        if split not in config:

            if split == "test":
                continue

            raise ValueError(
                f"Konfigurasi {split} tidak ditemukan"
            )

        image_dir = find_image_dir(
            dataset_dir,
            split,
            config[split]
        )

        if image_dir is None:
            print(f"{split.upper()}: tidak tersedia, dilewati")
            continue

        images = [
            file for file in image_dir.rglob("*")
            if file.suffix.lower() in IMAGE_EXTENSIONS
        ]

        label_dir = image_dir.parent / "labels"

        print(f"\n{split.upper()}")
        print("Folder gambar :", image_dir)
        print("Jumlah gambar :", len(images))

        if not label_dir.is_dir():

            if split == "test":
                print("Folder label test tidak tersedia")
                continue

            raise FileNotFoundError(
                f"Folder label tidak ditemukan: {label_dir}"
            )

        label_files = list(label_dir.rglob("*.txt"))

        print("Jumlah label  :", len(label_files))

        if split in ["train", "val"] and not label_files:
            raise ValueError(
                f"Tidak ada file anotasi: {label_dir}"
            )

        # Validasi isi anotasi YOLO Detection
        for label_file in label_files:

            lines = label_file.read_text(
                encoding="utf-8"
            ).splitlines()

            for line_number, line in enumerate(lines, start=1):

                if not line.strip():
                    continue

                values = line.split()

                if len(values) != 5:
                    raise ValueError(
                        f"Format label harus 5 nilai: "
                        f"{label_file}, baris {line_number}"
                    )

                try:
                    class_value = float(values[0])
                    coords = [
                        float(value) for value in values[1:]
                    ]
                except ValueError:
                    raise ValueError(
                        f"Label bukan angka: {label_file}"
                    )

                if not class_value.is_integer():
                    raise ValueError(
                        f"ID kelas tidak valid: {label_file}"
                    )

                class_id = int(class_value)

                if not 0 <= class_id < nc:
                    raise ValueError(
                        f"ID kelas {class_id} tidak sesuai "
                        f"dengan jumlah kelas {nc}: {label_file}"
                    )

                if not all(0 <= value <= 1 for value in coords):
                    raise ValueError(
                        f"Koordinat harus berada antara 0 dan 1: "
                        f"{label_file}"
                    )

                if coords[2] <= 0 or coords[3] <= 0:
                    raise ValueError(
                        f"Ukuran bounding box tidak valid: "
                        f"{label_file}"
                    )

        # Path absolut agar tidak salah membaca folder
        training_config[split] = str(image_dir.resolve())

    # Train dan validation wajib tersedia
    if "train" not in training_config:
        raise ValueError("Folder train tidak ditemukan")

    if "val" not in training_config:
        raise ValueError("Folder validation tidak ditemukan")

    # Membuat file YAML khusus untuk YOLO
    training_yaml = CONFIG_DIR / f"{model_name}.yaml"

    with open(training_yaml, "w", encoding="utf-8") as file:
        yaml.safe_dump(
            training_config,
            file,
            sort_keys=False,
            allow_unicode=True
        )

    print("\nKonfigurasi YOLO berhasil dibuat:")
    print(training_yaml)

    return training_yaml


# ============================================================
# 6. TRAINING SEMUA DATASET
# ============================================================

results = []

for index, dataset_name in enumerate(DATASET_NAMES, start=1):

    print("\n\n" + "=" * 65)
    print(f"DATASET {index}/{len(DATASET_NAMES)}")
    print("NAMA:", dataset_name)
    print("=" * 65)

    dataset_dir = DATASETS_DIR / dataset_name

    model_name = re.sub(
        r"[^a-z0-9]+",
        "_",
        dataset_name.lower()
    ).strip("_")

    model = None

    try:

        # ----------------------------------------------------
        # VALIDASI
        # ----------------------------------------------------

        print("\n[1] Memeriksa dataset...")

        data_yaml = validate_dataset(
            dataset_dir,
            model_name
        )

        # ----------------------------------------------------
        # LOAD MODEL
        # ----------------------------------------------------

        print("\n[2] Memuat YOLOv8 Nano...")

        model = YOLO(MODEL_BASE)

        # ----------------------------------------------------
        # TRAINING
        # ----------------------------------------------------

        print("\n[3] Memulai training...")
        print("Device:", DEVICE)

        model.train(

            data=str(data_yaml),

            epochs=EPOCHS,

            imgsz=IMAGE_SIZE,

            batch=BATCH_SIZE,

            device=DEVICE,

            workers=WORKERS,

            patience=15,

            pretrained=True,

            amp=False,

            cache=False,

            plots=True,

            save=True,

            project=str(RUNS_DIR),

            name=model_name,

            exist_ok=False,

            verbose=True,

        )

        # ----------------------------------------------------
        # SIMPAN MODEL TERBAIK
        # ----------------------------------------------------

        print("\n[4] Menyimpan model terbaik...")

        best_model = Path(model.trainer.best)

        if not best_model.exists():
            raise FileNotFoundError(
                f"best.pt tidak ditemukan: {best_model}"
            )

        output_model = MODELS_DIR / f"{model_name}.pt"

        shutil.copy2(
            best_model,
            output_model
        )

        print("\nTRAINING BERHASIL!")
        print("Dataset :", dataset_name)
        print("Model   :", output_model)

        results.append({
            "dataset": dataset_name,
            "status": "BERHASIL",
            "model": str(output_model)
        })

    except Exception as error:

        print("\nTRAINING GAGAL!")
        print("Dataset:", dataset_name)
        print("Penyebab:", error)

        traceback.print_exc()

        results.append({
            "dataset": dataset_name,
            "status": "GAGAL",
            "model": str(error)
        })

    finally:

        # Membersihkan memori setelah setiap dataset
        if model is not None:
            del model

        gc.collect()

        if torch.backends.mps.is_available():
            torch.mps.empty_cache()


# ============================================================
# 7. LAPORAN AKHIR
# ============================================================

print("\n\n" + "=" * 65)
print("              LAPORAN HASIL TRAINING")
print("=" * 65)

for result in results:

    print("\nDataset :", result["dataset"])
    print("Status  :", result["status"])
    print("Detail  :", result["model"])

success = sum(
    1 for result in results
    if result["status"] == "BERHASIL"
)

failed = len(results) - success

print("\n" + "=" * 65)
print("TOTAL DATASET :", len(results))
print("BERHASIL      :", success)
print("GAGAL         :", failed)
print("=" * 65)

print("\nFolder model:")
print(MODELS_DIR)

print("\nFolder hasil training:")
print(RUNS_DIR)

print("\nSEMUA PROSES TRAINING SELESAI!")

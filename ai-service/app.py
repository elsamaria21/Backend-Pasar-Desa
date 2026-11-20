from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO
from pathlib import Path
import numpy as np
import threading
import torch

# =====================================
# KONFIGURASI FLASK
# =====================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models" / "trained"

app = Flask(__name__)
CORS(app)

app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

# =====================================
# DAFTAR 9 MODEL YOLO LOKAL
# =====================================

MODEL_CONFIG = {
    "fruits_and_vegetables": "fruits_and_vegetables.pt",
    "jenis_beras": "jenis_beras.pt",
    "bawang_merah": "bawang_merah.pt",
    "bawang_putih": "bawang_putih.pt",
    "cabai_keriting": "cabai_keriting_merah.pt",
    "cabai": "cabai.pt",
    "chili": "chili.pt",
    "timun": "deteksi_timun.pt",
    "jagung": "jagung.pt",
}

# Cache model agar tidak dimuat berulang kali
loaded_models = {}
model_lock = threading.Lock()

# =====================================
# MEMUAT MODEL
# =====================================

def get_ai_model(model_name):

    if model_name not in MODEL_CONFIG:
        raise ValueError(f"Model '{model_name}' tidak tersedia")

    model_path = MODEL_DIR / MODEL_CONFIG[model_name]

    if not model_path.exists():
        raise FileNotFoundError(
            f"File model tidak ditemukan: {model_path}"
        )

    with model_lock:
        if model_name not in loaded_models:
            print(f"Memuat model: {model_name}")

            loaded_models[model_name] = YOLO(str(model_path))

            print(f"Model berhasil dimuat: {model_name}")

    return loaded_models[model_name]


# =====================================
# HOME
# =====================================

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "success": True,
        "message": "Pasar Desa AI Service berjalan!",
        "device": DEVICE
    })


# =====================================
# HEALTH CHECK
# =====================================

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "success": True,
        "service": "Pasar Desa AI Service",
        "status": "running",
        "device": DEVICE,
        "available_models": list(MODEL_CONFIG.keys())
    })


# =====================================
# DAFTAR MODEL
# =====================================

@app.route("/models", methods=["GET"])
def models():

    model_list = []

    for name, filename in MODEL_CONFIG.items():
        path = MODEL_DIR / filename

        model_list.append({
            "name": name,
            "file": filename,
            "available": path.exists(),
            "loaded": name in loaded_models
        })

    return jsonify({
        "success": True,
        "total_models": len(model_list),
        "models": model_list
    })


# =====================================
# PREDIKSI GAMBAR
# =====================================

@app.route("/predict", methods=["POST"])
def predict():

    try:
        if "image" not in request.files:
            return jsonify({
                "success": False,
                "message": "Gambar tidak ditemukan. Gunakan field image."
            }), 400

        model_name = request.form.get(
            "model", "cabai_keriting"
        ).lower().strip()

        if model_name not in MODEL_CONFIG:
            return jsonify({
                "success": False,
                "message": "Nama model tidak tersedia",
                "available_models": list(MODEL_CONFIG.keys())
            }), 400

        file = request.files["image"]

        if not file.filename:
            return jsonify({
                "success": False,
                "message": "File gambar kosong"
            }), 400

        # Membaca gambar
        try:
            image = Image.open(file.stream).convert("RGB")
            image_array = np.array(image)

        except (UnidentifiedImageError, OSError):
            return jsonify({
                "success": False,
                "message": "Format gambar tidak valid"
            }), 400

        # Memuat model lokal
        model = get_ai_model(model_name)

        # Menjalankan prediksi
        results = model.predict(
            source=image_array,
            conf=0.4,
            device=DEVICE,
            verbose=False
        )

        predictions = []

        for result in results:
            if result.boxes is None:
                continue

            for box in result.boxes:
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                coordinates = box.xyxy[0].cpu().tolist()

                predictions.append({
                    "class_id": class_id,
                    "class_name": model.names[class_id],
                    "confidence": round(confidence, 4),
                    "confidence_percent": round(confidence * 100, 2),
                    "bbox": {
                        "x1": round(coordinates[0], 2),
                        "y1": round(coordinates[1], 2),
                        "x2": round(coordinates[2], 2),
                        "y2": round(coordinates[3], 2)
                    }
                })

        return jsonify({
            "success": True,
            "message": "Prediksi berhasil",
            "model": model_name,
            "device": DEVICE,
            "image_width": image.width,
            "image_height": image.height,
            "total_detections": len(predictions),
            "predictions": predictions
        })

    except ValueError as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 400

    except Exception as error:
        print("ERROR PREDIKSI:", str(error))

        return jsonify({
            "success": False,
            "message": "Terjadi kesalahan saat melakukan prediksi",
            "error": str(error)
        }), 500


# =====================================
# ERROR UKURAN FILE
# =====================================

@app.errorhandler(413)
def file_too_large(error):
    return jsonify({
        "success": False,
        "message": "Ukuran gambar maksimal 10 MB"
    }), 413


# =====================================
# RUN SERVER
# =====================================

if __name__ == "__main__":
    print("=" * 45)
    print("PASAR DESA AI SERVICE")
    print("DEVICE:", DEVICE)
    print("TOTAL MODEL:", len(MODEL_CONFIG))
    print("=" * 45)

    app.run(
        host="0.0.0.0",
        port=5001,
        debug=True,
        use_reloader=False
    )

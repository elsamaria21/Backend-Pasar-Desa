
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from inference import get_model
from PIL import Image, UnidentifiedImageError
import os
import numpy as np
import threading

# =====================================
# LOAD ENVIRONMENT
# =====================================

load_dotenv()

app = Flask(__name__)
CORS(app)

app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

API_KEY = os.getenv("ROBOFLOW_API_KEY")


# =====================================
# DAFTAR MODEL ROBOFLOW
# =====================================

MODEL_CONFIG = {
    "chili": os.getenv("ROBOFLOW_MODEL_CHILI"),
    "cabai_keriting": os.getenv("ROBOFLOW_MODEL_CABAI_KERITING"),
    "bawang_merah": os.getenv("ROBOFLOW_MODEL_BAWANG_MERAH"),
    "jagung": os.getenv("ROBOFLOW_MODEL_JAGUNG"),
    "timun": os.getenv("ROBOFLOW_MODEL_TIMUN"),
    "wortel": os.getenv("ROBOFLOW_MODEL_WORTEL"),
    "beras": os.getenv("ROBOFLOW_MODEL_BERAS"),
    "bawang_putih": os.getenv("ROBOFLOW_MODEL_BAWANG_PUTIH"),
    "cabai": os.getenv("ROBOFLOW_MODEL_CABAI"),
}


# =====================================
# MODEL CACHE
# Agar model tidak dimuat berulang kali
# =====================================

loaded_models = {}
model_lock = threading.Lock()


def get_ai_model(nama_model):

    if nama_model not in MODEL_CONFIG:
        raise ValueError(
            f"Model '{nama_model}' tidak tersedia"
        )

    model_id = MODEL_CONFIG[nama_model]

    if not model_id:
        raise ValueError(
            f"Konfigurasi model {nama_model} belum ada di .env"
        )

    if not API_KEY:
        raise ValueError(
            "ROBOFLOW_API_KEY belum diatur di .env"
        )

    with model_lock:

        if nama_model not in loaded_models:

            print(f"Memuat model: {nama_model}")

            loaded_models[nama_model] = get_model(
                model_id=model_id,
                api_key=API_KEY
            )

            print(f"Model {nama_model} berhasil dimuat")

    return loaded_models[nama_model]


# =====================================
# HOME
# =====================================

@app.route("/", methods=["GET"])
def home():

    return jsonify({
        "success": True,
        "message": "Pasar Desa AI Service berjalan!"
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
        "available_models": [
            name for name, model_id in MODEL_CONFIG.items()
            if model_id
        ]
    })


# =====================================
# CEK DAFTAR MODEL
# =====================================

@app.route("/models", methods=["GET"])
def models():

    return jsonify({
        "success": True,
        "models": [
            {
                "name": name,
                "configured": bool(model_id)
            }
            for name, model_id in MODEL_CONFIG.items()
        ]
    })


# =====================================
# PREDIKSI GAMBAR
# =====================================

@app.route("/predict", methods=["POST"])
def predict():

    try:

        # Cek gambar
        if "image" not in request.files:

            return jsonify({
                "success": False,
                "message": "Gambar tidak ditemukan"
            }), 400

        # Ambil nama model
        nama_model = request.form.get(
            "model",
            "cabai_keriting"
        ).lower().strip()

        file = request.files["image"]

        if not file.filename:

            return jsonify({
                "success": False,
                "message": "File gambar kosong"
            }), 400

        # Validasi model
        if nama_model not in MODEL_CONFIG:

            return jsonify({
                "success": False,
                "message": "Nama model tidak tersedia",
                "available_models": list(MODEL_CONFIG.keys())
            }), 400

        # Baca gambar
        try:

            image = Image.open(file.stream).convert("RGB")
            image_array = np.array(image)

        except (UnidentifiedImageError, OSError):

            return jsonify({
                "success": False,
                "message": "Format gambar tidak valid"
            }), 400

        # Ambil model
        model = get_ai_model(nama_model)

        # Jalankan prediksi
        results = model.infer(
            image_array,
            confidence=0.4
        )

        # Ambil hasil prediksi
        if not results:

            predictions = []

        else:

            result = results[0].json()

            if isinstance(result, dict):
                predictions = result.get("predictions", [])
            else:
                predictions = []

        # Kirim hasil
        return jsonify({
            "success": True,
            "message": "Prediksi berhasil",
            "model": nama_model,
            "total_detections": len(predictions),
            "predictions": predictions
        })

    except ValueError as e:

        return jsonify({
            "success": False,
            "message": str(e)
        }), 400

    except Exception as e:

        print("ERROR PREDIKSI:", str(e))

        return jsonify({
            "success": False,
            "message": "Terjadi kesalahan saat melakukan prediksi",
            "error": str(e)
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

    app.run(
        host="0.0.0.0",
        port=5001,
        debug=True
    )

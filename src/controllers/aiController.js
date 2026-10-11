
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// OpenAI hanya diinisialisasi jika API key tersedia.
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

// =====================================================
// AI GENERATE PRODUCT
// =====================================================

async function generateProduct(req, res) {
  // Periksa API key sebelum menjalankan fitur AI.
  if (!client) {
    return res.status(503).json({
      success: false,
      message:
        "Fitur AI belum aktif. Silakan konfigurasi OPENAI_API_KEY di file .env.",
    });
  }

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Foto produk wajib diupload.",
      });
    }

    const imagePath = req.file.path;
    const imageBuffer = fs.readFileSync(imagePath);
    const mimeType = getMimeType(imagePath);
    const base64Image = imageBuffer.toString("base64");
    const imageDataUrl = `data:${mimeType};base64,${base64Image}`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",

      instructions: `
Kamu adalah AI untuk marketplace PasarDesa UMKM.

Analisis foto produk yang diberikan dan buat:
1. Nama produk.
2. Deskripsi produk.

Gunakan Bahasa Indonesia yang natural.

Jangan mengarang:
- harga
- berat
- ukuran
- merek
- bahan
- sertifikasi
- manfaat medis
- informasi lain yang tidak terlihat.

Jika informasi tidak terlihat, gunakan deskripsi umum
berdasarkan apa yang terlihat pada foto.

Balasan harus berupa JSON valid dengan format:
{
  "name": "nama produk",
  "description": "deskripsi produk"
}
`,

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Analisis foto produk ini dan buat nama serta deskripsi produk untuk marketplace UMKM.",
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "auto",
            },
          ],
        },
      ],
    });

    let text = response.output_text || "";

    text = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let result;

    try {
      result = JSON.parse(text);
    } catch (error) {
      console.error("Gagal membaca JSON dari respons AI:", error);

      return res.status(502).json({
        success: false,
        message: "AI memberikan respons dengan format yang tidak valid.",
      });
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/products/${req.file.filename}`;

    return res.json({
      success: true,
      message: "AI berhasil menganalisis produk.",
      data: {
        name: result.name || "Produk UMKM",
        description:
          result.description || "Deskripsi produk belum tersedia.",
        image: imageUrl,
        fileName: req.file.filename,
      },
    });
  } catch (error) {
    console.error("AI ERROR:", error);

    // Hapus file jika pemrosesan AI gagal.
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (deleteError) {
        console.error("Gagal menghapus file:", deleteError.message);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Gagal memproses foto dengan AI.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
}

module.exports = {
  generateProduct,
};
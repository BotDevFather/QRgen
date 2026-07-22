import { generateQR } from "modqr";
import { createCanvas } from "canvas";
import FormData from "form-data";

export const config = {
  runtime: "nodejs"
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Only POST requests are allowed."
    });
  }

  try {
    const {
      text,
      size = 512,
      margin = 4,
      foreground = "#000000",
      background = "#FFFFFF",
      errorCorrection = "M",
      style = "rounded",
      finderStyle = "rounded",
      finderColor,
      customFinderStyles,
      logo,
      expire = 3600
    } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Parameter 'text' is required."
      });
    }

    // Generate QR
    const qr = generateQR(text, {
      renderer: "canvas",
      size,
      margin,
      foreground,
      background,
      errorCorrection,
      style,
      finderStyle,
      finderColor,
      customFinderStyles,
      logo
    });

    // Create canvas
    const canvas = createCanvas(size, size);

    // Draw QR
    await qr.drawCanvas(canvas);

    // PNG Buffer
    const buffer = canvas.toBuffer("image/png");

    // Upload to tmpfiles.org
    const form = new FormData();

    form.append("file", buffer, {
      filename: "qr.png",
      contentType: "image/png"
    });

    form.append("expire", String(expire));

    const upload = await fetch(
      "https://tmpfiles.org/api/v1/upload",
      {
        method: "POST",
        headers: form.getHeaders(),
        body: form
      }
    );

    const result = await upload.json();

    if (result.status !== "success") {
      throw new Error("Upload failed.");
    }

    return res.status(200).json({
      success: true,
      url: result.data.url,
      options: {
        size,
        style,
        finderStyle,
        errorCorrection
      }
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error"
    });
  }
}

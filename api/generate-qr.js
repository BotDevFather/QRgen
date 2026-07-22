import { generateQR } from "modqr";
import { createCanvas } from "canvas";

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

    // Convert buffer to base64
    const base64Image = buffer.toString('base64');

    // Upload to ImgBB
    const formData = new FormData();
    formData.append('key', '662490f3273c968183d261fbef567d24');
    formData.append('image', base64Image);
    formData.append('name', 'qr.png');
    
    // Add expiration if provided (in seconds)
    if (expire) {
      formData.append('expiration', String(expire));
    }

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.log(result);
      throw new Error(
        result.error?.message || result.statusText || 'Upload failed'
      );
    }

    return res.status(200).json({
      success: true,
      imageUrl: result.data.url,
      displayUrl: result.data.display_url,
      deleteUrl: result.data.delete_url,
      thumbUrl: result.data.thumb?.url,
      mediumUrl: result.data.medium?.url,
      options: {
        size,
        style,
        finderStyle,
        errorCorrection
      },
      imageInfo: {
        id: result.data.id,
        title: result.data.title,
        width: result.data.width,
        height: result.data.height,
        size: result.data.size,
        mime: result.data.image?.mime,
        extension: result.data.image?.extension
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

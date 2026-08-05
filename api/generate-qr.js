import { generateQR } from "modqr";
import { createCanvas, loadImage } from "canvas";
import fs from 'fs';
import path from 'path';

export const config = {
  runtime: "nodejs",
  maxDuration: 10
};

// Load logo ONCE at startup
const LOGO_PATH = path.join(process.cwd(), 'public/logo.png');
let cachedLogo = null;

function getLogo() {
  if (!cachedLogo) {
    try {
      const logoBuffer = fs.readFileSync(LOGO_PATH);
      cachedLogo = logoBuffer;
      console.log('✅ Logo loaded successfully from:', LOGO_PATH);
    } catch (error) {
      console.error('❌ Failed to load logo:', error.message);
      cachedLogo = null;
    }
  }
  return cachedLogo;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Only POST requests are allowed."
    });
  }

  try {
    const {
      text,
      size = 400,
      margin = 9,
      foreground = "#000000",
      background = "#FFFFFF",
      errorCorrection = "M",  // Changed from H to M for speed
      style = "rounded",
      finderStyle = "rounded",
      finderColor,
      customFinderStyles,
      expire = 3600
      // ⚠️ logo parameter is intentionally IGNORED
    } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Parameter 'text' is required."
      });
    }

    console.time("qr-generation");
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
      customFinderStyles
    });
    console.timeEnd("qr-generation");

    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    console.time("qr-draw");
    await qr.drawCanvas(canvas);
    console.timeEnd("qr-draw");

    // 🎯 ALWAYS add local logo (IGNORES request logo parameter)
    console.time("logo-processing");
    try {
      const logoBuffer = getLogo();
      
      if (logoBuffer) {
        const logoSize = Math.floor(size * 0.20); // 20% of QR size
        const logoPosition = (size - logoSize) / 2;

        const logoImage = await loadImage(logoBuffer);
        
        // White background behind logo
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2 + 5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Clip and draw logo
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logoImage, logoPosition, logoPosition, logoSize, logoSize);
        ctx.restore();
        
        // Border
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        console.log('✅ Logo added successfully');
      } else {
        console.log('⚠️ No logo available, continuing without it');
      }
      
      console.timeEnd("logo-processing");
    } catch (logoError) {
      console.error('❌ Logo processing error:', logoError.message);
      // Continue without logo
    }

    console.time("buffer-creation");
    const buffer = canvas.toBuffer("image/png");
    console.timeEnd("buffer-creation");

    // Upload to ImgBB
    console.time("imgbb-upload");
    
    // Use BINARY upload (faster than base64)
    const blob = new Blob([buffer], { type: "image/png" });
    const formData = new FormData();
    formData.append('key', process.env.IMGBB_API_KEY || '662490f3273c968183d261fbef567d24');
    formData.append('image', blob, 'qr.png');
    
    if (expire && expire >= 60 && expire <= 15552000) {
      formData.append('expiration', String(expire));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeout);
      
      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('ImgBB Error:', result);
        throw new Error(
          result.error?.message || result.statusText || 'Upload failed'
        );
      }

      console.timeEnd("imgbb-upload");

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
          errorCorrection,
          hasLogo: true // Always true because we always add local logo
        },
        imageInfo: {
          id: result.data.id,
          title: result.data.title,
          width: result.data.width,
          height: result.data.height,
          size: result.data.size,
          mime: result.data.image?.mime,
          extension: result.data.image?.extension,
          expiration: result.data.expiration
        }
      });
      
    } catch (fetchError) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        throw new Error('ImgBB upload timed out after 8 seconds');
      }
      throw fetchError;
    }

  } catch (err) {
    console.error('❌ Error:', err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error"
    });
  }
}

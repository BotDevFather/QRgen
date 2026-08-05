import { generateQR } from "modqr";
import { createCanvas, loadImage } from "canvas";
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

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
      console.log('✅ Logo loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load logo:', error.message);
      cachedLogo = null;
    }
  }
  return cachedLogo;
}

// Upload to Catbox.moe (Works with Node.js)
async function uploadToCatbox(buffer) {
  const formData = new FormData();
  formData.append('fileToUpload', buffer, {
    filename: 'qr.png',
    contentType: 'image/png'
  });
  formData.append('reqtype', 'fileupload');

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData,
    headers: formData.getHeaders()
  });

  const url = await response.text();
  
  if (!url || !url.startsWith('https://')) {
    console.error('Catbox response:', url);
    throw new Error('Catbox upload failed');
  }

  return url.trim();
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
      errorCorrection = "M",
      style = "rounded",
      finderStyle = "rounded",
      finderColor,
      customFinderStyles,
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

    // Add local logo
    console.time("logo-processing");
    try {
      const logoBuffer = getLogo();
      
      if (logoBuffer) {
        const logoSize = Math.floor(size * 0.20);
        const logoPosition = (size - logoSize) / 2;

        const logoImage = await loadImage(logoBuffer);
        
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2 + 5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logoImage, logoPosition, logoPosition, logoSize, logoSize);
        ctx.restore();
        
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        console.log('✅ Logo added successfully');
      }
      
      console.timeEnd("logo-processing");
    } catch (logoError) {
      console.error('❌ Logo processing error:', logoError.message);
    }

    console.time("buffer-creation");
    const buffer = canvas.toBuffer("image/png");
    console.timeEnd("buffer-creation");

    // 🚀 Upload to Catbox.moe
    console.time("upload-to-catbox");
    const imageUrl = await uploadToCatbox(buffer);
    console.timeEnd("upload-to-catbox");

    return res.status(200).json({
      success: true,
      imageUrl: imageUrl,
      options: {
        size,
        style,
        finderStyle,
        errorCorrection,
        hasLogo: true
      }
    });

  } catch (err) {
    console.error('❌ Error:', err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error"
    });
  }
}

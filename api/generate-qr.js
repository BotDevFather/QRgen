import { generateQR } from "modqr";
import { createCanvas, loadImage } from "canvas";

export const config = {
  runtime: "nodejs",
  maxDuration: 10
};

// Cache logo globally if it's always the same URL
let cachedLogo = null;
let cachedLogoPromise = null;

async function getCachedLogo(logoUrl) {
  if (cachedLogo) return cachedLogo;
  if (cachedLogoPromise) return cachedLogoPromise;
  
  cachedLogoPromise = loadImage(logoUrl).then(img => {
    cachedLogo = img;
    cachedLogoPromise = null;
    return img;
  }).catch(err => {
    cachedLogoPromise = null;
    throw err;
  });
  
  return cachedLogoPromise;
}

export default async function handler(req, res) {
  // Enable CORS
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
    console.time("total-request");
    
    const {
      text,
      size = 300, // Reduced from 512 to 300 for faster processing
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

    console.time("qr-generation");
    // Generate QR without logo first
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

    // Create canvas
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    console.time("qr-draw");
    // Draw QR code
    await qr.drawCanvas(canvas);
    console.timeEnd("qr-draw");

    // Handle logo if provided
    if (logo && logo.src) {
      try {
        console.time("logo-processing");
        // Calculate logo size (reduced to 20% for better QR readability)
        const logoSize = Math.floor(size * 0.20);
        const logoPosition = (size - logoSize) / 2;

        // Load the logo image with caching
        const logoImage = await getCachedLogo(logo.src);
        
        // Create a circular clipping path for the logo
        ctx.save();
        
        // Draw white background circle/square behind logo
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2 + 5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Clip to circle for rounded logo
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2, 0, Math.PI * 2);
        ctx.clip();
        
        // Draw the logo
        ctx.drawImage(logoImage, logoPosition, logoPosition, logoSize, logoSize);
        ctx.restore();
        
        // Add a border around the logo
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        console.timeEnd("logo-processing");
        
      } catch (logoError) {
        console.error('Logo processing error:', logoError);
        // Continue without logo if it fails
      }
    }

    console.time("buffer-creation");
    // PNG Buffer
    const buffer = canvas.toBuffer("image/png");
    console.timeEnd("buffer-creation");

    // FIX: Upload binary buffer instead of base64
    console.time("imgbb-upload");
    const blob = new Blob([buffer], { type: "image/png" });
    
    const formData = new FormData();
    formData.append('key', process.env.IMGBB_API_KEY || '662490f3273c968183d261fbef567d24');
    formData.append('image', blob, 'qr.png');
    
    if (expire && expire >= 60 && expire <= 15552000) {
      formData.append('expiration', String(expire));
    }

    // Add timeout to ImgBB request
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

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
      console.timeEnd("total-request");

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
          hasLogo: !!logo
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
        throw new Error('ImgBB upload timed out after 7 seconds');
      }
      throw fetchError;
    }

  } catch (err) {
    console.error('Error:', err);
    console.timeEnd("total-request");

    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error"
    });
  }
}

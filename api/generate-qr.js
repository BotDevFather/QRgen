import { generateQR } from "modqr";
import { createCanvas, loadImage } from "canvas";

export const config = {
  runtime: "nodejs",
  maxDuration: 10
};

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
      // logo is omitted here - we'll add it manually
    });

    // Create canvas
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Draw QR code
    await qr.drawCanvas(canvas);

    // Handle logo if provided
    if (logo && logo.src) {
      try {
        // Calculate logo size (typically 20-30% of QR code size)
        const logoSize = Math.floor(size * 0.25); // 25% of QR size
        const logoPosition = (size - logoSize) / 2;

        // Load the logo image
        const logoImage = await loadImage(logo.src);
        
        // Create a circular or square clipping path for the logo
        ctx.save();
        
        // Optional: Add a white background behind logo for better visibility
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        
        // Draw white background circle/square behind logo
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2 + 5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Clip to circle for rounded logo (optional)
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2, 0, Math.PI * 2);
        ctx.clip();
        
        // Draw the logo
        ctx.drawImage(logoImage, logoPosition, logoPosition, logoSize, logoSize);
        
        ctx.restore();
        
        // Optional: Add a border around the logo
        ctx.beginPath();
        ctx.arc(size/2, size/2, logoSize/2, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        
      } catch (logoError) {
        console.error('Logo processing error:', logoError);
        // Continue without logo if it fails
      }
    }

    // PNG Buffer
    const buffer = canvas.toBuffer("image/png");

    // Convert buffer to base64
    const base64Image = buffer.toString('base64');

    // Upload to ImgBB
    const formData = new FormData();
    formData.append('key', process.env.IMGBB_API_KEY || '662490f3273c968183d261fbef567d24');
    formData.append('image', base64Image);
    formData.append('name', 'qr.png');
    
    // Add expiration if provided (in seconds, 60-15552000)
    if (expire && expire >= 60 && expire <= 15552000) {
      formData.append('expiration', String(expire));
    }

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('ImgBB Error:', result);
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

  } catch (err) {
    console.error('Error:', err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error"
    });
  }
}

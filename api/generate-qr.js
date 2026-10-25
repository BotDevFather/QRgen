
import { generateQR } from "modqr";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

const LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "logo.png"
);

const TEMPFILE_UPLOAD_URL =
  "https://tempfile.org/api/upload/local";

let cachedLogo = null;

function getLogo() {
  if (!cachedLogo) {
    try {
      cachedLogo = fs.readFileSync(LOGO_PATH);
      console.log("Logo loaded successfully");
    } catch (error) {
      console.error(
        "Failed to load logo:",
        error.message
      );
      cachedLogo = null;
    }
  }

  return cachedLogo;
}

function phpUrlEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A")
    .replace(/%20/g, "+");
}

function generateOrderId() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce((result, part) => {
      if (part.type !== "literal") {
        result[part.type] = part.value;
      }

      return result;
    }, {});

  const timestamp =
    parts.year +
    parts.month +
    parts.day +
    parts.hour +
    parts.minute +
    parts.second;

  const random = Math.floor(
    1000 + Math.random() * 9000
  );

  return timestamp + random;
}

function getParams(req) {
  if (req.method === "GET") {
    return {
      ...req.query,
    };
  }

  return req.body || {};
}

async function uploadQrToTempFile(buffer, orderId) {
  const form = new FormData();

  const safeOrderId = String(orderId || "payment")
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  form.append(
    "files",
    new Blob([buffer], {
      type: "image/png",
    }),
    `qr-${safeOrderId}.png`
  );

  form.append("expiryHours", "1");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  try {
    const response = await fetch(
      TEMPFILE_UPLOAD_URL,
      {
        method: "POST",
        body: form,
        signal: controller.signal,
      }
    );

    const result = await response.json();

    if (!response.ok || result.success !== true) {
      throw new Error(
        result.message ||
        `Temporary upload failed with HTTP ${response.status}`
      );
    }

    const file = result.files?.[0];

    if (!file?.id) {
      throw new Error(
        "Temporary host did not return a file ID."
      );
    }

    return {
      success: true,
      fileId: file.id,
      url: file.url || `https://tempfile.org/${file.id}/`,
      previewUrl: `https://tempfile.org/${file.id}/preview`,
      downloadUrl: `https://tempfile.org/${file.id}/download`,
      expiryTime: file.expiryTime || null,
      fileName: file.name || `qr-${safeOrderId}.png`,
      sizeBytes: buffer.length,
      sizeKB: Number((buffer.length / 1024).toFixed(2)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return res.status(405).json({
      success: false,
      message:
        "Only GET and POST requests are allowed.",
    });
  }

  try {
    const params = getParams(req);

    const upi = String(
      params.upi ||
      params.vpa ||
      ""
    ).trim();

    const amount = String(
      params.amount ||
      ""
    ).trim();

    const name = String(
      params.name ||
      "KeysPanel"
    ).trim();

    const size = Math.max(
      200,
      Math.min(
        1000,
        Number(params.size) || 400
      )
    );

    const margin = Math.max(
      0,
      Number(params.margin) || 9
    );

    const foreground = String(
      params.foreground ||
      "#000000"
    );

    const background = String(
      params.background ||
      "#FFFFFF"
    );

    const errorCorrection = String(
      params.errorCorrection ||
      "H"
    );

    const style = String(
      params.style ||
      "rounded"
    );

    const finderStyle = String(
      params.finderStyle ||
      "rounded"
    );

    const finderColor =
      params.finderColor
        ? String(params.finderColor)
        : undefined;

    if (!upi) {
      return res.status(400).json({
        success: false,
        message:
          "Parameter 'upi' is required.",
      });
    }

    if (!amount) {
      return res.status(400).json({
        success: false,
        message:
          "Parameter 'amount' is required.",
      });
    }

    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Parameter 'amount' must be a valid positive number.",
      });
    }

    const orderId = String(
      params.orderId ||
      params.orderid ||
      generateOrderId()
    ).trim();

    const upiLink =
      "upi://pay" +
      `?pa=${phpUrlEncode(upi)}` +
      `&pn=${phpUrlEncode(name)}` +
      `&am=${phpUrlEncode(
        numericAmount.toFixed(2)
      )}` +
      "&cu=INR" +
      `&tr=${phpUrlEncode(orderId)}` +
      `&tn=${phpUrlEncode(orderId)}`;

    const qr = generateQR(upiLink, {
      renderer: "canvas",
      size,
      margin,
      foreground,
      background,
      errorCorrection,
      style,
      finderStyle,
      ...(finderColor
        ? { finderColor }
        : {}),
    });

    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    await qr.drawCanvas(canvas);

    const logoBuffer = getLogo();

    if (logoBuffer) {
      try {
        const logoImage = await loadImage(logoBuffer);

        const logoSize = Math.floor(size * 0.20);
        const center = size / 2;
        const logoRadius = logoSize / 2;
        const logoPosition = center - logoRadius;

        ctx.save();

        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.arc(
          center,
          center,
          logoRadius + 6,
          0,
          Math.PI * 2
        );

        ctx.fillStyle = "#FFFFFF";
        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(
          center,
          center,
          logoRadius,
          0,
          Math.PI * 2
        );

        ctx.clip();

        ctx.drawImage(
          logoImage,
          logoPosition,
          logoPosition,
          logoSize,
          logoSize
        );

        ctx.restore();

        ctx.beginPath();
        ctx.arc(
          center,
          center,
          logoRadius,
          0,
          Math.PI * 2
        );

        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.stroke();
      } catch (logoError) {
        console.error(
          "Logo processing error:",
          logoError.message
        );
      }
    }

    const buffer = canvas.toBuffer("image/png", {
      compressionLevel: 9,
      filters: canvas.PNG_FILTER_NONE,
    });

    const fileSize = buffer.length;
    const fileSizeKB = Number(
      (fileSize / 1024).toFixed(2)
    );

    console.log(
      `QR image size: ${fileSize} bytes (${fileSizeKB} KB)`
    );

    const format = String(
      params.format || ""
    ).toLowerCase();

    if (format === "hosted") {
      try {
        const hosted = await uploadQrToTempFile(
          buffer,
          orderId
        );

        return res.status(200).json({
          ...hosted,
          orderId,
          amount: numericAmount.toFixed(2),
          mimeType: "image/png",
          upiLink,
        });
      } catch (uploadError) {
        console.error(
          "QR temporary hosting error:",
          uploadError.message
        );

        return res.status(502).json({
          success: false,
          error: "QR_TEMP_HOSTING_FAILED",
          message:
            "QR was generated, but temporary image hosting failed.",
        });
      }
    }

    if (format === "json") {
      const base64 = buffer.toString("base64");

      return res.status(200).json({
        success: true,
        orderId,
        amount: numericAmount.toFixed(2),
        name,
        upi,
        upiLink,
        format: "png",
        mimeType: "image/png",
        fileSizeBytes: fileSize,
        fileSizeKB,
        base64,
        dataUrl: `data:image/png;base64,${base64}`,
        options: {
          size,
          margin,
          foreground,
          background,
          errorCorrection,
          style,
          finderStyle,
          hasLogo: Boolean(logoBuffer),
          logoSize: 0.20,
          compressionLevel: 9,
        },
      });
    }

    res.setHeader(
      "Content-Type",
      "image/png"
    );

    res.setHeader(
      "Content-Length",
      String(buffer.length)
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error(
      "QR generation error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Internal Server Error",
    });
  }
}

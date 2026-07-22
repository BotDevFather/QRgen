// api/index.js

const START_TIME = Date.now();

const VERSION = "1.0.0";

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;

  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;

  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export default async function handler(req, res) {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  res.status(200).json({
    success: true,
    name: "QR Generator API",
    version: VERSION,
    status: "online",
    runtime: process.version,
    platform: process.platform,
    uptime: formatUptime(uptime),
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/api",
      generateQR: "/api/generate-qr"
    }
  });
}

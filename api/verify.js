export const config = {
  runtime: "nodejs",
  maxDuration: 10
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get parameters from query (GET) or body (POST)
    let params = req.method === 'GET' ? req.query : req.body;
    
    const {
      token,
      merchantId = "73261518",
      sDate,
      eDate,
      pageSize = 10,
      pageCount = 0,
      module = "PAYMENT_QR"
    } = params;

    // Validate required parameters
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "token is required"
      });
    }

    // Set default dates if not provided
    let startDate = sDate;
    let endDate = eDate;
    
    if (!startDate || !endDate) {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 1);
      
      if (!startDate) {
        startDate = start.toISOString().split('T')[0];
      }
      if (!endDate) {
        endDate = end.toISOString().split('T')[0];
      }
    }

    // Build the URL
    const baseUrl = "https://payments-tesseract.bharatpe.in/api/v1/merchant/transactions";
    const url = new URL(baseUrl);
    url.searchParams.append('module', module);
    url.searchParams.append('merchantId', merchantId);
    url.searchParams.append('sDate', startDate);
    url.searchParams.append('eDate', endDate);
    url.searchParams.append('pageSize', String(pageSize));
    url.searchParams.append('pageCount', String(pageCount));
    url.searchParams.append('isFromOtDashboard', '1');

    // Make the API call
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'token': token
      }
    });

    const data = await response.json();

    // Return the response
    return res.status(response.status).json({
      success: response.ok,
      status: response.status,
      data: data
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error"
    });
  }
}

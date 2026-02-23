// netlify/functions/stock.js
// 서버에서 Yahoo Finance 호출 → CORS/보안 문제 해결

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // 쿼리에서 symbols 파라미터 받기
  // 예: /api/stock?symbols=005930.KS,NVDA,TSMC
  const symbols = event.queryStringParameters?.symbols || '';
  if (!symbols) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'symbols 파라미터 필요' }) };
  }

  const tickerList = symbols.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const results = await Promise.allSettled(
      tickerList.map(symbol => fetchQuote(symbol))
    );

    const data = {};
    results.forEach((result, i) => {
      const symbol = tickerList[i];
      if (result.status === 'fulfilled' && result.value) {
        data[symbol] = result.value;
      } else {
        data[symbol] = { error: true, symbol };
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) throw new Error(`Yahoo Finance 오류: ${res.status}`);

  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('데이터 없음');

  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose;
  const change = price - prevClose;
  const changePct = (change / prevClose) * 100;
  const currency = meta.currency;
  const name = meta.shortName || symbol;

  return {
    symbol,
    name,
    price,
    change: +change.toFixed(2),
    changePct: +changePct.toFixed(2),
    currency,
    positive: change >= 0,
  };
}

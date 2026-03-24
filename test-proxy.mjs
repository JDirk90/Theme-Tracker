import { CATEGORIES } from './src/data/sectors.js';

const allTickers = new Set();
for (const cat of CATEGORIES) {
  for (const sector of cat.sectors) {
    for (const t of sector.tickers) {
      allTickers.add(t.toUpperCase());
    }
  }
}
const symbols = [...allTickers];

console.log(`Sending POST to Vite proxy (localhost:5173)...`);
try {
  const res = await fetch('http://localhost:5173/api/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols })
  });
  
  const text = await res.text();
  console.log(`Vite Proxy HTTP Status: ${res.status}`);
  if (!res.ok) {
    console.error('Response Error:', text);
  } else {
    const data = JSON.parse(text);
    console.log(`Success! Proxy returned ${data.results?.length} results.`);
  }
} catch (err) {
  console.error("Fetch via proxy failed:", err);
}

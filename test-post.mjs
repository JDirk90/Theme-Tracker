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
console.log(`Fetching ${symbols.length} symbols via POST...`);

try {
  const res = await fetch('http://localhost:3001/api/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols })
  });
  
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  if (!res.ok) {
    console.error('Response Error:', text);
  } else {
    const data = JSON.parse(text);
    console.log(`Success! Received ${data.results?.length} results.`);
  }
} catch (err) {
  console.error("Fetch failed:", err);
}

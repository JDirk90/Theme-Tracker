import yahooFinance from 'yahoo-finance2';
const yf = new yahooFinance();
console.log('Type:', typeof yf);
console.log('Keys:', Object.keys(yf));
console.log('quote type:', typeof yf.quote);

// Try to call it
try {
  const result = await yf.quote('AAPL');
  console.log('Single result symbol:', result.symbol);
  console.log('Price:', result.regularMarketPrice);
} catch(e) {
  console.log('Error with single:', e.message);
}

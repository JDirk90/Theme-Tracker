// ── US Market Sector & Theme Masterlist ──────────────────────────────────────
// Organized by sector. Each theme has a name and ticker list.

export const CATEGORIES = [
  {
    sector: 'Semiconductors & Hardware',
    icon: '💻',
    color: '#8b5cf6', // Violet
    themes: [
      { name: 'AI Hardware Infrastructure', tickers: ['CLS', 'VRT', 'ANET', 'SMCI', 'DELL'] },
      { name: 'AI Processors & Foundries', tickers: ['NVDA', 'AMD', 'TSM', 'ARM', 'AVGO'] },
      { name: 'Magnificent Tech Giants', tickers: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL'] },
      { name: 'Memory & Storage', tickers: ['MU', 'SNDK', 'STX', 'PSTG', 'WDC'] },
      { name: 'Optical Networking', tickers: ['AAOI', 'LITE', 'COHR', 'FN', 'NTNX'] },
    ],
  },
  {
    sector: 'Software & SaaS',
    icon: '☁️',
    color: '#3b82f6', // Blue
    themes: [
      { name: 'Cybersecurity', tickers: ['CRWD', 'PANW', 'FTNT', 'NET', 'ZS'] },
      { name: 'Data Infrastructure & AI Platforms', tickers: ['PLTR', 'SNOW', 'DDOG', 'MDB', 'CRWD'] },
      { name: 'Legacy Workflow & CRM Targets', tickers: ['CRM', 'HUBS', 'MNDY', 'TEAM', 'WDAY'] },
      { name: 'Creative & Web Generation', tickers: ['ADBE', 'FIG', 'WIX', 'SQSP', 'ADSK'] },
      { name: 'EdTech & Freelance', tickers: ['DUOL', 'COUR', 'FVRR', 'UPWK', 'UDMY'] },
      { name: 'SMB & Commerce Platforms', tickers: ['SHOP', 'BIGC', 'BILL', 'INTU', 'PAYC'] },
    ],
  },
  {
    sector: 'Communication Services',
    icon: '📡',
    color: '#e879f9', // Fuchsia
    themes: [
      { name: 'Chinese Tech & E-Commerce', tickers: ['BABA', 'JD', 'PDD', 'BIDU', 'NTES'] },
      { name: 'Social Media & Matchmaking', tickers: ['META', 'SNAP', 'PINS', 'RDDT', 'MTCH'] },
    ],
  },
  {
    sector: 'Financials',
    icon: '🏦',
    color: '#06b6d4', // Cyan
    themes: [
      { name: 'Alternative Assets & Private Credit', tickers: ['BX', 'APO', 'KKR', 'ARES', 'CG'] },
      { name: 'InsurTech & Modern Insurance', tickers: ['LMND', 'PGR', 'ROOT', 'TRV', 'ALL'] },
      { name: 'Large Banks', tickers: ['JPM', 'BAC', 'WFC', 'C', 'GS'] },
      { name: 'Regional Banks', tickers: ['PNC', 'USB', 'TFC', 'FITB', 'MTB'] },
    ],
  },
  {
    sector: 'Fintech & Crypto',
    icon: '💳',
    color: '#0ea5e9', // Light Blue
    themes: [
      { name: 'Cryptocurrency Miners', tickers: ['RIOT', 'CLSK', 'MARA', 'HUT', 'BITF'] },
      { name: 'Credit & Payment Networks', tickers: ['V', 'MA', 'AXP', 'COF', 'SYF'] },
      { name: 'Crypto Exchanges & Treasury', tickers: ['COIN', 'MSTR', 'CRCL', 'GLXY', 'BLSH'] },
      { name: 'Digital Payments & POS', tickers: ['PYPL', 'TOST', 'AFRM', 'FOUR', 'ADYEY'] },
      { name: 'Next-Gen Digital Banking', tickers: ['HOOD', 'SOFI', 'NU', 'MELI', 'ALLY'] },
    ],
  },
  {
    sector: 'Consumer Discretionary',
    icon: '🛍️',
    color: '#f43f5e', // Rose
    themes: [
      { name: 'Airlines & Travel', tickers: ['DAL', 'UAL', 'AAL', 'LUV', 'ALK'] },
      { name: 'Autonomous Driving', tickers: ['TSLA', 'UBER', 'LYFT', 'MBLY', 'AUR'] },
      { name: 'Consumer Retail', tickers: ['AMZN', 'WMT', 'COST', 'TGT', 'HD'] },
      { name: 'Growth Fast Food', tickers: ['CMG', 'CAVA', 'SG', 'SHAK', 'WING'] },
      { name: 'Legacy Fast Food', tickers: ['MCD', 'SBUX', 'YUM', 'QSR', 'DRI'] },
    ],
  },
  {
    sector: 'Consumer Staples',
    icon: '🧼',
    color: '#fb7185', // Light Rose
    themes: [
      { name: 'Consumer Staples Giants', tickers: ['PG', 'KO', 'PEP', 'CL', 'MDLZ'] },
    ],
  },
  {
    sector: 'Industrials & Manufacturing',
    icon: '⚙️',
    color: '#eab308', // Yellow
    themes: [
      { name: 'Grid Modernization', tickers: ['GEV', 'ETN', 'PWR', 'HUBB', 'EMR'] },
      { name: 'Heavyweight Robotics & Automation', tickers: ['TER', 'SYM', 'ROK', 'CGNX', 'PTC'] },
      { name: 'Industrial Powerhouses', tickers: ['CAT', 'UNP', 'GE', 'HON', 'DE'] },
      { name: 'Infrastructure & Builders', tickers: ['URI', 'VMC', 'MLM', 'BLDR', 'JCI'] },
      { name: 'Micro Robotics', tickers: ['SERV', 'RR', 'OUST', 'KSCP', 'CYN'] },
    ],
  },
  {
    sector: 'Aerospace & Defense',
    icon: '🛡️',
    color: '#d97706', // Dark Yellow/Amber
    themes: [
      { name: 'Aerospace & Defense Giants', tickers: ['RTX', 'LMT', 'GD', 'NOC', 'BA'] },
      { name: 'Space Economy', tickers: ['RKLB', 'ASTS', 'LUNR', 'PL', 'SPIR'] },
      { name: 'Autonomous Defense & Drones', tickers: ['AVAV', 'KTOS', 'ONDS', 'RCAT', 'KRKNF'] },
    ],
  },
  {
    sector: 'Energy & Utilities',
    icon: '⚡',
    color: '#22c55e', // Green
    themes: [
      { name: 'Clean Energy & Solar', tickers: ['FSLR', 'ENPH', 'SEDG', 'RUN', 'CSIQ'] },
      { name: 'Oil & Gas', tickers: ['XOM', 'CVX', 'COP', 'OXY', 'EOG'] },
      { name: 'Uranium & Nuclear Energy', tickers: ['CCJ', 'SMR', 'OKLO', 'UEC', 'NXE'] },
      { name: 'Utility Giants', tickers: ['NEE', 'DUK', 'SO', 'EXC', 'AEP'] },
    ],
  },
  {
    sector: 'Basic Materials',
    icon: '⛏️',
    color: '#10b981', // Emerald
    themes: [
      { name: 'Agriculture & Food Security', tickers: ['NTR', 'MOS', 'CF', 'CTVA', 'FMC'] },
      { name: 'Base & Electrification Metals', tickers: ['FCX', 'SCCO', 'TECK', 'AA', 'VALE'] },
      { name: 'Gold & Silver Miners', tickers: ['NEM', 'GOLD', 'AEM', 'WPM', 'FNV'] },
      { name: 'Rare Earth & Critical Minerals', tickers: ['MP', 'USAR', 'LYSDY', 'UUUU', 'AMRRY'] },
      { name: 'Specialty & Platinum Group Metals', tickers: ['SBSW', 'PLG', 'ALB', 'SQM', 'TMC'] },
      { name: 'Water Scarcity & Infrastructure', tickers: ['AWK', 'XYL', 'PNR', 'ECL', 'WTTR'] },
    ],
  },
  {
    sector: 'Healthcare & Pharma',
    icon: '⚕️',
    color: '#ec4899', // Pink
    themes: [
      { name: 'GLP-1 Weight Loss', tickers: ['LLY', 'NVO', 'VKTX', 'AMGN', 'ALT'] },
      { name: 'Healthcare Giants', tickers: ['LLY', 'UNH', 'JNJ', 'MRK', 'ABBV'] },
    ],
  },
  {
    sector: 'Biotech & Genomics',
    icon: '🧬',
    color: '#be185d', // Dark Pink/Magenta
    themes: [
      { name: 'Biotech Innovators', tickers: ['VRTX', 'REGN', 'CRSP', 'ARGX', 'SRPT'] },
      { name: 'Gene Therapy', tickers: ['QURE', 'NTLA', 'BEAM', 'EDIT', 'SGMO'] },
      { name: 'Cannabis', tickers: ['TLRY', 'CGC', 'CRON', 'SNDL', 'VFF'] },
      { name: 'Psychedelics & Neuro-Medicine', tickers: ['DFTX', 'CMPS', 'ATAI', 'HELP', 'GHRS'] },
      { name: 'RNA & Next-Gen Vaccines', tickers: ['ARCT', 'BNTX', 'MRNA', 'NVAX', 'ALNY'] },
    ],
  },
  {
    sector: 'Real Estate',
    icon: '🏢',
    color: '#f59e0b', // Amber
    themes: [
      { name: 'AI Cloud & HPC Hosting', tickers: ['NBIS', 'WULF', 'IREN', 'APLD', 'CORZ'] },
      { name: 'Data Center & Grid Construction', tickers: ['IESC', 'PRIM', 'FIX', 'EME', 'PWR'] },
      { name: 'Homebuilders', tickers: ['LEN', 'DHI', 'TOL', 'PHM', 'NVR'] },
      { name: 'Real Estate (Digital & Tech)', tickers: ['EQIX', 'DLR', 'AMT', 'PLD', 'WELL'] },
      { name: 'Real Estate (Retail & Residential)', tickers: ['O', 'SPG', 'AVB', 'PSA', 'VICI'] },
    ],
  },
];

// Helper: get all unique tickers across all themes
export function getAllTickers() {
  const set = new Set();
  for (const cat of CATEGORIES) {
    for (const theme of cat.themes) {
      for (const t of theme.tickers) {
        set.add(t);
      }
    }
  }
  return [...set];
}

// Helper: flatten to array of { ...theme, category, categoryIcon, categoryColor }
export function getAllThemes() {
  const result = [];
  for (const cat of CATEGORIES) {
    for (const theme of cat.themes) {
      result.push({
        ...theme,
        category: cat.sector,
        categoryIcon: cat.icon,
        categoryColor: cat.color,
      });
    }
  }
  return result;
}

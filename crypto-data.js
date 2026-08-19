// Shared crypto dataset for the marketplace and buy/checkout pages.
// Prices are in USD. Every purchase is settled in cryptocurrency via the payment modal.
// `icon` is the local assets/coins/<key>.png file (null = letter avatar).
// `payCoin` preselects the coin in the payment modal (only btc/eth/usdt/sol are accepted deposits).
window.COINS = {
  btc: {
    symbol: 'BTC-USD', name: 'Bitcoin', category: 'Currency', network: 'Bitcoin',
    price: 95000, change: 1.06, changeLabel: '+$1,000.00 (+1.06%)',
    volume: 25000000000, mcap: 1810000000000, volumeLabel: '$25.00B', mcapLabel: '$1.81T',
    icon: 'btc', payCoin: 'btc'
  },
  eth: {
    symbol: 'ETH-USD', name: 'Ethereum', category: 'Smart Contract Platform', network: 'Ethereum',
    price: 3500, change: 1.45, changeLabel: '+$50.00 (+1.45%)',
    volume: 15000000000, mcap: 420000000000, volumeLabel: '$15.00B', mcapLabel: '$420.00B',
    icon: 'eth', payCoin: 'eth'
  },
  bnb: {
    symbol: 'BNB-USD', name: 'Binance Coin', category: 'Exchange Token', network: 'BNB Chain',
    price: 650, change: 1.56, changeLabel: '+$10.00 (+1.56%)',
    volume: 2000000000, mcap: 95000000000, volumeLabel: '$2.00B', mcapLabel: '$95.00B',
    icon: 'bnb', payCoin: null
  },
  ada: {
    symbol: 'ADA-USD', name: 'Cardano', category: 'Smart Contract Platform', network: 'Cardano',
    price: 0.55, change: 1.85, changeLabel: '+$0.01 (+1.85%)',
    volume: 400000000, mcap: 19500000000, volumeLabel: '$400.00M', mcapLabel: '$19.50B',
    icon: null, payCoin: null
  },
  algo: {
    symbol: 'ALGO-USD', name: 'Algorand', category: 'Layer 2', network: 'Algorand',
    price: 0.25, change: 4.17, changeLabel: '+$0.01 (+4.17%)',
    volume: 50000000, mcap: 2000000000, volumeLabel: '$50.00M', mcapLabel: '$2.00B',
    icon: 'algo', payCoin: null
  },
  atom: {
    symbol: 'ATOM-USD', name: 'Cosmos', category: 'Interoperability', network: 'Cosmos',
    price: 10.5, change: 1.94, changeLabel: '+$0.20 (+1.94%)',
    volume: 100000000, mcap: 4000000000, volumeLabel: '$100.00M', mcapLabel: '$4.00B',
    icon: null, payCoin: null
  },
  avax: {
    symbol: 'AVAX-USD', name: 'Avalanche', category: 'Smart Contract Platform', network: 'Avalanche',
    price: 38, change: 2.7, changeLabel: '+$1.00 (+2.70%)',
    volume: 300000000, mcap: 15000000000, volumeLabel: '$300.00M', mcapLabel: '$15.00B',
    icon: 'avax', payCoin: null
  },
  doge: {
    symbol: 'DOGE-USD', name: 'Dogecoin', category: 'Meme', network: 'Dogecoin',
    price: 0.18, change: 2.15, changeLabel: '+$0.004 (+2.15%)',
    volume: 800000000, mcap: 26000000000, volumeLabel: '$800.00M', mcapLabel: '$26.00B',
    icon: 'doge', payCoin: null
  },
  dot: {
    symbol: 'DOT-USD', name: 'Polkadot', category: 'Interoperability', network: 'Polkadot',
    price: 7.25, change: 1.75, changeLabel: '+$0.13 (+1.75%)',
    volume: 150000000, mcap: 10500000000, volumeLabel: '$150.00M', mcapLabel: '$10.50B',
    icon: null, payCoin: null
  },
  link: {
    symbol: 'LINK-USD', name: 'Chainlink', category: 'Oracle', network: 'Ethereum',
    price: 18.4, change: 2.35, changeLabel: '+$0.43 (+2.35%)',
    volume: 250000000, mcap: 11000000000, volumeLabel: '$250.00M', mcapLabel: '$11.00B',
    icon: null, payCoin: null
  },
  ltc: {
    symbol: 'LTC-USD', name: 'Litecoin', category: 'Payment', network: 'Litecoin',
    price: 78.5, change: 1.4, changeLabel: '+$1.10 (+1.40%)',
    volume: 400000000, mcap: 5800000000, volumeLabel: '$400.00M', mcapLabel: '$5.80B',
    icon: null, payCoin: null
  },
  matic: {
    symbol: 'MATIC-USD', name: 'Polygon', category: 'Layer 2', network: 'Polygon',
    price: 0.62, change: 1.9, changeLabel: '+$0.01 (+1.90%)',
    volume: 120000000, mcap: 6100000000, volumeLabel: '$120.00M', mcapLabel: '$6.10B',
    icon: null, payCoin: null
  },
  sol: {
    symbol: 'SOL-USD', name: 'Solana', category: 'Smart Contract Platform', network: 'Solana',
    price: 155, change: 2.86, changeLabel: '+$4.43 (+2.86%)',
    volume: 3000000000, mcap: 70000000000, volumeLabel: '$3.00B', mcapLabel: '$70.00B',
    icon: 'sol', payCoin: 'sol'
  },
  usdt: {
    symbol: 'USDT-USD', name: 'Tether', category: 'Payment', network: 'Ethereum',
    price: 1, change: 0.01, changeLabel: '+$0.00 (+0.01%)',
    volume: 60000000000, mcap: 112000000000, volumeLabel: '$60.00B', mcapLabel: '$112.00B',
    icon: 'usdt', payCoin: 'usdt'
  },
  xrp: {
    symbol: 'XRP-USD', name: 'Ripple', category: 'Payment', network: 'XRP Ledger',
    price: 0.65, change: 3.17, changeLabel: '+$0.02 (+3.17%)',
    volume: 1500000000, mcap: 36500000000, volumeLabel: '$1.50B', mcapLabel: '$36.50B',
    icon: 'xrp', payCoin: null
  }
};

// Helper: resolve a coin by base symbol (e.g. "ada") with a safe fallback.
window.findCoin = function (key) {
  return COINS[key] || COINS.btc;
};

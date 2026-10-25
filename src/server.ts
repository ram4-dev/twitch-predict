// Offchain is the default POC. The earlier chain prototype remains opt-in.
if (process.env.MARKET_MODE === 'solana') await import('./solana-server.js');
else await import('./offchain-server.js');

# Vault Risk Copilot - Frontend

React + TypeScript + Vite frontend for Vault Risk Copilot.

## Status

**Phase 4-5 Implementation**: 🚧 In Progress

This is a placeholder UI showing project status. Full implementation includes:

### Planned Features

- [ ] Pools table with risk scores, sort & filter
- [ ] Pool detail page with risk factor breakdown charts  
- [ ] Vault page: wallet connection, balance/shares display, deposit/withdraw flows
- [ ] Transaction states and comprehensive error handling
- [ ] Responsive design with accessibility basics
- [ ] Integration with wagmi + viem for Web3 interactions

### Tech Stack

- React 19
- TypeScript
- Vite 8
- wagmi + viem (wallet connection, contract interactions)
- @tanstack/react-query (data fetching)
- Recharts (data visualization)

## Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Environment Variables

Create `.env.local`:

```
VITE_API_URL=http://localhost:3000
VITE_CHAIN_ID=11155111
VITE_VAULT_ADDRESS=0x...
VITE_USDC_ADDRESS=0x...
```

## Docker

```bash
docker build -t vault-risk-web .
docker run -p 5173:5173 vault-risk-web
```

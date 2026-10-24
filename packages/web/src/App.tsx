import './App.css'

function App() {
  return (
    <div className="App">
      <header>
        <h1>🏦 Vault Risk Copilot</h1>
        <p>DeFi Risk Analytics Dashboard</p>
      </header>

      <main>
        <section className="status">
          <h2>Phase 4-5 Status</h2>
          <p>✅ <strong>Phase 0-3</strong>: Smart contracts, DB, collector, risk-service - Complete</p>
          <p>🚧 <strong>Phase 4</strong>: Node.js API - Core implementation complete, minor type fixes pending</p>
          <p>🚧 <strong>Phase 5</strong>: React UI - Structure scaffolded, wagmi integration pending</p>
        </section>

        <section className="features">
          <h2>Planned Features</h2>
          <ul>
            <li>📊 Pools table with risk scores, sort & filter</li>
            <li>📈 Pool detail page with risk factor breakdown charts</li>
            <li>🏦 Vault page: connect wallet, view balance/shares, deposit/withdraw</li>
            <li>⚡ Transaction states and error handling</li>
            <li>📱 Responsive UI with accessibility basics</li>
          </ul>
        </section>

        <section className="api">
          <h2>API Endpoints</h2>
          <p>Backend API: <code>http://localhost:3000</code></p>
          <ul>
            <li><code>GET /api/health</code> - Health check</li>
            <li><code>GET /api/pools</code> - List pools with filters</li>
            <li><code>GET /api/pools/:id</code> - Pool details</li>
            <li><code>GET /api/vault/state</code> - On-chain vault state</li>
          </ul>
          <p><a href="http://localhost:3000/docs" target="_blank">📚 OpenAPI Documentation</a></p>
        </section>
      </main>

      <footer>
        <p>⚠️ Testnet only - Not financial advice - Educational project</p>
      </footer>
    </div>
  )
}

export default App

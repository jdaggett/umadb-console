import { useState } from "react";
import { HealthCheckResponse_ServingStatus } from "../gen/grpc/health/v1/health_pb";
import { useConnection } from "../lib/connection";
import { formatPosition } from "../lib/format";

export function Connection() {
  const { settings, setSettings, status, refresh, effectiveUrl } = useConnection();
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [showKey, setShowKey] = useState(false);
  const dirty = baseUrl !== settings.baseUrl || apiKey !== settings.apiKey;

  return (
    <div className="page connection">
      <div className="page-main narrow-page">
        <header className="page-head">
          <div>
            <h1>Connection</h1>
            <p className="lede">
              The console talks gRPC-Web to its own server, which forwards each call to UmaDB over native gRPC.
            </p>
          </div>
        </header>

        <section className="panel">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSettings({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
            }}
          >
            <label className="field">
              <span className="field-label">Server URL</span>
              <input
                className="mono"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={`${window.location.origin} (this origin)`}
                spellCheck={false}
              />
              <span className="hint">
                The gRPC-Web endpoint. Leave blank to use this page’s own proxy, which forwards to{" "}
                <code>UMADB_URL</code>. Only change it to use another gRPC-Web proxy in front of UmaDB.
              </span>
            </label>
            <label className="field">
              <span className="field-label">API key <em>optional</em></span>
              <div className="input-row">
                <input
                  className="mono"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Sent as “authorization: Bearer …”"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="button" className="btn ghost small" onClick={() => setShowKey(!showKey)}>
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <span className="hint">Stored in this browser only.</span>
            </label>
            <div className="toolbar end">
              <button type="button" className="btn ghost" onClick={() => void refresh()}>
                Test connection
              </button>
              <button type="submit" className="btn primary" disabled={!dirty}>
                Save
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="section-bar">
            <h3>Status</h3>
          </div>
          <dl className="props">
            <dt>Endpoint</dt>
            <dd className="mono">{effectiveUrl}</dd>
            <dt>State</dt>
            <dd className={`status-${status.state}`}>
              {status.state === "online" ? "Online" : status.state === "offline" ? "Offline" : "Checking…"}
            </dd>
            {status.state === "online" && (
              <>
                <dt>Health</dt>
                <dd>{HealthCheckResponse_ServingStatus[status.health]}</dd>
                <dt>Head</dt>
                <dd className="mono">{formatPosition(status.head)}</dd>
              </>
            )}
            {status.state === "offline" && (
              <>
                <dt>Error</dt>
                <dd className="error-text">{status.error}</dd>
              </>
            )}
            {status.state !== "checking" && (
              <>
                <dt>Checked</dt>
                <dd>{status.checkedAt.toLocaleTimeString()}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="panel">
          <div className="section-bar">
            <h3>Choosing the UmaDB server</h3>
          </div>
          <p className="hint">
            Browsers can’t speak native gRPC, so the console’s server translates. Set the UmaDB address when you
            start it:
          </p>
          <pre className="code">UMADB_URL=http://127.0.0.1:50051 npm run dev</pre>
          <p className="hint">
            Use an <code>https://</code> URL for a TLS server, adding <code>UMADB_CA_CERT=server.pem</code> to trust a
            self-signed certificate. <code>UMADB_API_KEY</code> sets a default key for browsers that haven’t entered
            one here.
          </p>
        </section>
      </div>
    </div>
  );
}

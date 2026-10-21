import { useEffect, useState } from "react";
import { useConnection } from "./lib/connection";
import { formatPosition } from "./lib/format";
import { Append } from "./pages/Append";
import { Connection } from "./pages/Connection";
import { Explorer } from "./pages/Explorer";
import { Live } from "./pages/Live";
import { Overview } from "./pages/Overview";
import { Tracking } from "./pages/Tracking";

export type Route = "overview" | "explorer" | "live" | "append" | "tracking" | "connection";

const NAV: { route: Route; label: string; icon: string }[] = [
  { route: "overview", label: "Overview", icon: "◎" },
  { route: "explorer", label: "Event Store", icon: "☰" },
  { route: "live", label: "Live", icon: "◉" },
  { route: "append", label: "Append", icon: "+" },
  { route: "tracking", label: "Tracking", icon: "⌖" },
  { route: "connection", label: "Connection", icon: "⇄" },
];

function routeFromHash(): Route {
  const r = window.location.hash.replace(/^#\/?/, "");
  return NAV.some((n) => n.route === r) ? (r as Route) : "overview";
}

export function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const { status, effectiveUrl } = useConnection();

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (r: Route) => {
    window.location.hash = `/${r}`;
  };

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <a className="brand" href="#/overview">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>
            UmaDB <span className="brand-sub">Console</span>
          </span>
        </a>
        <ul>
          {NAV.map((n) => (
            <li key={n.route}>
              <a href={`#/${n.route}`} aria-current={route === n.route ? "page" : undefined}>
                <span className="nav-icon" aria-hidden="true">
                  {n.icon}
                </span>
                <span className="nav-label">{n.label}</span>
              </a>
            </li>
          ))}
        </ul>
        <button className={`conn-pill status-${status.state}`} onClick={() => navigate("connection")} title={effectiveUrl}>
          <span className="dot" />
          <span className="conn-text">
            <span>{status.state === "online" ? "Connected" : status.state === "offline" ? "Disconnected" : "Connecting…"}</span>
            <span className="conn-sub mono">
              {status.state === "online" ? `head ${formatPosition(status.head)}` : effectiveUrl.replace(/^https?:\/\//, "")}
            </span>
          </span>
        </button>
      </nav>
      <main className="content">
        {route === "overview" && <Overview navigate={navigate} />}
        {route === "explorer" && <Explorer />}
        {route === "live" && <Live />}
        {route === "append" && <Append />}
        {route === "tracking" && <Tracking />}
        {route === "connection" && <Connection />}
      </main>
    </div>
  );
}

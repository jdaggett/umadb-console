import { useCallback, useEffect, useRef, useState } from "react";
import type { SequencedEvent } from "../gen/v1/umadb_pb";
import { HealthCheckResponse_ServingStatus } from "../gen/grpc/health/v1/health_pb";
import { EventTable } from "../components/EventTable";
import { errorMessage, useConnection } from "../lib/connection";
import { formatPosition } from "../lib/format";
import type { Route } from "../App";

const SAMPLE_SIZE = 500;

const FEATURES: { route: Route; title: string; rpc: string; body: string }[] = [
  {
    route: "explorer",
    title: "Event Store",
    rpc: "Read",
    body: "Page through the append-only log forwards or backwards, filter by type and tag, and inspect payloads.",
  },
  {
    route: "live",
    title: "Live Subscription",
    rpc: "Subscribe",
    body: "Catch up from any position, then watch new events stream in as soon as they are durable.",
  },
  {
    route: "append",
    title: "Append Events",
    rpc: "Append",
    body: "Write events atomically with optimistic concurrency via DCB append conditions and idempotent UUIDs.",
  },
  {
    route: "tracking",
    title: "Tracking",
    rpc: "GetTrackingInfo",
    body: "Check the last recorded position of upstream sources for exactly-once processing.",
  },
  {
    route: "connection",
    title: "Connection",
    rpc: "Head · Health",
    body: "Point the console at any UmaDB server, with API-key auth, and check its health.",
  },
];

type Count = { name: string; count: number };

function topCounts(values: string[], n = 8): Count[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function Overview({ navigate }: { navigate: (route: Route) => void }) {
  const { dcb, status, effectiveUrl } = useConnection();
  const [sample, setSample] = useState<SequencedEvent[]>([]);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const lastHead = useRef<{ head: bigint; at: number } | null>(null);

  const head = status.state === "online" ? status.head : undefined;

  // Approximate append throughput from successive head polls.
  useEffect(() => {
    if (status.state !== "online") return;
    const now = status.checkedAt.getTime();
    const h = status.head ?? 0n;
    const prev = lastHead.current;
    if (prev && now > prev.at) setRate(Number(h - prev.head) / ((now - prev.at) / 1000));
    lastHead.current = { head: h, at: now };
  }, [status]);

  const loadSample = useCallback(async () => {
    try {
      const events: SequencedEvent[] = [];
      for await (const res of dcb.read({ backwards: true, limit: SAMPLE_SIZE })) events.push(...res.events);
      setSample(events);
      setSampleError(null);
    } catch (err) {
      setSampleError(errorMessage(err));
    }
  }, [dcb]);

  // Reload the sample whenever the head moves.
  useEffect(() => {
    void loadSample();
  }, [loadSample, head]);

  const types = topCounts(sample.map((e) => e.event?.eventType ?? ""));
  const tags = topCounts(sample.flatMap((e) => e.event?.tags ?? []));

  return (
    <div className="page overview">
      <div className="page-main">
        <header className="page-head">
          <div>
            <h1>Overview</h1>
            <p className="lede">
              UmaDB is an event store built for Dynamic Consistency Boundaries. This console exposes every
              operation of its gRPC API.
            </p>
          </div>
        </header>

        <div className="stats">
          <div className="stat">
            <div className="stat-label">Server</div>
            <div className={`stat-value status-${status.state}`}>
              {status.state === "online" ? "Online" : status.state === "offline" ? "Offline" : "Checking…"}
            </div>
            <div className="stat-sub mono">{effectiveUrl}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Health</div>
            <div className="stat-value">
              {status.state === "online" ? HealthCheckResponse_ServingStatus[status.health].replace("_", " ") : "—"}
            </div>
            <div className="stat-sub">grpc.health.v1 · umadb.v1.DCB</div>
          </div>
          <div className="stat">
            <div className="stat-label">Head position</div>
            <div className="stat-value mono">{formatPosition(head)}</div>
            <div className="stat-sub">events recorded</div>
          </div>
          <div className="stat">
            <div className="stat-label">Append rate</div>
            <div className="stat-value mono">{rate === null ? "—" : rate < 10 ? rate.toFixed(1) : Math.round(rate).toLocaleString("en-US")}</div>
            <div className="stat-sub">events / sec, sampled every 5 s</div>
          </div>
        </div>

        {status.state === "offline" && (
          <div className="alert error">
            Can’t reach UmaDB: {status.error}.{" "}
            <button className="link" onClick={() => navigate("connection")}>
              Check connection settings
            </button>
          </div>
        )}

        <h2 className="section-title">Features</h2>
        <div className="features">
          {FEATURES.map((f) => (
            <button key={f.route} className="feature" onClick={() => navigate(f.route)}>
              <div className="feature-head">
                <span className="feature-title">{f.title}</span>
                <span className="rpc mono">{f.rpc}</span>
              </div>
              <p>{f.body}</p>
            </button>
          ))}
        </div>

        <h2 className="section-title">
          Recent activity <span className="muted">· last {Math.min(sample.length, SAMPLE_SIZE)} events</span>
        </h2>
        {sampleError && status.state === "online" && <div className="alert error">{sampleError}</div>}
        <div className="activity">
          <CountList title="Event types" counts={types} total={sample.length} kind="type" />
          <CountList title="Tags" counts={tags} total={sample.length} kind="tag" />
        </div>

        <div className="section-bar">
          <h2 className="section-title">Latest events</h2>
          <span className="spacer" />
          <button className="btn ghost small" onClick={() => navigate("explorer")}>
            Open Event Store →
          </button>
        </div>
        <EventTable events={sample.slice(0, 8)} onSelect={() => navigate("explorer")} empty="The store is empty." />
      </div>
    </div>
  );
}

function CountList({ title, counts, total, kind }: { title: string; counts: Count[]; total: number; kind: "type" | "tag" }) {
  const max = counts[0]?.count ?? 1;
  return (
    <section className="panel count-list">
      <h3>{title}</h3>
      {counts.length === 0 ? (
        <div className="muted small-text">Nothing yet.</div>
      ) : (
        <ul>
          {counts.map((c) => (
            <li key={c.name}>
              <span className={`count-name mono ${kind}`} title={c.name}>
                {c.name || <i>untyped</i>}
              </span>
              <span className="bar" aria-hidden="true">
                <span style={{ width: `${(c.count / max) * 100}%` }} />
              </span>
              <span className="count-num mono" title={`${((c.count / Math.max(total, 1)) * 100).toFixed(1)}%`}>
                {c.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

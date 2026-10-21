import { useEffect, useRef, useState } from "react";
import type { SequencedEvent } from "../gen/v1/umadb_pb";
import { EventDetail } from "../components/EventDetail";
import { EventTable } from "../components/EventTable";
import { QueryEditor } from "../components/QueryEditor";
import { errorMessage, isAbort, useConnection } from "../lib/connection";
import { describeQuery, emptyQueryItem, formatPosition, parsePosition, toQuery } from "../lib/format";
import type { QueryItemDraft } from "../lib/format";

type StartFrom = "now" | "beginning" | "after";

const BUFFER_LIMIT = 1000;
const FRESH_MS = 1500;

export function Live() {
  const { dcb } = useConnection();
  const [items, setItems] = useState<QueryItemDraft[]>([emptyQueryItem()]);
  const [startFrom, setStartFrom] = useState<StartFrom>("now");
  const [afterInput, setAfterInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<SequencedEvent[]>([]);
  const [received, setReceived] = useState(0);
  const [lastPosition, setLastPosition] = useState<bigint | undefined>();
  const [fresh, setFresh] = useState<Set<bigint>>(new Set());
  const [selected, setSelected] = useState<SequencedEvent | null>(null);
  const [activeQuery, setActiveQuery] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  };

  const start = async () => {
    let after: bigint | undefined;
    if (startFrom === "after") {
      const parsed = parsePosition(afterInput);
      if (parsed === null || parsed === undefined) {
        setError("Enter a valid position to subscribe after.");
        return;
      }
      after = parsed;
    }

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setError(null);
    setRunning(true);
    setActiveQuery(describeQuery(items));
    try {
      if (startFrom === "now") {
        after = (await dcb.head({}, { signal: abort.signal })).position ?? 0n;
      }
      const stream = dcb.subscribe({ query: toQuery(items), after }, { signal: abort.signal });
      for await (const res of stream) {
        if (res.events.length === 0) continue;
        const batch = [...res.events].reverse();
        const positions = new Set(res.events.map((e) => e.position));
        setEvents((prev) => [...batch, ...prev].slice(0, BUFFER_LIMIT));
        setReceived((n) => n + res.events.length);
        setLastPosition(res.events[res.events.length - 1].position);
        setFresh(positions);
        window.setTimeout(() => setFresh((cur) => (cur === positions ? new Set() : cur)), FRESH_MS);
      }
      // The server ended the stream (e.g. shutdown).
      if (abortRef.current === abort) setError("The server closed the subscription.");
    } catch (err) {
      if (!isAbort(err)) setError(errorMessage(err));
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null;
        setRunning(false);
      }
    }
  };

  const clear = () => {
    setEvents([]);
    setReceived(0);
    setSelected(null);
  };

  return (
    <div className={`page live ${selected ? "with-detail" : ""}`}>
      <div className="page-main">
        <header className="page-head">
          <div>
            <h1>Live Subscription</h1>
            <p className="lede">
              Subscribe to the store: catch up from any position, then receive new events the moment they are
              committed.
            </p>
          </div>
          <div className={`live-indicator ${running ? "on" : ""}`}>
            <span className="dot" />
            {running ? "Streaming" : "Stopped"}
          </div>
        </header>

        <section className="panel">
          <fieldset disabled={running} className="plain">
            <QueryEditor items={items} onChange={setItems} />
            <div className="toolbar">
              <div className="segmented" role="radiogroup" aria-label="Start from">
                {(
                  [
                    ["now", "From now"],
                    ["beginning", "From beginning"],
                    ["after", "After position"],
                  ] as [StartFrom, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={startFrom === value}
                    onClick={() => setStartFrom(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {startFrom === "after" && (
                <input
                  className="narrow"
                  value={afterInput}
                  onChange={(e) => setAfterInput(e.target.value)}
                  placeholder="Position"
                  inputMode="numeric"
                  aria-label="Subscribe after position"
                />
              )}
            </div>
          </fieldset>
          <div className="toolbar end">
            <button className="btn ghost" onClick={clear} disabled={events.length === 0}>
              Clear
            </button>
            {running ? (
              <button className="btn danger" onClick={stop}>
                Stop
              </button>
            ) : (
              <button className="btn primary" onClick={() => void start()}>
                Subscribe
              </button>
            )}
          </div>
        </section>

        <div className="results-bar">
          <div className="results-summary">
            {activeQuery ? (
              <>
                <span className="muted">Subscribed to</span> <strong>{activeQuery}</strong>
              </>
            ) : (
              <span className="muted">Not subscribed yet.</span>
            )}
          </div>
          <div className="results-summary">
            <strong>{received.toLocaleString("en-US")}</strong> <span className="muted">received</span>
            {lastPosition !== undefined && <span className="muted"> · last #{formatPosition(lastPosition)}</span>}
            {received > BUFFER_LIMIT && <span className="muted"> · showing latest {BUFFER_LIMIT}</span>}
          </div>
        </div>

        {error && <div className="alert error">{error}</div>}

        <EventTable
          events={events}
          fresh={fresh}
          selected={selected?.position}
          onSelect={setSelected}
          empty={running ? "Waiting for events…" : "Start a subscription to watch events arrive."}
        />
      </div>

      {selected && (
        <EventDetail key={selected.position.toString()} event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

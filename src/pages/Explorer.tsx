import { useCallback, useEffect, useRef, useState } from "react";
import type { SequencedEvent } from "../gen/v1/umadb_pb";
import { EventDetail } from "../components/EventDetail";
import { EventTable } from "../components/EventTable";
import { QueryEditor } from "../components/QueryEditor";
import { errorMessage, isAbort, useConnection } from "../lib/connection";
import { describeQuery, emptyQueryItem, formatPosition, parsePosition, splitList, toQuery } from "../lib/format";
import type { QueryItemDraft } from "../lib/format";

type Order = "newest" | "oldest";

const PAGE_SIZES = [25, 50, 100, 250, 500];

export function Explorer() {
  const { dcb } = useConnection();
  const [items, setItems] = useState<QueryItemDraft[]>([emptyQueryItem()]);
  const [appliedItems, setAppliedItems] = useState<QueryItemDraft[]>([emptyQueryItem()]);
  const [order, setOrder] = useState<Order>("newest");
  const [pageSize, setPageSize] = useState(50);
  const [jump, setJump] = useState("");

  // `cursors` is the stack of start positions for each page visited; the last is the current page.
  const [cursors, setCursors] = useState<(bigint | undefined)[]>([undefined]);
  const [events, setEvents] = useState<SequencedEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SequencedEvent | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cursor = cursors[cursors.length - 1];

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setLoading(true);
    setError(null);
    const started = performance.now();
    try {
      const received: SequencedEvent[] = [];
      // Ask for one extra event to learn whether another page exists.
      const stream = dcb.read(
        { query: toQuery(appliedItems), start: cursor, backwards: order === "newest", limit: pageSize + 1 },
        { signal: abort.signal },
      );
      for await (const res of stream) received.push(...res.events);
      setHasMore(received.length > pageSize);
      setEvents(received.slice(0, pageSize));
      setElapsedMs(performance.now() - started);
    } catch (err) {
      if (isAbort(err)) return;
      setError(errorMessage(err));
      setEvents([]);
      setHasMore(false);
    } finally {
      if (abortRef.current === abort) setLoading(false);
    }
  }, [dcb, appliedItems, cursor, order, pageSize]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const resetTo = (start: bigint | undefined) => {
    setCursors([start]);
    setSelected(null);
  };

  const apply = (next = items) => {
    setAppliedItems(next);
    resetTo(undefined);
  };

  const nextPage = () => {
    const last = events[events.length - 1];
    if (!last) return;
    setCursors([...cursors, order === "newest" ? last.position - 1n : last.position + 1n]);
  };

  const prevPage = () => setCursors(cursors.length > 1 ? cursors.slice(0, -1) : cursors);

  const addFilter = (field: "types" | "tags", value: string) => {
    if (!value) return;
    const [first, ...rest] = items;
    const existing = splitList(first[field]);
    if (existing.includes(value)) return;
    const next = [{ ...first, [field]: [...existing, value].join(", ") }, ...rest];
    setItems(next);
    apply(next);
  };

  const onJump = () => {
    const pos = parsePosition(jump);
    if (pos === null) {
      setError(`"${jump}" is not a valid position.`);
      return;
    }
    resetTo(pos);
  };

  const pageNumber = cursors.length;
  const first = events[0];
  const last = events[events.length - 1];

  return (
    <div className={`page explorer ${selected ? "with-detail" : ""}`}>
      <div className="page-main">
        <header className="page-head">
          <div>
            <h1>Event Store</h1>
            <p className="lede">Browse, filter and inspect every event recorded in UmaDB.</p>
          </div>
        </header>

        <section className="panel">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
          >
            <QueryEditor items={items} onChange={setItems} onSubmit={() => apply()} />
            <div className="toolbar">
              <div className="segmented" role="radiogroup" aria-label="Order">
                {(["newest", "oldest"] as Order[]).map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={order === o}
                    onClick={() => {
                      setOrder(o);
                      resetTo(undefined);
                    }}
                  >
                    {o === "newest" ? "Newest first" : "Oldest first"}
                  </button>
                ))}
              </div>
              <label className="inline-field">
                <span>Page size</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    resetTo(cursors[0]);
                  }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span className="spacer" />
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const cleared = [emptyQueryItem()];
                  setItems(cleared);
                  apply(cleared);
                }}
              >
                Clear
              </button>
              <button type="submit" className="btn primary">
                Run query
              </button>
            </div>
          </form>
        </section>

        <div className="results-bar">
          <div className="results-summary">
            <span className="muted">Showing</span> <strong>{describeQuery(appliedItems)}</strong>
            {first && last && (
              <span className="muted">
                {" "}
                · positions {formatPosition(first.position)}–{formatPosition(last.position)}
              </span>
            )}
            {elapsedMs !== null && !loading && <span className="muted"> · {elapsedMs.toFixed(0)} ms</span>}
          </div>
          <div className="pager">
            <form
              className="jump"
              onSubmit={(e) => {
                e.preventDefault();
                onJump();
              }}
            >
              <input
                value={jump}
                onChange={(e) => setJump(e.target.value)}
                placeholder="Jump to position"
                inputMode="numeric"
                aria-label="Jump to position"
              />
            </form>
            <button className="btn ghost small" onClick={() => resetTo(undefined)} disabled={pageNumber === 1 && cursor === undefined}>
              {order === "newest" ? "Latest" : "First"}
            </button>
            <button className="btn ghost small" onClick={prevPage} disabled={cursors.length <= 1}>
              ← Prev
            </button>
            <span className="page-num">Page {pageNumber}</span>
            <button className="btn ghost small" onClick={nextPage} disabled={!hasMore}>
              Next →
            </button>
            <button className="btn ghost small" onClick={() => void load()} title="Reload this page">
              ↻
            </button>
          </div>
        </div>

        {error && <div className="alert error">{error}</div>}

        <div className={`results ${loading ? "loading" : ""}`}>
          <EventTable
            events={events}
            selected={selected?.position}
            onSelect={setSelected}
            onTypeClick={(t) => addFilter("types", t)}
            onTagClick={(t) => addFilter("tags", t)}
            empty={loading ? "Loading…" : error ? "Query failed." : "No events match this query."}
          />
        </div>
      </div>

      {selected && (
        <EventDetail
          key={selected.position.toString()}
          event={selected}
          onClose={() => setSelected(null)}
          onTypeClick={(t) => addFilter("types", t)}
          onTagClick={(t) => addFilter("tags", t)}
        />
      )}
    </div>
  );
}

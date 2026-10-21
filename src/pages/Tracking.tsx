import { useCallback, useEffect, useState } from "react";
import { errorMessage, useConnection } from "../lib/connection";
import { formatPosition } from "../lib/format";

type Row = { source: string; position?: bigint; error?: string; loading: boolean };

const STORAGE_KEY = "umadb-ui.tracking-sources";

function loadSources(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function saveSources(sources: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  } catch {
    // Ignore: the watch list just won't persist.
  }
}

export function Tracking() {
  const { dcb } = useConnection();
  const [rows, setRows] = useState<Row[]>(() => loadSources().map((source) => ({ source, loading: true })));
  const [input, setInput] = useState("");

  const fetchOne = useCallback(
    async (source: string) => {
      setRows((rs) => rs.map((r) => (r.source === source ? { ...r, loading: true } : r)));
      try {
        const res = await dcb.getTrackingInfo({ source });
        setRows((rs) =>
          rs.map((r) => (r.source === source ? { source, position: res.position, loading: false } : r)),
        );
      } catch (err) {
        setRows((rs) => rs.map((r) => (r.source === source ? { source, error: errorMessage(err), loading: false } : r)));
      }
    },
    [dcb],
  );

  const refreshAll = useCallback(() => {
    for (const source of loadSources()) void fetchOne(source);
  }, [fetchOne]);

  useEffect(refreshAll, [refreshAll]);

  const add = () => {
    const source = input.trim();
    if (!source) return;
    setInput("");
    if (!rows.some((r) => r.source === source)) {
      const next = [{ source, loading: true }, ...rows];
      setRows(next);
      saveSources(next.map((r) => r.source));
    }
    void fetchOne(source);
  };

  const remove = (source: string) => {
    const next = rows.filter((r) => r.source !== source);
    setRows(next);
    saveSources(next.map((r) => r.source));
  };

  return (
    <div className="page tracking">
      <div className="page-main narrow-page">
        <header className="page-head">
          <div>
            <h1>Tracking</h1>
            <p className="lede">
              Look up the last position recorded for a named upstream source — used by exactly-once event
              processing pipelines that append with tracking info.
            </p>
          </div>
          {rows.length > 0 && (
            <button className="btn ghost" onClick={refreshAll}>
              ↻ Refresh all
            </button>
          )}
        </header>

        <section className="panel">
          <form
            className="input-row"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Source name, e.g. orders-projection"
              aria-label="Tracking source"
              spellCheck={false}
            />
            <button type="submit" className="btn primary">
              Look up
            </button>
          </form>
        </section>

        {rows.length === 0 ? (
          <div className="empty">Sources you look up are kept here so you can keep an eye on them.</div>
        ) : (
          <div className="table-wrap">
            <table className="events">
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="num">Position</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.source}>
                    <td className="mono">{r.source}</td>
                    <td className="num mono">
                      {r.loading ? (
                        <span className="muted">…</span>
                      ) : r.error ? (
                        <span className="error-text">{r.error}</span>
                      ) : r.position === undefined ? (
                        <span className="muted">not recorded</span>
                      ) : (
                        formatPosition(r.position)
                      )}
                    </td>
                    <td className="actions">
                      <button className="btn ghost small" onClick={() => void fetchOne(r.source)}>
                        ↻
                      </button>
                      <button className="btn ghost small" onClick={() => remove(r.source)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

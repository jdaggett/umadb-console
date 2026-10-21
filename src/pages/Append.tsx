import { useState } from "react";
import { ConnectError } from "@connectrpc/connect";
import { QueryEditor } from "../components/QueryEditor";
import { errorMessage, useConnection } from "../lib/connection";
import { describeQuery, emptyQueryItem, formatPosition, newUuid, parsePosition, splitList, toQuery } from "../lib/format";
import type { QueryItemDraft } from "../lib/format";

type MetadataDraft = { key: string; value: string };

type EventDraft = {
  id: number;
  eventType: string;
  tags: string;
  data: string;
  dataFormat: "json" | "text";
  uuid: string;
  metadata: MetadataDraft[];
};

type Result =
  | { kind: "ok"; position: bigint; count: number }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

let nextId = 1;
const emptyEvent = (): EventDraft => ({
  id: nextId++,
  eventType: "",
  tags: "",
  data: "{\n  \n}",
  dataFormat: "json",
  uuid: newUuid(),
  metadata: [],
});

const encoder = new TextEncoder();

export function Append() {
  const { dcb, refresh } = useConnection();
  const [events, setEvents] = useState<EventDraft[]>([emptyEvent()]);
  const [useFailIf, setUseFailIf] = useState(false);
  const [failIf, setFailIf] = useState<QueryItemDraft[]>([emptyQueryItem()]);
  const [afterInput, setAfterInput] = useState("");
  const [useTracking, setUseTracking] = useState(false);
  const [trackingSource, setTrackingSource] = useState("");
  const [trackingPosition, setTrackingPosition] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const updateEvent = (id: number, patch: Partial<EventDraft>) =>
    setEvents((evs) => evs.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const validate = (): string | null => {
    for (const [i, e] of events.entries()) {
      if (!e.eventType.trim()) return `Event ${i + 1} needs a type.`;
      if (e.dataFormat === "json" && e.data.trim()) {
        try {
          JSON.parse(e.data);
        } catch (err) {
          return `Event ${i + 1} data is not valid JSON: ${(err as Error).message}`;
        }
      }
    }
    if (parsePosition(afterInput) === null) return "Append condition “after” must be a position.";
    if (useTracking) {
      if (!trackingSource.trim()) return "Tracking source is required.";
      const p = parsePosition(trackingPosition);
      if (p === null || p === undefined) return "Tracking position must be a position.";
    }
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setResult({ kind: "error", message: problem });
      return;
    }
    const failIfQuery = useFailIf ? toQuery(failIf) : undefined;
    const after = parsePosition(afterInput) ?? undefined;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await dcb.append({
        events: events.map((e) => ({
          eventType: e.eventType.trim(),
          tags: splitList(e.tags),
          data: encoder.encode(e.dataFormat === "json" && e.data.trim() ? JSON.stringify(JSON.parse(e.data)) : e.data),
          uuid: e.uuid.trim(),
          metadata: e.metadata.filter((m) => m.key.trim()).map((m) => ({ key: m.key.trim(), value: m.value })),
        })),
        condition:
          failIfQuery || after !== undefined ? { failIfEventsMatch: failIfQuery, after } : undefined,
        trackingInfo: useTracking
          ? { source: trackingSource.trim(), position: parsePosition(trackingPosition) ?? 0n }
          : undefined,
      });
      setResult({ kind: "ok", position: res.position, count: events.length });
      // Fresh UUIDs so the same drafts can be appended again without tripping idempotency.
      setEvents((evs) => evs.map((e) => ({ ...e, uuid: newUuid() })));
      void refresh();
    } catch (err) {
      const conflict = err instanceof ConnectError && err.code === 9; // FailedPrecondition
      setResult({ kind: conflict ? "conflict" : "error", message: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const loadExample = () => {
    setEvents([
      {
        ...emptyEvent(),
        eventType: "CourseDefined",
        tags: "course:c1",
        data: JSON.stringify({ courseId: "c1", title: "Event Sourcing 101", capacity: 10 }, null, 2),
      },
      {
        ...emptyEvent(),
        eventType: "StudentSubscribedToCourse",
        tags: "course:c1, student:s1",
        data: JSON.stringify({ courseId: "c1", studentId: "s1" }, null, 2),
        metadata: [{ key: "correlation-id", value: newUuid() }],
      },
    ]);
    setUseFailIf(true);
    setFailIf([{ types: "CourseDefined", tags: "course:c1" }]);
    setResult(null);
  };

  return (
    <div className="page append">
      <div className="page-main narrow-page">
        <header className="page-head">
          <div>
            <h1>Append Events</h1>
            <p className="lede">
              Write one or more events atomically, optionally guarded by a DCB append condition and recorded with
              tracking info.
            </p>
          </div>
          <button className="btn ghost" onClick={loadExample}>
            Load example
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {events.map((ev, index) => (
            <section className="panel event-draft" key={ev.id}>
              <div className="section-bar">
                <h3>Event {index + 1}</h3>
                <span className="spacer" />
                {events.length > 1 && (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setEvents((evs) => evs.filter((e) => e.id !== ev.id))}
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid-2">
                <label className="field">
                  <span className="field-label">Type</span>
                  <input
                    value={ev.eventType}
                    onChange={(e) => updateEvent(ev.id, { eventType: e.target.value })}
                    placeholder="StudentSubscribedToCourse"
                    spellCheck={false}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">Tags <em>comma-separated</em></span>
                  <input
                    value={ev.tags}
                    onChange={(e) => updateEvent(ev.id, { tags: e.target.value })}
                    placeholder="course:c1, student:s1"
                    spellCheck={false}
                  />
                </label>
              </div>
              <div className="field">
                <div className="field-label-row">
                  <span className="field-label">Data</span>
                  <div className="segmented small" role="radiogroup" aria-label="Data format">
                    {(["json", "text"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        role="radio"
                        aria-checked={ev.dataFormat === f}
                        onClick={() => updateEvent(ev.id, { dataFormat: f })}
                      >
                        {f === "json" ? "JSON" : "Text"}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  className="mono"
                  rows={Math.min(14, Math.max(4, ev.data.split("\n").length + 1))}
                  value={ev.data}
                  onChange={(e) => updateEvent(ev.id, { data: e.target.value })}
                  spellCheck={false}
                />
              </div>
              <label className="field">
                <span className="field-label">UUID <em>for idempotent appends</em></span>
                <div className="input-row">
                  <input
                    className="mono"
                    value={ev.uuid}
                    onChange={(e) => updateEvent(ev.id, { uuid: e.target.value })}
                    placeholder="optional"
                    spellCheck={false}
                  />
                  <button type="button" className="btn ghost small" onClick={() => updateEvent(ev.id, { uuid: newUuid() })}>
                    Regenerate
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => updateEvent(ev.id, { uuid: "" })}>
                    None
                  </button>
                </div>
              </label>
              <div className="field">
                <span className="field-label">Metadata</span>
                {ev.metadata.map((m, mi) => (
                  <div className="input-row" key={mi}>
                    <input
                      className="mono"
                      value={m.key}
                      placeholder="key"
                      aria-label="Metadata key"
                      onChange={(e) =>
                        updateEvent(ev.id, {
                          metadata: ev.metadata.map((x, i) => (i === mi ? { ...x, key: e.target.value } : x)),
                        })
                      }
                    />
                    <input
                      className="mono"
                      value={m.value}
                      placeholder="value"
                      aria-label="Metadata value"
                      onChange={(e) =>
                        updateEvent(ev.id, {
                          metadata: ev.metadata.map((x, i) => (i === mi ? { ...x, value: e.target.value } : x)),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="btn icon ghost"
                      aria-label="Remove metadata entry"
                      onClick={() => updateEvent(ev.id, { metadata: ev.metadata.filter((_, i) => i !== mi) })}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => updateEvent(ev.id, { metadata: [...ev.metadata, { key: "", value: "" }] })}
                  >
                    + Add metadata
                  </button>
                </div>
              </div>
            </section>
          ))}

          <button type="button" className="btn ghost add-event" onClick={() => setEvents((evs) => [...evs, emptyEvent()])}>
            + Add another event
          </button>

          <section className="panel">
            <div className="section-bar">
              <h3>Append condition</h3>
            </div>
            <p className="hint">
              The append is rejected if any event matching the query was recorded after the given position — the
              core of Dynamic Consistency Boundaries.
            </p>
            <label className="check">
              <input type="checkbox" checked={useFailIf} onChange={(e) => setUseFailIf(e.target.checked)} />
              Fail if events match a query
            </label>
            {useFailIf && <QueryEditor items={failIf} onChange={setFailIf} />}
            <label className="field narrow-field">
              <span className="field-label">After position <em>optional</em></span>
              <input
                value={afterInput}
                onChange={(e) => setAfterInput(e.target.value)}
                placeholder="e.g. last position you read"
                inputMode="numeric"
              />
            </label>
          </section>

          <section className="panel">
            <label className="check">
              <input type="checkbox" checked={useTracking} onChange={(e) => setUseTracking(e.target.checked)} />
              Record tracking info (source position) with this append
            </label>
            {useTracking && (
              <div className="grid-2">
                <label className="field">
                  <span className="field-label">Source</span>
                  <input value={trackingSource} onChange={(e) => setTrackingSource(e.target.value)} placeholder="upstream-service" />
                </label>
                <label className="field">
                  <span className="field-label">Position</span>
                  <input
                    value={trackingPosition}
                    onChange={(e) => setTrackingPosition(e.target.value)}
                    placeholder="e.g. 42"
                    inputMode="numeric"
                  />
                </label>
              </div>
            )}
          </section>

          <div className="submit-bar">
            <div className="muted small-text">
              {events.length} event{events.length === 1 ? "" : "s"}
              {useFailIf && ` · fail if ${describeQuery(failIf)}`}
              {afterInput.trim() && ` after #${afterInput.trim()}`}
            </div>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? "Appending…" : `Append ${events.length} event${events.length === 1 ? "" : "s"}`}
            </button>
          </div>

          {result?.kind === "ok" && (
            <div className="alert success">
              Appended {result.count} event{result.count === 1 ? "" : "s"}. New head position is{" "}
              <strong className="mono">#{formatPosition(result.position)}</strong>.
            </div>
          )}
          {result?.kind === "conflict" && (
            <div className="alert warning">
              <strong>Append condition failed.</strong> {result.message}
            </div>
          )}
          {result?.kind === "error" && <div className="alert error">{result.message}</div>}
        </form>
      </div>
    </div>
  );
}

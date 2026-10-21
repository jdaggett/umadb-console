import { useMemo, useState } from "react";
import type { SequencedEvent } from "../gen/v1/umadb_pb";
import { decodeData, formatBytes, formatPosition, hexDump, toBase64 } from "../lib/format";
import { Chip } from "./EventTable";
import { CopyButton } from "./CopyButton";
import { JsonView } from "./JsonView";

type View = "formatted" | "raw" | "hex" | "base64";

type Props = {
  event: SequencedEvent;
  onClose: () => void;
  onTypeClick?: (type: string) => void;
  onTagClick?: (tag: string) => void;
};

export function EventDetail({ event: se, onClose, onTypeClick, onTagClick }: Props) {
  const ev = se.event;
  const data = ev?.data ?? new Uint8Array();
  const decoded = useMemo(() => decodeData(data), [data]);
  const [view, setView] = useState<View>(decoded.kind === "binary" ? "hex" : "formatted");

  const rawText = decoded.kind === "json" || decoded.kind === "text" ? new TextDecoder().decode(data) : "";
  const viewText =
    view === "hex" ? hexDump(data) : view === "base64" ? toBase64(data) : view === "raw" ? rawText : "";

  return (
    <aside className="detail" aria-label="Event detail">
      <header className="detail-head">
        <div>
          <div className="eyebrow">Event</div>
          <h2 className="mono">#{formatPosition(se.position)}</h2>
        </div>
        <button className="btn icon ghost" onClick={onClose} aria-label="Close event detail">
          ×
        </button>
      </header>

      <dl className="props">
        <dt>Type</dt>
        <dd>
          <Chip kind="type" onClick={onTypeClick && (() => onTypeClick(ev?.eventType ?? ""))}>
            {ev?.eventType || <i>untyped</i>}
          </Chip>
        </dd>
        <dt>Tags</dt>
        <dd className="wrap">
          {ev?.tags.length ? (
            ev.tags.map((tag) => (
              <Chip key={tag} kind="tag" onClick={onTagClick && (() => onTagClick(tag))}>
                {tag}
              </Chip>
            ))
          ) : (
            <span className="muted">none</span>
          )}
        </dd>
        <dt>UUID</dt>
        <dd className="mono">
          {ev?.uuid ? (
            <>
              {ev.uuid} <CopyButton text={ev.uuid} />
            </>
          ) : (
            <span className="muted">none</span>
          )}
        </dd>
        <dt>Size</dt>
        <dd>{formatBytes(data.length)}</dd>
        {se.trackingInfo && (
          <>
            <dt>Tracking</dt>
            <dd className="mono">
              {se.trackingInfo.source} @ {formatPosition(se.trackingInfo.position)}
            </dd>
          </>
        )}
      </dl>

      {ev && ev.metadata.length > 0 && (
        <section className="detail-section">
          <h3>Metadata</h3>
          <table className="kv">
            <tbody>
              {ev.metadata.map((m, i) => (
                <tr key={`${m.key}-${i}`}>
                  <th className="mono">{m.key}</th>
                  <td className="mono">{m.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="detail-section grow">
        <div className="section-bar">
          <h3>Data</h3>
          <div className="segmented" role="tablist">
            {(["formatted", "raw", "hex", "base64"] as View[])
              .filter((v) => !(v === "formatted" || v === "raw") || decoded.kind !== "binary")
              .map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>
                  {v === "formatted" ? (decoded.kind === "json" ? "JSON" : "Text") : v === "raw" ? "Raw" : v === "hex" ? "Hex" : "Base64"}
                </button>
              ))}
          </div>
          <CopyButton text={view === "formatted" ? (decoded.kind === "json" ? decoded.text : rawText) : viewText} />
        </div>
        {decoded.kind === "empty" ? (
          <div className="empty small">Empty payload.</div>
        ) : view === "formatted" && decoded.kind === "json" ? (
          <JsonView value={decoded.value} />
        ) : (
          <pre className="code">{view === "formatted" ? rawText : viewText}</pre>
        )}
      </section>
    </aside>
  );
}

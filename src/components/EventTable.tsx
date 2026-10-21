import type { SequencedEvent } from "../gen/v1/umadb_pb";
import { formatPosition, previewData } from "../lib/format";

type Props = {
  events: SequencedEvent[];
  selected?: bigint;
  onSelect: (event: SequencedEvent) => void;
  onTypeClick?: (type: string) => void;
  onTagClick?: (tag: string) => void;
  /** Positions to briefly highlight, e.g. newly streamed events. */
  fresh?: Set<bigint>;
  empty?: React.ReactNode;
};

export function EventTable({ events, selected, onSelect, onTypeClick, onTagClick, fresh, empty }: Props) {
  if (events.length === 0) {
    return <div className="empty">{empty ?? "No events."}</div>;
  }
  return (
    <div className="table-wrap">
      <table className="events">
        <thead>
          <tr>
            <th className="num">Position</th>
            <th>Type</th>
            <th>Tags</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {events.map((se) => {
            const ev = se.event;
            const classes = [
              se.position === selected ? "selected" : "",
              fresh?.has(se.position) ? "fresh" : "",
            ].join(" ");
            return (
              <tr
                key={se.position.toString()}
                className={classes}
                onClick={() => onSelect(se)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(se);
                  }
                }}
              >
                <td className="num mono">{formatPosition(se.position)}</td>
                <td>
                  <Chip kind="type" onClick={onTypeClick && (() => onTypeClick(ev?.eventType ?? ""))}>
                    {ev?.eventType || <i>untyped</i>}
                  </Chip>
                </td>
                <td>
                  <div className="tags-cell">
                    {ev?.tags.map((tag) => (
                      <Chip key={tag} kind="tag" onClick={onTagClick && (() => onTagClick(tag))}>
                        {tag}
                      </Chip>
                    ))}
                  </div>
                </td>
                <td className="mono preview">{ev ? previewData(ev.data) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Chip({
  kind,
  children,
  onClick,
}: {
  kind: "type" | "tag";
  children: React.ReactNode;
  onClick?: () => void;
}) {
  if (!onClick) return <span className={`chip ${kind}`}>{children}</span>;
  return (
    <button
      type="button"
      className={`chip ${kind} clickable`}
      title={kind === "type" ? "Filter by this type" : "Filter by this tag"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

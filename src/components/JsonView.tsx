import { useState } from "react";

/** Collapsible, syntax-coloured JSON tree. */
export function JsonView({ value }: { value: unknown }) {
  return (
    <div className="code json">
      <JsonNode value={value} depth={0} />
    </div>
  );
}

function JsonNode({ value, depth, name, last = true }: { value: unknown; depth: number; name?: string; last?: boolean }) {
  const [open, setOpen] = useState(depth < 3);
  const comma = last ? "" : ",";
  const key = name !== undefined ? <span className="j-key">{JSON.stringify(name)}</span> : null;
  const prefix = key ? <>{key}: </> : null;

  if (value !== null && typeof value === "object") {
    const isArray = Array.isArray(value);
    const entries = isArray ? (value as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(value);
    const [openBr, closeBr] = isArray ? ["[", "]"] : ["{", "}"];
    if (entries.length === 0) {
      return (
        <div className="j-line">
          {prefix}
          <span className="j-punct">{openBr + closeBr}</span>
          {comma}
        </div>
      );
    }
    return (
      <div>
        <div className="j-line">
          <button className="j-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "▾" : "▸"}
          </button>
          {prefix}
          <span className="j-punct">{openBr}</span>
          {!open && (
            <>
              <span className="j-summary">
                {" "}
                {entries.length} {isArray ? "items" : "keys"}{" "}
              </span>
              <span className="j-punct">{closeBr}</span>
              {comma}
            </>
          )}
        </div>
        {open && (
          <>
            <div className="j-children">
              {entries.map(([k, v], i) => (
                <JsonNode key={k} name={isArray ? undefined : k} value={v} depth={depth + 1} last={i === entries.length - 1} />
              ))}
            </div>
            <div className="j-line">
              <span className="j-punct">{closeBr}</span>
              {comma}
            </div>
          </>
        )}
      </div>
    );
  }

  const cls =
    typeof value === "string" ? "j-str" : typeof value === "number" ? "j-num" : value === null ? "j-null" : "j-bool";
  return (
    <div className="j-line">
      {prefix}
      <span className={cls}>{JSON.stringify(value)}</span>
      {comma}
    </div>
  );
}

import { create } from "@bufbuild/protobuf";
import { QueryItemSchema, QuerySchema } from "../gen/v1/umadb_pb";
import type { Query } from "../gen/v1/umadb_pb";

export type DecodedData =
  | { kind: "empty" }
  | { kind: "json"; value: unknown; text: string }
  | { kind: "text"; text: string }
  | { kind: "binary" };

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function decodeData(bytes: Uint8Array): DecodedData {
  if (bytes.length === 0) return { kind: "empty" };
  let text: string;
  try {
    text = utf8.decode(bytes);
  } catch {
    return { kind: "binary" };
  }
  // Treat control characters (other than whitespace) as a sign of binary data.
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) return { kind: "binary" };
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const value = JSON.parse(trimmed);
      return { kind: "json", value, text: JSON.stringify(value, null, 2) };
    } catch {
      // Not JSON after all.
    }
  }
  return { kind: "text", text };
}

/** A one-line preview of an event payload for table rows. */
export function previewData(bytes: Uint8Array, max = 120): string {
  const decoded = decodeData(bytes);
  switch (decoded.kind) {
    case "empty":
      return "—";
    case "json": {
      const compact = JSON.stringify(decoded.value);
      return compact.length > max ? `${compact.slice(0, max)}…` : compact;
    }
    case "text":
      return decoded.text.length > max ? `${decoded.text.slice(0, max)}…` : decoded.text;
    case "binary":
      return `${formatBytes(bytes.length)} binary`;
  }
}

export function hexDump(bytes: Uint8Array, limit = 4096): string {
  const lines: string[] = [];
  const end = Math.min(bytes.length, limit);
  for (let offset = 0; offset < end; offset += 16) {
    const row = bytes.subarray(offset, Math.min(offset + 16, end));
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(row, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
    lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex.padEnd(47)}  ${ascii}`);
  }
  if (bytes.length > limit) lines.push(`… ${formatBytes(bytes.length - limit)} more`);
  return lines.join("\n");
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPosition(p: bigint | undefined): string {
  return p === undefined ? "—" : p.toLocaleString("en-US");
}

/** Parses a non-negative integer position, returning undefined for blank input and null for invalid input. */
export function parsePosition(input: string): bigint | undefined | null {
  const s = input.trim().replace(/[,_\s]/g, "");
  if (s === "") return undefined;
  if (!/^\d+$/.test(s)) return null;
  return BigInt(s);
}

export function splitList(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type QueryItemDraft = { types: string; tags: string };

export const emptyQueryItem = (): QueryItemDraft => ({ types: "", tags: "" });

/** Converts editor drafts to a protobuf Query; items with no types and no tags are dropped. */
export function toQuery(items: QueryItemDraft[]): Query | undefined {
  const parsed = items
    .map((item) => ({ types: splitList(item.types), tags: splitList(item.tags) }))
    .filter((item) => item.types.length > 0 || item.tags.length > 0);
  if (parsed.length === 0) return undefined;
  return create(QuerySchema, { items: parsed.map((item) => create(QueryItemSchema, item)) });
}

export function describeQuery(items: QueryItemDraft[]): string {
  const parts = items
    .map((item) => {
      const types = splitList(item.types);
      const tags = splitList(item.tags);
      const clauses: string[] = [];
      if (types.length) clauses.push(`type ∈ {${types.join(", ")}}`);
      if (tags.length) clauses.push(`tags ⊇ {${tags.join(", ")}}`);
      return clauses.join(" ∧ ");
    })
    .filter(Boolean);
  return parts.length ? parts.map((p) => (parts.length > 1 ? `(${p})` : p)).join(" ∨ ") : "all events";
}

export function newUuid(): string {
  return crypto.randomUUID();
}

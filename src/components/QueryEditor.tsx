import { emptyQueryItem } from "../lib/format";
import type { QueryItemDraft } from "../lib/format";

type Props = {
  items: QueryItemDraft[];
  onChange: (items: QueryItemDraft[]) => void;
  /** Called when Enter is pressed in any field. */
  onSubmit?: () => void;
};

/**
 * Edits a DCB query: a list of items combined with OR. Within an item, an event
 * matches when its type is any of the listed types and it carries all listed tags.
 */
export function QueryEditor({ items, onChange, onSubmit }: Props) {
  const update = (index: number, patch: Partial<QueryItemDraft>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange(next.length ? next : [emptyQueryItem()]);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="query-editor">
      {items.map((item, index) => (
        <div key={index} className="query-item-wrap">
          {index > 0 && <div className="query-or">OR</div>}
          <div className="query-item">
            <label className="field">
              <span className="field-label">Event types <em>any of</em></span>
              <input
                value={item.types}
                placeholder="e.g. CourseCreated, StudentSubscribed"
                onChange={(e) => update(index, { types: e.target.value })}
                onKeyDown={onKeyDown}
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span className="field-label">Tags <em>all of</em></span>
              <input
                value={item.tags}
                placeholder="e.g. course:c1, student:s1"
                onChange={(e) => update(index, { tags: e.target.value })}
                onKeyDown={onKeyDown}
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className="btn icon ghost"
              title="Remove this query item"
              aria-label="Remove query item"
              onClick={() => remove(index)}
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn ghost small" onClick={() => onChange([...items, emptyQueryItem()])}>
        + Add OR item
      </button>
    </div>
  );
}

/**
 * Keyboard and ARIA wiring for a selectable table row.
 *
 * The pattern browser and the registry browser are the only route to any record
 * but the first, so their rows have to answer the keyboard. Both had the same
 * handler pasted into them, which is the shape of thing that drifts: the next
 * time one gains Home/End or arrow-key navigation, the other will not.
 *
 * The row keeps its implicit `row` role. Putting `role="button"` on a <tr>
 * overrides it, which stops the cells being cells and throws away the column
 * headers — undoing the table semantics that are the reason for using a table.
 * The table carries `role="grid"` instead, which is what makes a focusable,
 * selectable row legitimate.
 */
export function selectableRow(isSelected: boolean, onSelect: () => void) {
  return {
    className: 'row-button',
    tabIndex: 0,
    'aria-selected': isSelected,
    onClick: onSelect,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect();
      }
    },
    style: {
      cursor: 'pointer',
      background: isSelected ? 'var(--surface-raised)' : undefined,
      boxShadow: isSelected ? 'inset 2px 0 0 var(--accent)' : undefined,
    },
  } as const;
}

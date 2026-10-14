const ROWS: { action: string; keys: string[]; touch: string }[] = [
  { action: 'Sail forward', keys: ['W', '↑'], touch: 'Up arrow' },
  { action: 'Turn left / right', keys: ['A', 'D', '←', '→'], touch: 'Curved arrows' },
  { action: 'Front cannon', keys: ['Space', 'K'], touch: 'Middle cannon' },
  { action: 'Left broadside (3 shots)', keys: ['Q', 'J'], touch: 'Left cannons' },
  { action: 'Right broadside (3 shots)', keys: ['E', 'L'], touch: 'Right cannons' },
  { action: 'Pause', keys: ['Esc', 'P'], touch: 'Pause button' },
]

/** Control instructions, shared by the menu and the pause dialog. */
export function ControlsHelp({ compact = false }: { compact?: boolean }) {
  return (
    <div className="controls-card" data-testid="controls-help">
      <h2 id="controls-title">How to play</h2>
      <table className="controls-table" aria-labelledby="controls-title">
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Keyboard</th>
            {!compact && <th scope="col">Touch</th>}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.action}>
              <th scope="row">{row.action}</th>
              <td>
                {row.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </td>
              {!compact && <td className="muted">{row.touch}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!compact && (
        <p className="hint">
          Hold a fire key to keep shooting; each cannon has its own reload time. You can sail and fire at the same time. Destroy enemy
          ships for 1 point each — red Chasers ram you, blue Shooters fire from range.
        </p>
      )}
    </div>
  )
}

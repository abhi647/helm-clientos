/**
 * Effort in the project's billing unit: a number plus the unit. With one unit (most projects: days) the unit is
 * shown as text; with several (a rate card with day rates and deliveries) it is a drop-down.
 */
export function EffortInput({ name, unitName, units, defaultValue, defaultUnit, required, step = 0.25, placeholder = 'Effort' }: {
  name: string; unitName: string; units: string[]; defaultValue?: number | null; defaultUnit?: string; required?: boolean; step?: number; placeholder?: string
}) {
  const list = units.length ? units : ['day']
  const unit = defaultUnit && list.includes(defaultUnit) ? defaultUnit : list[0]!
  return (
    <span className="flex items-center gap-1.5">
      <input type="number" name={name} step={step} min={step} defaultValue={defaultValue ?? ''} required={required}
        placeholder={placeholder} aria-label={`${placeholder} in ${list.length === 1 ? `${unit}s` : 'the chosen unit'}`} className="input w-20 font-mono" />
      {list.length === 1 ? (
        <><input type="hidden" name={unitName} value={unit} /><span className="text-xs text-muted">{unit === 'day' ? 'days' : unit}</span></>
      ) : (
        <select name={unitName} defaultValue={unit} aria-label="Effort unit" className="input w-auto">
          {list.map((u) => <option key={u} value={u}>{u === 'day' ? 'days' : u}</option>)}
        </select>
      )}
    </span>
  )
}

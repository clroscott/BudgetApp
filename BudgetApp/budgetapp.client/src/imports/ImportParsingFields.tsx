import { useId } from 'react'

export function ImportParsingFields({ dateFormat, numberCulture, disabled, onChange }: {
  dateFormat?: string | null
  numberCulture?: string | null
  disabled?: boolean
  onChange: (field: 'dateFormat' | 'numberCulture', value: string | null) => void
}) {
  const id = useId()
  return <>
    <div><label><span>Text date format</span>
      <select value={dateFormat ?? ''} disabled={disabled} aria-describedby={`${id}-date-help`}
        onChange={event => onChange('dateFormat', event.target.value || null)}>
        <option value="">Automatic (month first for ambiguous dates)</option>
        <option value="yyyy-MM-dd">Year-month-day (2026-07-20)</option>
        <option value="yyyyMMdd">Year month day (20260720)</option>
        <option value="MM/dd/yyyy">Month/day/year (07/20/2026)</option>
        <option value="dd/MM/yyyy">Day/month/year (20/07/2026)</option>
      </select>
    </label>
      <small id={`${id}-date-help`}>Applies to dates stored as text. Native Excel dates are read directly.</small>
    </div>
    <div><label><span>Text number format</span>
      <select value={numberCulture ?? ''} disabled={disabled} aria-describedby={`${id}-number-help`}
        onChange={event => onChange('numberCulture', event.target.value || null)}>
        <option value="">Default: 1,234.56</option>
        <option value="en-US">English (US): 1,234.56</option>
        <option value="en-CA">English (Canada): 1,234.56</option>
        <option value="en-GB">English (UK): 1,234.56</option>
        <option value="fr-CA">French (Canada): 1 234,56</option>
        <option value="de-DE">German: 1.234,56</option>
      </select>
    </label>
      <small id={`${id}-number-help`}>Applies to amounts stored as text. Choose explicitly for comma decimals.</small>
    </div>
  </>
}

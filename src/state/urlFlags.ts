// Boolean URL params (?name=true|false, also 1/0, on/off, yes/no; bare ?name means true).
// Returns undefined when the param is absent or unrecognised, so callers keep their stored value.
export const boolParam = (name: string): boolean | undefined => {
  const params = new URLSearchParams(location.search)
  if (!params.has(name)) return undefined
  const v = (params.get(name) ?? '').toLowerCase()
  if (['', 'true', '1', 'on', 'yes'].includes(v)) return true
  if (['false', '0', 'off', 'no'].includes(v)) return false
  return undefined
}

// Applies ?name=bool to a localStorage flag, then returns whether the flag is on.
export const persistedFlag = (name: string, key: string, onValue: string, offValue: string, fallback: boolean) => {
  try {
    const forced = boolParam(name)
    if (forced !== undefined) localStorage.setItem(key, forced ? onValue : offValue)
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : stored === onValue
  } catch {
    return fallback
  }
}

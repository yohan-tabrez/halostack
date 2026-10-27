// {{var}} substitution for command templates. This is a shell-injection surface:
// a value spliced into a command string is executed. By default every value is
// wrapped in single quotes (the only shell-safe quoting), so `; rm -rf /` becomes
// a literal argument, not a new command. raw mode skips quoting and must be gated
// to global_admin at the call site.

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

export function extractVariables(template: string): string[] {
  const names = new Set<string>()
  for (const m of template.matchAll(VAR_RE)) names.add(m[1])
  return [...names]
}

function shellQuote(value: string): string {
  // Close the quote, emit an escaped single quote, reopen: foo'bar -> 'foo'\''bar'
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function interpolate(
  template: string,
  values: Record<string, string>,
  opts: { raw?: boolean } = {}
): string {
  return template.replace(VAR_RE, (_, name: string) => {
    const v = values[name]
    if (v === undefined || v === null) {
      throw new Error(`Missing value for variable "${name}"`)
    }
    return opts.raw ? v : shellQuote(v)
  })
}

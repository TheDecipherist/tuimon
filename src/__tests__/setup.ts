// Ensure process.stdout.columns and process.stdout.rows exist as accessor
// properties so vi.spyOn(process.stdout, 'columns', 'get') works in tests.
// In non-TTY environments these may be plain data properties or missing entirely.

function ensureGetterProperty(obj: object, prop: string, fallback: number) {
  const descriptor = Object.getOwnPropertyDescriptor(obj, prop)
  if (!descriptor || !descriptor.get) {
    let value = descriptor?.value ?? fallback
    Object.defineProperty(obj, prop, {
      configurable: true,
      enumerable: true,
      get() { return value },
      set(v: number) { value = v },
    })
  }
}

ensureGetterProperty(process.stdout, 'columns', 80)
ensureGetterProperty(process.stdout, 'rows', 24)

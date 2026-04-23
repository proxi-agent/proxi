/**
 * Deterministic diff helpers for audit payloads.
 *
 * When a workflow mutates a record, we want the audit row's metadata to
 * capture exactly what changed — without hand-rolling the same JSON shape
 * in every service. These helpers produce a stable `changedFields` array
 * suitable for:
 *   • rendering "what changed" cards in the UI
 *   • feeding structured diffs to an LLM for summarization
 *   • reconciling against downstream systems
 */

export interface FieldChange {
  path: string
  before: unknown
  after: unknown
}

export interface StructuredDiff {
  changedFields: FieldChange[]
  addedKeys: string[]
  removedKeys: string[]
  hasChanges: boolean
}

export interface DiffOptions {
  /** Field paths to ignore (e.g. `["updatedAt", "metadata.lastNote"]`). */
  ignore?: string[]
  /** Max depth — prevents pathological recursion on circular structures. */
  maxDepth?: number
  /** If true, treat `null` and `undefined` as equal. Default: true. */
  nullishEqual?: boolean
}

/**
 * Produces a flat list of field-level changes between two records. Objects
 * are walked recursively; arrays and primitives are compared by structural
 * equality (not reference), so `{tags: ["a"]}` vs `{tags: ["a"]}` is
 * considered unchanged.
 */
export function diff<T extends object>(prev: T | null | undefined, next: T, options: DiffOptions = {}): StructuredDiff {
  const { ignore = [], maxDepth = 6, nullishEqual = true } = options
  const ignoreSet = new Set(ignore)
  const changed: FieldChange[] = []
  const addedKeys: string[] = []
  const removedKeys: string[] = []

  walk(prev ?? {}, next, '', 0, ignoreSet, maxDepth, nullishEqual, changed, addedKeys, removedKeys)

  return {
    addedKeys,
    changedFields: changed,
    hasChanges: changed.length + addedKeys.length + removedKeys.length > 0,
    removedKeys,
  }
}

/** Convenience wrapper: returns just the changed field list, no metadata. */
export function changedFields<T extends object>(prev: T | null | undefined, next: T, options?: DiffOptions): FieldChange[] {
  return diff(prev, next, options).changedFields
}

/** Serializes a StructuredDiff into an audit-ready metadata payload. */
export function diffToMetadata(structured: StructuredDiff): Record<string, unknown> {
  if (!structured.hasChanges) return { changed: false }
  return {
    addedKeys: structured.addedKeys,
    changed: true,
    changedFields: structured.changedFields.map(f => ({
      after: redactIfSensitive(f.path, f.after),
      before: redactIfSensitive(f.path, f.before),
      path: f.path,
    })),
    removedKeys: structured.removedKeys,
  }
}

// ----------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------

const SENSITIVE_FIELD_PATTERNS = [/password/i, /secret/i, /token/i, /ssn/i, /taxid/i, /apiKey/i]

function redactIfSensitive(path: string, value: unknown): unknown {
  if (SENSITIVE_FIELD_PATTERNS.some(re => re.test(path))) return '[REDACTED]'
  return value
}

function walk(
  prev: unknown,
  next: unknown,
  basePath: string,
  depth: number,
  ignore: Set<string>,
  maxDepth: number,
  nullishEqual: boolean,
  changed: FieldChange[],
  added: string[],
  removed: string[],
): void {
  if (ignore.has(basePath)) return

  if (depth >= maxDepth || !isPlainObject(prev) || !isPlainObject(next)) {
    if (!isEqual(prev, next, nullishEqual)) {
      changed.push({ after: next, before: prev, path: basePath || '<root>' })
    }
    return
  }

  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const key of allKeys) {
    const path = basePath ? `${basePath}.${key}` : key
    if (ignore.has(path)) continue

    const prevVal = (prev as Record<string, unknown>)[key]
    const nextVal = (next as Record<string, unknown>)[key]
    const hasPrev = key in prev
    const hasNext = key in next

    if (!hasPrev && hasNext) {
      added.push(path)
      if (nextVal !== undefined) {
        changed.push({ after: nextVal, before: undefined, path })
      }
      continue
    }
    if (hasPrev && !hasNext) {
      removed.push(path)
      continue
    }

    walk(prevVal, nextVal, path, depth + 1, ignore, maxDepth, nullishEqual, changed, added, removed)
  }
}

function isEqual(a: unknown, b: unknown, nullishEqual: boolean): boolean {
  if (a === b) return true
  if (nullishEqual && a == null && b == null) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((value, idx) => isEqual(value, b[idx], nullishEqual))
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a).sort()
    const bKeys = Object.keys(b).sort()
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every((key, idx) => key === bKeys[idx] && isEqual(a[key], b[key], nullishEqual))
  }
  return false
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value) || value instanceof Date) return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

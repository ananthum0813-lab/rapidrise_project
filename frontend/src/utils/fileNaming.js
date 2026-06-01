/**
 * fileNaming.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Industry-grade filename deduplication for the frontend upload pipeline.
 *
 * PROBLEM WITH THE ORIGINAL CODE
 * ───────────────────────────────
 * 1. `stripDjangoSuffix` removed trailing `_1_` etc. from the base but then
 *    still only checked exact-name collisions — so "Screenshot_1_.png" became
 *    "Screenshot.png" as the root, found a clash, and jumped to counter 1.
 *    On the NEXT upload it stripped `_1_` again, found the same clash, and
 *    produced counter 1 again → DUPLICATE display name in the DB.
 *
 * 2. The counter loop only scanned names already in `allNames` (exact match),
 *    so it never detected that "file (1).png" was already taken when deciding
 *    the counter for a third upload of the same content.
 *
 * 3. `pendingNames` in `stageFiles` accumulated names for the current batch
 *    but the `resolveFileName` call inside it still re-called `resolveFileName`
 *    without passing `pendingNames`, causing within-batch duplicates.
 *
 * THE FIX
 * ────────
 * • Split filename into (rootBase, ext) by:
 *     a) stripping the file extension
 *     b) stripping Django's storage suffix  (_abc_, _1_, _xyz_abc_ …)
 *     c) stripping our own counter suffix   " (N)"
 *   This gives us the canonical root that all variants share.
 *
 * • Query ALL existing names that share that root (passed as the `existingNames`
 *   set from the server list) and collect every counter that is already in use.
 *
 * • Find the LOWEST non-negative integer NOT in that occupied set:
 *     0   → rootBase + ext               ("file.png")
 *     N>0 → rootBase + " (N)" + ext      ("file (3).png")
 *
 * • Within a multi-file batch, maintain a running `batchNames` set and feed it
 *   into each successive call so no two files in the same drop get the same name.
 *
 * EXAMPLE
 * ────────
 * Existing:  file.png, file (1).png, file (2).png
 * Upload:    file.png   →  occupied = {0,1,2}  →  next free = 3  →  "file (3).png"  ✓
 */

// ── Regex patterns ────────────────────────────────────────────────────────────

/**
 * Matches Django's auto-appended storage suffixes on a *display* name.
 * Examples: "Screenshot_1_", "report_abc_", "photo_2"
 * We only strip if the suffix is purely alphanumeric after an underscore.
 */
const DJANGO_SUFFIX_RE = /(_[a-zA-Z0-9]+_?)$/

/**
 * Matches our own " (N)" counter suffix at the end of a base name.
 * e.g. "report (2)" → groups: ["report (2)", "report", "2"]
 */
const COUNTER_RE = /^(.*?)\s*\((\d+)\)$/


// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Split a full filename into [base, ext].
 * "report (2).pdf" → ["report (2)", ".pdf"]
 * "noextension"    → ["noextension", ""]
 */
export function splitName(filename) {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return [filename, '']        // no ext or leading-dot hidden file
  return [filename.slice(0, dot), filename.slice(dot)]
}

/**
 * Strip Django's auto-generated storage suffix from a base name.
 * "Screenshot from 2026-05-11 15-36-24 _1_" → "Screenshot from 2026-05-11 15-36-24"
 * "report_abc"                                → "report_abc"   (only strips trailing _…_)
 */
export function stripDjangoSuffix(base) {
  return base.replace(DJANGO_SUFFIX_RE, '').trimEnd()
}

/**
 * Strip our own counter suffix from a base name.
 * "file (3)"  → "file"
 * "file"      → "file"
 */
export function stripOurCounter(base) {
  const m = COUNTER_RE.exec(base)
  return m ? m[1].trimEnd() : base
}

/**
 * Derive the canonical root base that all variant names share.
 * "Screenshot_1_.png" → base "Screenshot_1_" → stripDjango → "Screenshot"
 *                                             → stripCounter → "Screenshot"
 * "file (2).png"      → base "file (2)"       → stripDjango → "file (2)"
 *                                             → stripCounter → "file"
 */
export function getRootBase(filename) {
  const [base] = splitName(filename)
  return stripOurCounter(stripDjangoSuffix(base))
}


// ── Main deduplication function ───────────────────────────────────────────────

/**
 * resolveFileName
 * ─────────────────────────────────────────────────────────────────────────────
 * Given a File object to upload, return a new File object whose `.name` is
 * guaranteed to be unique against:
 *   1. `existingNames`  — Set of original_name values already in the database
 *   2. `batchNames`     — Set of names already assigned within the current batch
 *
 * @param {File}        file          — browser File object
 * @param {Set<string>} existingNames — server-side names (from Redux files array)
 * @param {Set<string>} batchNames    — names already used in this upload batch
 * @returns {File}  — same file if no conflict, or a new File with a safe name
 */
export function resolveFileName(file, existingNames = new Set(), batchNames = new Set()) {
  const allNames = new Set(
    [...existingNames, ...batchNames].map((n) => n.toLowerCase())
  )

  // 1. If the exact original name is totally free, use it as-is!
  // This prevents uniquely named files like "movie (2025).mp4" from being
  // aggressively processed and renamed.
  if (!allNames.has(file.name.toLowerCase())) {
    return file
  }

  // 2. We have a collision. Let's find a safe deduplication counter.
  const [rawBase, ext] = splitName(file.name)
  const extLower = ext.toLowerCase()

  const cleanBase = stripDjangoSuffix(rawBase)
  
  // 3. Only strip `(N)` if it looks like OUR deduplication counter.
  // We guess it's ours if `base` + `ext` is actually present in the system.
  let rootBase = cleanBase
  const m = COUNTER_RE.exec(cleanBase)
  if (m) {
    const potentialRoot = m[1].trimEnd()
    const potentialZero = `${potentialRoot}${ext}`.toLowerCase()
    // If the counter-0 file exists, then this `(N)` is likely a sequence counter we should group with.
    if (allNames.has(potentialZero)) {
      rootBase = potentialRoot
    }
  }

  const rootLower = rootBase.toLowerCase()

  // 4. Collect all counter values already occupied
  const occupied = new Set()

  for (const name of allNames) {
    const [b, e] = splitName(name)
    if (e !== extLower) continue

    if (b === rootLower) {
      occupied.add(0)
      continue
    }

    const match = COUNTER_RE.exec(b)
    if (match && match[1].trimEnd().toLowerCase() === rootLower) {
      occupied.add(parseInt(match[2], 10))
    }
  }

  // 5. Find lowest free counter
  let counter = 0
  while (occupied.has(counter)) counter++

  // 6. Build the resolved name
  const resolvedName = counter === 0
    ? `${rootBase}${ext}`
    : `${rootBase} (${counter})${ext}`

  if (resolvedName === file.name) return file
  return new File([file], resolvedName, { type: file.type, lastModified: file.lastModified })
}


// ── Batch staging helper ──────────────────────────────────────────────────────

/**
 * stageFiles
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolve unique names for an entire batch of raw File objects.
 * Runs conflict resolution across the whole batch in one pass so that two files
 * with the same name in the same drop both get distinct names.
 *
 * @param {File[]}      rawFiles      — files from the drop/picker
 * @param {string[]}    serverFiles   — array of { original_name } from Redux store
 * @returns {{ resolved: File[], renamedCount: number }}
 */
export function stageFiles(rawFiles, serverFiles = []) {
  const existingNames = new Set(serverFiles.map((f) => f.original_name.toLowerCase()))
  const batchNames    = new Set()
  let renamedCount    = 0

  const resolved = rawFiles.map((f) => {
    const r = resolveFileName(f, existingNames, batchNames)
    batchNames.add(r.name.toLowerCase())
    if (r.name !== f.name) renamedCount++
    return r
  })

  return { resolved, renamedCount }
}
import { statSync, realpathSync } from 'node:fs'
import { basename } from 'node:path'

import { panelDestination, protectedPath } from './app-policy.mjs'
import { normalizeKey } from './keys.mjs'

/**
 * CU-48 option A (panel-folder-source.md, D-058; CU-139): a file panel's folder, known only when the agent itself set it
 * with Go to Folder, until anything else happens in the panel. A pure state machine; agent core feeds it each action
 * judged in a panel, with the panel's selection read at that moment (`{ shownFolderName, nameFieldFocused, name }`).
 *
 * idle -> (cmd-shift-G; the shown name is read now) -> goto -> (a one-line path typed) -> typed -> (the Go to Folder
 * commit; arms only if the path resolves - no '..', not protected, no secret placeholder - is canonical, exists and is
 * a folder by one stat, and the shown name read at cmd-shift-G was NOT already the target's display name) -> held.
 * Held keeps the folder only through a plain-name type while the name field has focus, and the panel's commit; any other
 * action drops it to idle, as do a pause, a take-over, a consent wait and the panel closing (`drop`). At the commit the
 * folder is known only if the panel's shown folder name equals the held folder's display name - a display name checks a
 * path the run already holds and never names one (D-047 as amended).
 */

const SECRET = /\{\{secret:[a-z0-9_-]+\}\}/i
const PLAIN_NAME = (text) => text.length > 0 && !text.includes('/') && !/^[~.]/.test(text) && !/[\r\n\t]/.test(text)

const defaultFs = {
  /** Canonical (symlinks resolved) and a folder, by one stat - never a listing; null when not an existing folder. */
  folder(path) {
    try {
      const real = realpathSync(path)
      return statSync(real).isDirectory() ? real : null
    } catch {
      return null
    }
  },
  /** The folder's display name as the panel shows it (FileManager.displayName: the last component here). */
  displayName(path) {
    return basename(path) || path
  },
}

export function createPanelFolder({ fs = defaultFs, home } = {}) {
  let state = { phase: 'idle' }
  const keysOf = (action) => new Set(Array.isArray(action.keys) ? action.keys.map((key) => normalizeKey(String(key))) : [])
  const isGoTo = (action) => {
    const keys = keysOf(action)
    return action.type === 'keypress' && keys.size === 3 && keys.has('META') && keys.has('SHIFT') && keys.has('G')
  }
  const isReturn = (action) => action.type === 'keypress' && keysOf(action).size === 1 && keysOf(action).has('ENTER')

  /** Try to arm from the typed Go to Folder path; returns the held state or idle. */
  const arm = (typed, shownAtGoTo) => {
    if (SECRET.test(typed) || /(^|\/)\.\.(\/|$)/.test(typed)) return { phase: 'idle' }
    const resolved = panelDestination({ name: typed }, home)
    if (!resolved.known || protectedPath(resolved.path, home)) return { phase: 'idle' }
    const folder = fs.folder(resolved.path)
    if (folder === null || protectedPath(folder, home)) return { phase: 'idle' }
    const name = fs.displayName(folder)
    // A failed Go to Folder leaves the panel where it was; if that already showed this name, the check proves nothing.
    if (typeof shownAtGoTo === 'string' && shownAtGoTo === name) return { phase: 'idle', refused: 'shown_name_already_equal' }
    return { phase: 'held', path: folder, name }
  }

  const TEXT_INPUT = /^(ax)?(textfield|combobox)$/i
  /**
   * Positive evidence that the Go to Folder sheet's field has the key (note 0.3.3): the focused element a text input that
   * is not a search field, and in a save panel the name field not focused. Without it, cmd-shift-G may have opened no
   * sheet - the path went to the browser as type-select, and Return presses Save or opens the selection.
   */
  const gotoEvidence = (target, selection, panelKind) =>
    TEXT_INPUT.test(String(target?.role ?? '')) && !/searchfield/i.test(String(target?.subrole ?? '')) &&
    (panelKind !== 'save' || selection?.nameFieldFocused === false)

  return {
    get state() {
      return state
    },
    /**
     * Note 0.3.3 rows 11-14: the Go to Folder sheet's Return navigates and is no file commit - but only on positive
     * evidence that the sheet's field has it: right after cmd-shift-G and a typed path, the focused element a text input
     * (AXTextField, AXComboBox) that is not a search field, the name field not focused in a save panel (an open panel
     * has none, so this alone proves nothing there), and the typed path an existing folder. Browser, list, outline or
     * search focus - Go to Folder that opened no sheet, where Return presses Save or opens the selection - and a file
     * path (which may open at once) stay commits, asked as today.
     */
    gotoReturnNavigates(action, target, selection, panelKind) {
      if (state.phase !== 'typed' || !isReturn(action)) return false
      if (!gotoEvidence(target, selection, panelKind)) return false
      const resolved = panelDestination({ name: state.typed }, home)
      return resolved.known && !protectedPath(resolved.path, home) && fs.folder(resolved.path) !== null
    },
    /**
     * Feed one action judged inside the panel, with the selection read for it, its target and the panel's kind. `commit`
     * says whether this action is the panel's commit (the caller's file_choice rule). The Go to Folder commit - a Return,
     * or a typed path ending in a newline - arms only on positive evidence (cu-researcher). Returns the folder for a
     * commit - `{ known, path, source }` - else null.
     */
    observe(action, selection = null, { commit = false, target = null, panelKind = null } = {}) {
      const shown = selection?.shownFolderName ?? null
      if (isGoTo(action)) {
        state = { phase: 'goto', shownAtGoTo: shown }
        return null
      }
      if (state.phase === 'goto' && action.type === 'type') {
        const text = String(action.text ?? '')
        const line = text.replace(/[\r\n]+$/, '')
        if (/[\r\n\t]/.test(line) || line.trim() === '') { state = { phase: 'idle' }; return null }
        state = { phase: 'typed', typed: line.trim(), shownAtGoTo: state.shownAtGoTo }
        // A typed path ending in a newline commits Go to Folder in the same action - on the same evidence as a Return.
        if (/[\r\n]$/.test(text)) state = gotoEvidence(target, selection, panelKind) ? arm(state.typed, state.shownAtGoTo) : { phase: 'idle' }
        return null
      }
      if (state.phase === 'typed' && isReturn(action)) {
        state = gotoEvidence(target, selection, panelKind) ? arm(state.typed, state.shownAtGoTo) : { phase: 'idle' }
        return null
      }
      if (state.phase === 'held') {
        if (commit) {
          const held = state
          state = { phase: 'idle' }
          // The check: the panel must show the held folder's display name, exactly (equality, never a prefix).
          if (typeof shown !== 'string' || shown !== held.name) return { known: false, source: null, reason: 'shown_name_mismatch' }
          return { known: true, path: held.path, source: 'go_to_folder' }
        }
        if (action.type === 'type' && selection?.nameFieldFocused === true && PLAIN_NAME(String(action.text ?? ''))) return null
      }
      state = { phase: 'idle' }
      return null
    },
    /** A pause, a take-over, a consent wait, the panel closing or a new one opening (D5). */
    drop() {
      state = { phase: 'idle' }
    },
  }
}

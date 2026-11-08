---
title: Panel folder source - knowing a file panel's folder without an Accessibility attribute
created: 2026-11-06T23:47:31Z
modified: 2026-11-07T01:08:11Z
level: L1
version: 0.3.5
description: CU-48 design note - where a file panel's destination folder could come from beyond Accessibility (the agent's own Go to Folder entry, the panel service's watched folders, a wider Accessibility walk, the app's saved defaults, the title or proxy), what each touches, and the proposal - a run-known folder from the agent's own Go to Folder, dropped by any navigation, checked against the panel's shown name
status: unverified
grounded_in:
  - source: CU-48 (cu-developer-three's browser-row measurement, helper 0.2.25-measure, 2026-11-05 16.26-16.28 PT)
  - source: file-panels.md 0.4.23 and D-047 (the folder shows only as display names, never used)
  - source: cu-coordinator's assignment, 2026-11-06 13.43 PT (a short design note first if it touches the helper or consent)
  - source: red team of 0.1.0 by cu-developer-one (consent owner) and cu-researcher, 2026-11-06 15.49 PT
  - source: D-058 (cu-coordinator, 2026-11-06 15.59 PT) - C first, then A
---

# Panel folder source (CU-48)

[File panels](file-panels.md) ask every `file_choice`. The question names the destination only when it is known.
Today it is known for a typed path: a name typed with a `/` or led by `~/` is resolved, and refused if `..` or a
protected place. A folder reached by navigating is asked as **unknown** (`folderKnown` false). The panel's name field,
`AXURL` and `AXDocument` hold no folder live, and the browser rows expose display names only. CU-48 walked them from
the `AXBrowser` down: 1,480 groups, no URL, path or filename attribute. D-047 keeps a display name from ever naming a
folder: two folders can share one, and it may be localized. That limit is named in the verdict. This note asks where
else the folder could come from.

**Decision (D-058).** C first, under D-047's measurement conditions: a branch-only build in one slot, main
reinstalled and verified back afterwards, names and booleans only, no owner content kept. If C finds a real file-URL
source, it is used and A is dropped. Otherwise A, as below. Unknown stays declined unattended. cu-verifier reviews
the test plan before any live run, and the limit leaves the verdict only after he judges it live.

## Candidates

| | Source | Touches | Verdict |
|---|---|---|---|
| A | The agent's own **Go to Folder** entry: agent core already sees the `⌘⇧G` and the typed path, and checks the path as it is typed | agent core; one read-only helper field (below); consent wording | **proposed** |
| B | The panel service's watched folders: the open vnode descriptors of `com.apple.appkit.xpc.openAndSavePanelService`, read with libproc | helper; another process's open files | only if A is refused and C finds nothing; remote panels only; ambiguous when it watches more than one folder |
| C | A wider Accessibility walk: the sidebar rows, the Where and path popups' menu items, the toolbar (CU-48 walked only the browser) | none until something is found | cheap: one inspect build (cu-developer-three); if an `AXURL` turns up, the limit falls without A |
| D | The app's saved defaults (`NSNavLastRootDirectory`) | reads `~/Library` | rejected: written after the commit, and another app's preferences |
| E | The window title, the document proxy | - | measured: the title is the app's ("Open", "Save"), there is no proxy, and `AXDocument` is empty |

## Proposal (A)

Order: C first. One inspect build, with no product change, settles whether the sidebar, the popups' menu items or
the toolbar carry an `AXURL`; A's code waits for it (cu-researcher).

1. **Arming.** In an attributed panel the agent opens Go to Folder (`⌘⇧G`). At that moment agent core reads the
   panel's shown folder name. The agent types a path and commits it with Return. Agent core resolves it as it does a
   typed name (`..` and protected places refused), then arms the folder only if all of these hold:
   - the path is canonical (symlinks resolved), exists and is a folder, found by one `stat` of that path, never a
     listing;
   - the path holds no `{{secret:...}}` placeholder;
   - the shown name read at `⌘⇧G` did **not** already equal the target's display name. If it did, the later check
     could not tell a Go to Folder that worked from one that failed, so the folder stays unknown.

   **The Go to Folder Return navigates; it is not a commit** (cu-developer-one, CU-139). Today any Return in a
   panel is asked as `file_choice`, so the person would approve "choose a file" for a navigation. The sheet's Return
   is not asked only on positive evidence that the Go to Folder field has it: it comes right after `⌘⇧G` and a
   typed path, inside an attributed panel, `nameFieldFocused` is false, **and** the focused element is a text input
   that is neither the name field nor the search field. `false` alone is not enough: if `⌘⇧G` opened no sheet,
   focus stays in the browser, the typed path becomes type-select, and Return presses Save, writing a file with the
   name field unfocused. An open panel has no name field, so there `nameFieldFocused` is always false: only the
   focused text input tells the Go to Folder sheet apart (cu-researcher). In an open panel, a sheet Return given a
   **file** path may open the file at once, so it is a commit and stays asked. It is asked as today ("destination
   unknown"), not naming the file: before that Return the panel still shows the old folder, so nothing can check the
   file (cu-developer-one). A folder path only navigates. Live on CU Fixture's open panel shows which. Any other Return - `nameFieldFocused` true (the path went
   into the name field), null (an older helper), a browser, list or search-field focus, or anything in between - is
   asked as today.
2. **Holding, as an allow-list.** Only two actions keep the folder: a `type` of a plain name (no `/`, not led by `~`
   or `.`) **while the panel's name field has focus**, and the commit itself (Return, or a click on the panel's commit
   button). Every other action drops it to unknown: any other keypress, click, scroll or drag; typing into the search
   field; type-select in the browser. That covers the panel's own shortcuts (`⌘D`, `⌘⇧H`, `⌘⇧O`, `⌥⌘L`, `⌘↑`,
   `⌘[`) without listing them, so macOS cannot add one the rules miss. A pause, a take-over or a consent wait drops it
   (D5, as for the last pointer), and so does a panel closing or a new one opening.
3. **Checking.** Before the commit, the panel's shown folder name must equal the held folder's display name: the
   Where popup for save, the path popup for open. If they differ, the folder is unknown. As shipped (CU-139), agent
   core takes the display name to be the held path's last component. Where macOS localises a folder's name or hides
   an extension, the two differ and the folder stays unknown: safe, a named limit. Should localised folders ever need
   to be known, the driver could return `FileManager.displayName` for the held path; the verdict does not need it. The display name checks a path the run already holds; it is never the source (D-047 amended: a
   display name may check, never name, a folder).
4. **Asking.**
   - **Save:** the `file_choice` request names the folder plus the typed name, canonical. A protected folder is
     refused as a typed path is.
   - **Open:** choosing the file needs a click or arrow keys, which drop the folder, and a Go to Folder Return given
     a file path cannot be checked before it commits (row 14). So A gives open panels nothing more yet: their
     destination stays unknown, as today, until a live read shows what that Return does.
   - The trajectory records `folderKnown: true, folderSource: 'go_to_folder'`.
5. **Unattended.** Unchanged: `file_choice` is declined unattended.

## Risks

- **Autocompletion**, the likeliest real mismatch. Go to Folder can leave a selected completion after the typed text,
  and Return accepts it: `~/Rep` lands in `~/Reports 2024`, or `~/Desktop/a` in `abc`. The armed path is then not
  where the panel went. The name check catches a different name; tests cover a completion to a sibling.
- **Same display name, different folder.** Arming refuses when the shown name already matches, so a failed Go to
  Folder cannot pass the check; any navigation afterwards drops the folder.
- **A person in the panel.** Local input pauses the run (D5), and the pause drops the folder.
- **Older helpers.** A helper without the shown name, or without the name field's focus, gives no check, so the
  folder stays unknown: today's behaviour.

## Test plan (for cu-verifier's review, before any live run)

**Fields** (agreed with cu-developer-three before code): `panelSelection` gains `shownFolderName` (the Where or path
popup's title, a string, or null when unreadable) and `nameFieldFocused` (true, false, or null when unknown). The
driver passes both through unchanged; an older helper's reply has neither, which agent core reads as no check.

**Dry run, on the fake helper and the dry-run world** (no desktop):

| # | Case | Expected |
|---|---|---|
| 1 | Go to Folder `~/Reports` + Return; shown name before was "Desktop", after "Reports"; Save | `file_choice` names `<home>/Reports/<typed name>`, `folderSource: 'go_to_folder'` |
| 2 | As 1, but the shown name was already "Reports" at `⌘⇧G` | unknown: no arming |
| 3 | As 1, but the path holds a `{{secret:...}}` placeholder, or does not exist, or is a file | unknown: no arming |
| 4 | As 1, then one of: a click, a double click, a scroll, a drag, `⌘↑`, `⌘D`, an arrow key | unknown at the commit: one test per action |
| 5 | As 1, then typing a plain name while `nameFieldFocused` is false (search field, type-select) | unknown |
| 6 | As 1, then a pause, a take-over or a consent wait | unknown |
| 7 | Autocompletion: armed `~/Rep`, the panel shows "Reports 2024" | unknown (name mismatch) |
| 8 | Open: Go to Folder given a file's full path, the panel shows its folder | `file_choice` names that file; with only a folder path, unknown |
| 9 | An older helper (no `shownFolderName`) | unknown, as today |
| 10 | A protected folder through Go to Folder | refused before any Return, as today |
| 11 | `⌘⇧G` opens no sheet, focus in the browser, a typed path, Return | asked as `file_choice` (Save would write) |
| 12 | Save: the Go to Folder Return (sheet field focused, `nameFieldFocused` false) | not asked; arms per rule 1 |
| 13 | Open: browser focus, Return (opens the selected file) | asked as `file_choice` |
| 14 | Open: the Go to Folder sheet given a file path, Return | asked as today (destination unknown: nothing can check the file before it); a folder path navigates, not asked |

Every row also asserts the trajectory: `folderKnown: true, folderSource: 'go_to_folder'` appear in rows 1 and 8 only;
in every other row the folder is unknown (`folderKnown` false, no `folderSource`), since a re-judge reads where a
folder came from there.

**Mutants, each must fail:**
- arming without the check at `⌘⇧G`;
- a deny-list hold, so that one of row 4's actions keeps the folder;
- ignoring `nameFieldFocused`;
- skipping the name check before the commit;
- treating a missing field as a match;
- the name check by prefix or containment instead of equality (row 7, `Rep` against "Reports 2024", is where that
  slip would pass);
- the Go to Folder Return passed on `nameFieldFocused` false alone, without the focused text input (rows 11 and
  13 must fail it: in an open panel `nameFieldFocused` is always false).

**Live, under an enforced hold, on CU Fixture's save and open panels:**
- rows 1, 2, 4 (a click), 7 and 8, and row 5 if CU Fixture's panel has a search field (row 6 needs a person, so it
  stays dry-run);
- row 14 on CU Fixture's open panel: what Return does after Go to Folder with a file path (opens at once, or
  selects), which settles whether that Return is a commit;
- unattended, every commit declined;
- names and booleans recorded, no owner content.

**Out of scope: replacing a file.** A Save into a folder where the name exists raises "already exists - Replace?".
Overwriting is destructive and is not covered by the `file_choice` already granted. Today a click on Replace is not
asked at all (`PANEL_COMMIT` does not match it), a gap in its own right, filed as CU-135: it becomes its own question,
or is refused. This note neither relies on it nor changes it.

## Needs

- **cu-coordinator:** approve A's consent meaning (the folder in the question comes from the agent's own entry,
  checked against the panel), and amend D-047 to allow "a display name as a check, never a source".
- **cu-developer-three:** C's inspect build first. Then two read-only fields of `panelSelection`: the shown folder
  name, and whether the name field has focus.
- **cu-developer-two:** the driver passes the field through; tests on the fake helper.
- **cu-developer-one:** agent core's panel-folder state (arm, including the read at `⌘⇧G`; hold; drop), with a
  mutant per drop rule.
- **Tests:** arming and each refusal to arm (shown name already equal, a placeholder, no such folder); every drop
  rule; typing outside the name field; a completion to a sibling; open with and without the file's full path; an
  older helper; a mutant for each.

# Save File Editor Specification

This document is the authoritative product and interaction contract for the `/trainer` and `/bag`
destinations. It refines the shared shell contract in issue #210 and uses the domain language in
`CONTEXT.md`.

Later decisions in issues #167, #168, #169, and #209 supersede the page-wide staging and local-view
language that remains in older issue history. The final destinations have no page-wide staged
state, Apply action, Cancel action, or route action bar.

## Scope

- **SAVEFILE-SCOPE-1:** The destination edits supported Save File-owned values in the active
  Workspace. It is not a Save File dashboard.
- **SAVEFILE-SCOPE-2:** The destination presents only the existing Trainer, Money, and Bag
  capabilities. New editable fields are separate work.
- **SAVEFILE-SCOPE-3:** The Pokemon Editor keeps its staged, atomic apply contract from ADR 0010.
  This specification does not change Staged Pokemon Edits.
- **SAVEFILE-SCOPE-4:** Export remains an app-wide command that serializes the current Workspace.
  Backup history and management remain in the Backup Browser.
- **SAVEFILE-SCOPE-5:** Emerald remains the only required Supported Save File for the current
  milestone. Other committed fixtures provide compatibility coverage without expanding that
  product guarantee.

## Content

- **SAVEFILE-CONTENT-1:** Trainer and Bag each show the original filename and game version once as
  the identity of the same active Workspace.
- **SAVEFILE-CONTENT-2:** Show Trainer name only as an editable Trainer field. Show Trainer ID and
  play time as read-only Trainer data. Omit generation and box count.
- **SAVEFILE-CONTENT-3:** Present Money after Trainer in the Trainer destination. Money remains a
  separate engine value and is not part of the Bag domain model.
- **SAVEFILE-CONTENT-4:** Present every supported Bag pocket in one grouped ledger. Each pocket has
  a heading, item count, Add Item control, and item list.
- **SAVEFILE-CONTENT-5:** Omit each unsupported field. Trainer presents only Trainer and Money
  capabilities. Bag presents only Bag capabilities. Do not alter the engine projection to select
  destination content.
- **SAVEFILE-CONTENT-6:** When the selected destination has no supported capability, show its empty
  state with the original filename, game version, explanation, and Back to Boxes action.
- **SAVEFILE-CONTENT-7:** Do not show normal Backup state, automatic Backup readiness, Dirty
  Workspace state, page-wide staged counts, or Export inside destination content.

## Layout and responsive composition

- **SAVEFILE-LAYOUT-1:** Render Trainer and Bag as separate production destinations through one
  shared presentation implementation. Do not retain a combined Ledger or a content switch inside
  either destination.
- **SAVEFILE-LAYOUT-2:** Each destination owns one definite internal layout area and internal
  scrollport inside the Safe Canvas. The document and shell do not scroll at supported Viewport
  Budget floors.
- **SAVEFILE-LAYOUT-3:** Trainer adapts Trainer fields, Trainer facts, and Money to its allocated
  container and shared Height Band. There is no combined Trainer and Bag leading-column layout.
- **SAVEFILE-LAYOUT-4:** Bag adapts pocket navigation and its grouped ledger to its allocated
  container and shared Height Band. There is no combined Trainer top block above Bag.
- **SAVEFILE-LAYOUT-5:** Select each destination's composition with local container queries. Do not
  classify viewport width, orientation, or device type.
- **SAVEFILE-LAYOUT-6:** The Bag ledger is the vertical scroll owner. Pocket headings remain sticky
  inside that scrollport and never cover the target under Controller Focus.
- **SAVEFILE-LAYOUT-7:** The pocket jump controls stay in one horizontally scrolling row in every
  composition. Moving Controller Focus scrolls a hidden control fully into view.
- **SAVEFILE-LAYOUT-8:** Activating a pocket jump scrolls the ledger to that pocket and keeps
  Controller Focus on the jump control.
- **SAVEFILE-LAYOUT-9:** Remove the route action bar and the route-owned `padding-bottom: 72px`.
  The shell alone owns navigation clearance and safe-area spending.
- **SAVEFILE-LAYOUT-10:** Remove `.mock-section`, `.mock-field`, `--mock-*`, and other prototype
  names from production Save File code.

## Design-system use

- **SAVEFILE-DESIGN-1:** Inherit the Short and Tall Height Bands, fixed semantic type scale, control
  sizes, and large-container type step from the shared shell contract.
- **SAVEFILE-DESIGN-2:** Use the shared fluid spacing unit and `--pksx-space-1` through
  `--pksx-space-4`. Use a named local token only when structural room cannot use that scale.
- **SAVEFILE-DESIGN-3:** Consume the four shared resolved safe-area aliases. Do not read bare
  `env(safe-area-inset-*)` values in the destination.
- **SAVEFILE-DESIGN-4:** Add shared tokens to production CSS before documenting them as current in
  `docs/design-system.md`. The implementation that adds the tokens updates that document in the
  same change.
- **SAVEFILE-DESIGN-5:** Use no Trainer avatar, item artwork, item imagery column, per-pocket item
  mark, or decorative glyph. Plus and minus may appear only as accessible operator controls.
- **SAVEFILE-DESIGN-6:** Format Money as a labelled value without a generic currency glyph.
- **SAVEFILE-DESIGN-7:** Show the filename on one visual line with ellipsis and preserve its full
  accessible text. Wrap item names to two lines, then clamp with ellipsis.
- **SAVEFILE-DESIGN-8:** Size Trainer name, Money, and quantity inputs from engine maxima with `ch`.
  Do not change type size to solve overflow.
- **SAVEFILE-DESIGN-9:** Labels and Add Item loading, count, error, and Retry text reflow. Do not
  hide them to make a row fit.

## Controller Focus

- **SAVEFILE-FOCUS-1:** Trainer and Bag each have one Focus Zone with independent session focus
  memory. Each zone contains vertical focus stops in its internal scrolling area. Left and Right
  move inside a row. Up and Down leave the row.
- **SAVEFILE-FOCUS-2:** Trainer orders Trainer rows before the Money row. Bag orders its pocket jump
  row before each pocket's Add Item command and item rows. Responsive composition does not change
  either order.
- **SAVEFILE-FOCUS-3:** The first supported editable control receives Controller Focus on the first
  visit to each destination. Trainer and Bag remember stable target identities independently for
  the session.
- **SAVEFILE-FOCUS-4:** From a pocket jump, Down enters that pocket at its first available target:
  Add Item, catalogue Retry, then the first item control. If none exists, use the next pocket with a
  target. Clamp when no pocket has a target.
- **SAVEFILE-FOCUS-5:** Each item row orders its controls as decrease quantity, quantity input,
  increase quantity, and Remove. The item name is not a Controller Focus target.
- **SAVEFILE-FOCUS-6:** Opening Add Item moves Controller Focus to its first input. Closing or
  cancelling it returns focus to that pocket's Add Item control.
- **SAVEFILE-FOCUS-7:** Opening Remove confirmation moves Controller Focus to Confirm. Confirm comes
  before Cancel. Cancelling returns focus to Remove.
- **SAVEFILE-FOCUS-8:** After removal, focus moves to the next item in the pocket, then the previous
  item, then Add Item. A missing remembered target uses the same next, previous, parent fallback.
- **SAVEFILE-FOCUS-9:** A target under Controller Focus is always fully visible inside the Safe
  Canvas and its scrollport. Height Band changes and rotation preserve target identity.
- **SAVEFILE-FOCUS-10:** In either destination, the no-active-Save-File state exposes Back to Boxes
  as its only stop. Initial load failure orders Retry before Back to Boxes. A route-wide editing
  failure makes Retry the first stop in that destination.
- **SAVEFILE-FOCUS-11:** After successful Retry, restore the remembered target when it still exists,
  otherwise use the first supported editable control.

## Direct edit contract

- **SAVEFILE-EDIT-1:** Trainer name and typed Money use a local field draft. Enter, soft-keyboard
  Done, or valid blur commits a changed value. Escape or controller B abandons the draft, consumes
  that input, and keeps Controller Focus on the field.
- **SAVEFILE-EDIT-2:** Selecting a complete stored value, such as Trainer gender, commits at once.
  A selector that only configures a later command does not mutate the Workspace.
- **SAVEFILE-EDIT-3:** Money and quantity operators commit once per activation. If the field has a
  valid typed draft, the operator consumes it and produces one combined commit.
- **SAVEFILE-EDIT-4:** Add Item holds item and quantity in one local command draft. Add commits them
  atomically.
- **SAVEFILE-EDIT-5:** Remove opens an inline confirmation. Confirm Remove performs the mutation.
  Cancel, Escape, or controller B abandons it.
- **SAVEFILE-EDIT-6:** At most one Add Item or Remove command is open in Bag. Opening a different
  command discards the unfinished command without warning. Pending confirmed mutations remain
  independent.
- **SAVEFILE-EDIT-7:** An unfinished command is discarded without warning when it closes or the
  route closes. A failed Add or Remove command remains available for retry only while it stays open.
- **SAVEFILE-EDIT-8:** A value equal to the latest accepted engine projection is a no-op. It creates
  no engine call, pending state, Backup, persistence write, or Dirty Workspace change.
- **SAVEFILE-EDIT-9:** Every successful commit displays the projection returned by the PKHeX
  Engine.

## Mutation, Backup, persistence, and Export

- **SAVEFILE-EDIT-10:** A Save File edit coordinator outside the route serializes confirmed edits
  FIFO for each Save File and Workspace identity. It is not a generic Workspace operation bus.
- **SAVEFILE-EDIT-11:** Each operation runs against the latest persisted Workspace. Other fields and
  navigation remain available while an operation is pending.
- **SAVEFILE-EDIT-12:** Remounting Trainer or Bag reconstructs its local pending state from the
  coordinator. The coordinator rejects results for a different Save File or Workspace identity.
- **SAVEFILE-EDIT-13:** Create one idempotent automatic Backup per Workspace immediately before the
  first valid operation expected to change bytes. Invalid drafts and known no-ops create none.
- **SAVEFILE-EDIT-14:** The Backup uses a stable identity and a generic Save File editing reason. An
  interrupted retry reconciles the durable Backup instead of creating another.
- **SAVEFILE-EDIT-15:** Backup failure prevents queued mutations for that origin. Persistence
  failure discards unpersisted engine output and cancels later queued mutations for that origin.
- **SAVEFILE-EDIT-16:** Export waits for confirmed queued mutations, then serializes their resulting
  Workspace. It never consumes an unconfirmed draft or creates a hidden mutation.
- **SAVEFILE-EDIT-17:** Deleting a Save File is its terminal queued operation. Confirmed mutations
  finish first. Deletion then removes the Save File, Workspace, and Backups and accepts no later
  operation for that origin.
- **SAVEFILE-EDIT-18:** App termination preserves only persisted commits. Local drafts and incomplete
  operations are not restored, and the route has no unload warning.

## Feedback and unavailable states

- **SAVEFILE-FEEDBACK-1:** A successful direct commit shows no Toast. The changed value is its
  confirmation.
- **SAVEFILE-FEEDBACK-2:** A pending field or item shows `Saving...`, exposes `aria-busy`, and blocks
  repeat activation only for the affected control.
- **SAVEFILE-FEEDBACK-3:** A rejected value remains visible while its field stays in edit mode. Show
  local validation, set `aria-invalid`, connect the error with `aria-describedby`, and announce it
  politely.
- **SAVEFILE-FEEDBACK-4:** Invalid blur, Escape, or controller B restores the last accepted value.
  Keep the error until the control changes again or its local command closes.
- **SAVEFILE-FEEDBACK-5:** An isolated PKHeX Engine, Backup, or storage failure restores the persisted
  value and shows one error Toast that names the affected field or item.
- **SAVEFILE-FEEDBACK-6:** If editing becomes unavailable for a destination, keep its loaded values
  visible, disable editing, and show Retry as durable route content. Navigation stays available.
- **SAVEFILE-FEEDBACK-7:** Initial load failure replaces the editor with Retry and Back to Boxes. No
  active Save File is a normal empty state, not an error.
- **SAVEFILE-FEEDBACK-8:** Bag catalogue loading, available count, failure, and Retry stay beside Add
  Item. Catalogue failure disables only item addition. Quantity and removal editing remain
  available.
- **SAVEFILE-FEEDBACK-9:** Export success and failure use Toasts. Toasts never take Controller Focus
  or block input.

## Accessible structure

- **SAVEFILE-ACCESS-1:** Each Bag pocket is a named section with a heading and item list. Do not use
  table semantics for the interactive ledger rows.
- **SAVEFILE-ACCESS-2:** Every operator symbol has an accessible action name. Every field, error,
  pending state, Retry action, and confirmation has a programmatic name or association.
- **SAVEFILE-ACCESS-3:** Sticky headings and visual truncation do not remove full accessible names or
  obscure the target under Controller Focus.

## Verification

- **SAVEFILE-TEST-1:** Unit tests for the coordinator cover FIFO ordering, concurrent fields,
  Save File and Workspace identity, no-ops, one Backup with retry and failure, persistence rollback,
  cancellation of later operations, Export waiting, and terminal deletion.
- **SAVEFILE-TEST-2:** Presentation tests cover the separate Trainer and Bag roots, independent
  semantic focus order and scroll ownership, focus fallback, pocket jumps, focused-target
  visibility, omitted capabilities, filename overflow, two-line item names, one open Bag command,
  and the absence of route action-bar, mock, and imagery residue.
- **SAVEFILE-TEST-3:** Real-fixture browser tests cover Trainer and Money commit boundaries, Bag Add,
  quantity, and Remove behavior, local validation, pending state, no-op behavior, silent success,
  failure recovery, Retry, and Toast delivery.
- **SAVEFILE-TEST-4:** Extend the PKHeX Engine browser suite with an editor-capability matrix for
  every unique full Save File that the suite already parses. Record support for Trainer name,
  Trainer gender, Money, Bag pockets, and the item catalogue across Generations 3 through 9.
- **SAVEFILE-TEST-5:** Run the complete editor path with Emerald. Add representative route coverage
  for one public Generation 6 or 7 fixture, one discovered unsupported-capability fixture, and one
  Generation 8 or 9 fixture.
- **SAVEFILE-TEST-6:** Use committed personal fixtures for capability and interaction checks without
  exposing personal Trainer values in test names, screenshots, or golden text. Prefer public MIT
  fixtures for visual evidence.
- **SAVEFILE-TEST-7:** Copy fixture bytes before mutation. Use the PKHeX Engine to produce valid
  boundary states when possible. Use deterministic projection builders only for layout or failure
  states that existing fixtures cannot provide. Do not commit edited personal fixtures.
- **SAVEFILE-TEST-8:** If the capability matrix finds no useful unsupported case or later-generation
  editor case, create a focused fixture-curation issue before the implementing issue closes.
- **SAVEFILE-TEST-9:** Feature issues own focused tests. Issue #222 owns final Save File shell
  integration, #223 owns the complete browser and Viewport Budget matrix, and #224 owns real Android
  keyboard and rotation checks.

## Implementation sequence

1. Shared Height Band, density, spacing, and safe-area tokens land through issue #212.
2. Shared Toast infrastructure is separated from the app-wide audit in issue #80.
3. The Save File edit coordinator and Ledger layout may land in parallel.
4. Trainer and Money direct editing depends on the coordinator, Ledger, and shared Toast work.
5. Bag direct editing depends on the coordinator, Ledger, and shared Toast work.
6. Issue #222 integrates the completed Trainer and Bag destinations with the final shell and Focus
   Zone contract.
7. Issues #223, #224, and #225 finish browser, native, and static-policy enforcement.

The Save File implementation issues belong to the shell implementation set under issue #210. They
block issue #222 and link to issue #170 and this specification. They are not children of the completed
design map in issue #163.

## Related work

- Issue #80 owns the app-wide feedback audit. Its shared Toast prerequisite must serve every
  destination and must not create a Save File-only Toast system.
- Issue #146 concerns Original Trainer display IDs in the Pokemon Editor. It is separate and does
  not block this destination.
- Issue #150 guards Workspace persistence against silently dropping new fields. It is non-blocking
  unless implementation changes the stored Workspace shape.
- The PKHeX Engine currently offers later-generation items to the Emerald Bag catalogue. Track that
  as a separate non-blocking bug and do not expand the destination overhaul into catalogue work.

## Decision sources

- Issue #163, Save File page overhaul map
- Issues #164 through #169 and #209, Save File decisions and prototype
- Issues #201 and #202, Focus Zone and inherited Save File shell rules
- Issue #210, shared controller-first responsive shell contract
- ADR 0010, engine-backed Pokemon Editor apply contract
- ADR 0012, durable state and Toast feedback
- ADR 0013, Height Band model
- ADR 0015, fixed type scale and container-height density

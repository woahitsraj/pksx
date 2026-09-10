# Design contract and enforcement

This record assembles the locked controller-first shell decisions from [the design map](https://github.com/woahitsraj/PKSX/issues/151) and [the consolidated specification](https://github.com/woahitsraj/PKSX/issues/210). Implementations, tests, and lint diagnostics cite the stable identifiers below. [CONTEXT.md](../../CONTEXT.md) remains the authority for domain language. The authority order below governs relationships changed by later owner decisions. The linked ADRs retain architectural rationale, so this record states the resulting contract without repeating it.

## Authority and amendments

[Assembly issue #207](https://github.com/woahitsraj/PKSX/issues/207) owns this document. Apply later owner decisions over earlier wording in this order:

- [#156](https://github.com/woahitsraj/PKSX/issues/156) permits the overlay Main Menu control, and [#177](https://github.com/woahitsraj/PKSX/issues/177) removes the Boxes hint row and fixes the Menu vocabulary.
- [#196](https://github.com/woahitsraj/PKSX/issues/196) replaces the historical 63px floor Slot estimate with 58 to 59px and replaces percentage Tall Takeover bounds with a 760 by 560 maximum.
- [#201](https://github.com/woahitsraj/PKSX/issues/201) consolidates Focus Zones, makes Party a Location, generalizes vanished-zone recovery, and defines the Main Menu launcher exception.
- [#203](https://github.com/woahitsraj/PKSX/issues/203) adds the large-container type step to the otherwise fixed type ladder. [#212](https://github.com/woahitsraj/PKSX/issues/212) owns the corresponding wording correction to [ADR 0015](../adr/0015-fix-the-type-scale-and-scale-room-by-container-height.md).
- [#167](https://github.com/woahitsraj/PKSX/issues/167) and the resolved [#209](https://github.com/woahitsraj/PKSX/issues/209) supersede the page-wide Save File staging inherited by #202, #164, and the original SAVEFILE-1 wording in #210. Their direct-commit contract applies only to Trainer, Money, and Bag. [ADR 0010](../adr/0010-use-engine-backed-pokemon-editor-apply-contract.md) continues to govern Pokemon Editor staging and atomic Apply.
- [#169](https://github.com/woahitsraj/PKSX/issues/169) selects the Ledger direction. [#170](https://github.com/woahitsraj/PKSX/issues/170) owns its detailed specification and implementation issue breakdown.
- The 2026-09-10 amendments to [#151](https://github.com/woahitsraj/PKSX/issues/151), [#207](https://github.com/woahitsraj/PKSX/issues/207), and [#210](https://github.com/woahitsraj/PKSX/issues/210) replace the combined Save File destination with Trainer and Bag, make Pokemon Storage a focusable Saves card and collection-picker option, rename Open another, set the editable-text floor, and reserve Search. They supersede every conflicting line above, in the earlier decision tickets, and in historical CONTEXT.md relationships. CONTEXT.md remains authoritative for vocabulary.

<a id="budget-1"></a>

## BUDGET-1: viewport and support

Source: [#152](https://github.com/woahitsraj/PKSX/issues/152), with shared safe-area aliases from [#165](https://github.com/woahitsraj/PKSX/issues/165) and Slot measurements amended by [#196](https://github.com/woahitsraj/PKSX/issues/196).

The raw viewport is the published and testable input. Layout operates inside the Safe Canvas after runtime safe-area insets are removed. Shell and screen padding spend the Safe Canvas.

| Case             | Raw viewport | Safe Canvas | Role                                  |
| ---------------- | -----------: | ----------: | ------------------------------------- |
| Landscape floor  |      640×360 |     616×336 | Native survival guarantee             |
| Landscape target |      640×480 |     640×456 | Density tuning                        |
| Portrait floor   |      360×640 |     360×544 | Native and browser survival guarantee |
| Portrait target  |      393×852 |     393×759 | Density tuning                        |

The supported aspect range is continuous from 0.44 to 2.33. Width is a refinement input and never selects an app-wide mode. At supported floors and targets, the document, shell, and active screen do not scroll. A specified destination or Takeover scrollport may scroll internally. Keyboard-open is outside the floor no-scroll and co-visibility guarantee; the focused target and workflow state must remain visible and stable while the keyboard is open.

At the 616×336 landscape Safe Canvas, the active Box's 30 Slots, its collection control, and the Active Slot Detail Rail are simultaneously visible. The Slots measure 58 to 59px with 1px rounding tolerance. At viewports below the floor, scrolling is permitted, every destination and surviving target remains reachable, and the app shows neither a warning gate nor a blank screen.

Every edge-anchored element uses resolved safe-area aliases and combines the inset with its design spacing. The app-level stylesheet owns these aliases, which prefer the platform-provided custom property and unconditionally fall back to `env(..., 0px)` on every platform. Zero remains a legitimate resolved inset.

```css
--pksx-safe-area-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
--pksx-safe-area-right: var(--safe-area-inset-right, env(safe-area-inset-right, 0px));
--pksx-safe-area-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
--pksx-safe-area-left: var(--safe-area-inset-left, env(safe-area-inset-left, 0px));
```

Landscape is guaranteed on native builds. Portrait is also guaranteed in browser tabs. Runtime code remains cause-agnostic and does not branch on the distribution channel.

<a id="budget-2"></a>

## BUDGET-2: fixed platform baseline

Source: [#161](https://github.com/woahitsraj/PKSX/issues/161) and [ADR 0011](../adr/0011-derive-platform-floors-from-one-browser-baseline.md).

The fixed browser baseline is Safari/WebKit 26, Chromium 140, and Firefox 151. It derives native floors of iOS 26 and Android 10/API 29. It is a locked product decision rather than a rolling latest-version policy. Android WebView updates independently of Android, so the safe-area fallbacks in BUDGET-1 remain required at the Android OS floor.

<a id="shell-1"></a>

## SHELL-1: zero reserved chrome

Source: [#155](https://github.com/woahitsraj/PKSX/issues/155), amended by [#156](https://github.com/woahitsraj/PKSX/issues/156) and [#177](https://github.com/woahitsraj/PKSX/issues/177), with state ownership in [ADR 0012](../adr/0012-draw-durable-state-in-place.md).

The shell reserves zero height and zero width for chrome in every layout. Remove the persistent header, bottom navigation, status strip, fake search, and Boxes hint row. A region repeated on every route counts as shell chrome even when declared by a destination.

The Main Menu control overlays content at rest and reserves no layout. Durable state renders on the object that owns it: Carry follows Controller Focus and busy state appears on the affected region. Transient outcomes use Toasts. Dirty Workspace has no ambient indicator because normal persistence restores it. Backup Restore and active Save File deletion warn at the point where they can destroy it.

<a id="nav-1"></a>

## NAV-1: destinations and Main Menu summon

Source: [#156](https://github.com/woahitsraj/PKSX/issues/156), using the final vocabulary from [#177](https://github.com/woahitsraj/PKSX/issues/177), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210). [#216](https://github.com/woahitsraj/PKSX/issues/216) owns the current Main Menu implementation, and [#254](https://github.com/woahitsraj/PKSX/issues/254) and [#255](https://github.com/woahitsraj/PKSX/issues/255) own Search.

Boxes, Trainer, Bag, Saves, and Settings are routed destinations. Trainer owns Trainer fields and Money. Bag owns inventory pockets and item commands. Boxes is home. A first run with no Save Files and empty Pokemon Storage lands on Saves.

Until Search ships, the Main Menu order is Boxes, Trainer, Bag, Saves, Settings, Backup Browser. Every rendered entry remains present and selectable. Trainer and Bag remain selectable without an active Save File and explain why their data is unavailable. Backup Browser is globally scoped to the active Save File.

Reserve Search's insertion point immediately after Boxes and reserve a controller shortcut as a Navigation Action. Do not assign a physical controller input to that action here, reuse its intended input for another command, or render Search before #254 implements Quick Search. Search opens in Quick Search mode. #255 adds Advanced Search inside the same workflow.

Start toggles the Main Menu using a synthetic key ordinary typing cannot produce. Cmd/Ctrl+K opens it from the keyboard. The unlabelled pointer control opens it for touch and pointer input. The opener is visible and active at rest, then hidden and inert during Carry or while any Menu or Takeover is open.

<a id="nav-2"></a>

## NAV-2: Back and destination memory

Source: [#156](https://github.com/woahitsraj/PKSX/issues/156), amended by [#201](https://github.com/woahitsraj/PKSX/issues/201).

Back first dismisses the current Menu or Takeover through that workflow's guards. With no summoned workflow, controller B returns to Boxes. Browser Back and Android platform Back follow route history.

Dismissing the Main Menu restores its exact launching focus. Choosing the current destination has the same effect as dismissal. Choosing another entry closes the Main Menu permanently. It is a launcher, not a parent in the replacement chain. A Backup Browser opened from it returns to the focus target from which the Main Menu was summoned.

Each destination remembers a valid Controller Focus target for the session. Memory does not survive reload.

<a id="resp-1"></a>

## RESP-1: one Height Band authority

Source: [#157](https://github.com/woahitsraj/PKSX/issues/157) and [ADR 0013](../adr/0013-drive-responsive-layout-from-one-height-band.md).

One app-level CSS authority selects Short below 560 raw CSS pixels and Tall at or above 560, and exposes that choice as an inherited value. Short is the constrained-first base. Screens, Takeovers, and components consume the inherited band through container style queries or the named `tall:` variant. They do not repeat the threshold.

Width, aspect, orientation, and safe-area padding never select an app-wide mode. Definite-size screen and Takeover containers may refine composition with local width, height, or aspect container queries tied to a concrete fitting constraint. Height Band changes presentation only. Semantic structure, destinations, Focus Zones, and Controller Focus transitions remain stable.

<a id="resp-2"></a>

## RESP-2: editable-focus lock and rotation

Source: [#204](https://github.com/woahitsraj/PKSX/issues/204), completing the editable-focus rule from [#157](https://github.com/woahitsraj/PKSX/issues/157).

The sole bounded script behavior captures the current inherited Height Band before an editable control can trigger keyboard resize. The lock survives focus movement between editable controls. Aspect composition still reflows, DOM focus and the local draft survive, and content may scroll internally. When editing ends, the lock releases and the band is computed once from the current viewport.

Native rotation is never locked or triggered by navigation. It preserves destination, pane count and identity, each pane's Box Source and Location, active pane and Box, Controller Focus, Carry, and summoned workflow state. Focus remains bound to identity and is scrolled only enough to stay visible. Input remains live.

Panes reflow side by side when wider than tall and stacked when square or taller than wide. The square form also gives Menus the bottom edge and the Pokemon Editor a top rail. There is no rotation lifecycle, hysteresis, or debounce.

<a id="density-1"></a>

## DENSITY-1: semantic tokens

Source: [#196](https://github.com/woahitsraj/PKSX/issues/196) and [ADR 0015](../adr/0015-fix-the-type-scale-and-scale-room-by-container-height.md), with the type amendment in LARGE-1.

| Token                                    | Contract                                                  |
| ---------------------------------------- | --------------------------------------------------------- |
| caption / label / body / title / display | 10 / 12 / 13 / 16 / 24px                                  |
| tight / body line height                 | 1.05 / 1.25                                               |
| text families                            | sans for text; mono for numerals, captions, and filenames |
| standard control                         | `clamp(32px, 9.4cqh, 44px)`                               |
| small control                            | 0.75 × standard control, clamped to 24–33px               |
| icon / small icon                        | 16 / 12px                                                 |
| spacing unit                             | `clamp(2px, 0.9cqh, 6px)`                                 |
| spacing scale                            | one through four times the unit                           |
| small / medium / large radius            | 4px / 4px plus one unit / 6px plus 1.5 units              |
| border                                   | 1px                                                       |
| focus ring                               | `clamp(2px, 0.6cqh, 3px)`                                 |

Register inherited token properties so container-relative lengths compute at the screen or Takeover that owns the density. Density never reads Height Band. Slots, cards, icon-only controls, and composition-owned surfaces are explicit custom categories rather than standard controls.

Every editable `input`, `select`, `textarea`, combobox input, and `contenteditable` control has a computed font size of at least 16px. Implement the shared floor unconditionally rather than classifying a mobile viewport or device. Labels and non-editable compact text retain their semantic tokens.

<a id="density-2"></a>

## DENSITY-2: Slots and sprite degradation

Source: [#196](https://github.com/woahitsraj/PKSX/issues/196).

Slots never shrink below 44px. The pane scrolls before further shrinkage. Slot text responds to the Slot's own dimensions: name and level display above 66px, the index displays above 46px, then the Sprite Catalog image fills the remaining presentation as labels disappear. Render the offline pixelated PNG at 78 to 92 percent of the Slot according to label state.

The 616×336 landscape Safe Canvas produces 58 to 59px Box Slots. The earlier 63px figure was measured against the raw viewport and is not an acceptance value.

<a id="large-1"></a>

## LARGE-1: bounded larger containers

Source: [#203](https://github.com/woahitsraj/PKSX/issues/203). This section amends the fixed-everywhere wording in [#196](https://github.com/woahitsraj/PKSX/issues/196) and ADR 0015. [#212](https://github.com/woahitsraj/PKSX/issues/212) owns the ADR wording update.

At an allocated container size of at least 900×700, step the type ladder once to 11/13/15/18/28px. Both dimensions must meet the threshold. This is a container refinement, not a viewport mode or Height Band.

Center bounded Boxes compositions in the Safe Canvas. Cap a single Box Pane at 800px and the Active Slot Detail Rail at 260px. In an explicitly opened two-pane composition, cap each pane at 640px around the same rail. Cap Saves at 1200px and four columns, keeping it top-aligned. Tall Takeovers have a 760×560 maximum.

A large canvas never opens another pane automatically and never adds desktop-only actions.

<a id="surface-1"></a>

## SURFACE-1: one visible summoned workflow

Source: [#158](https://github.com/woahitsraj/PKSX/issues/158), refined by [#196](https://github.com/woahitsraj/PKSX/issues/196), and recorded in [ADR 0014](../adr/0014-present-summoned-surfaces-as-menus-and-takeovers.md).

One owner manages Menus, Takeovers, replacement state, and focus return.

- Menus include Slot Menu, Box Menu, Main Menu, Save File Menu, and standalone two-command confirmations. They attach to the trailing edge when wider than tall and the bottom edge when square or taller than wide, over an inert Backdrop.
- Takeovers include Pokemon Editor, Pokemon Creation, Legality Report, evolve and Legality Fix previews, and Backup Browser. A Short Takeover fills the Safe Canvas. A Tall Takeover uses all available room until bounded by 760×560.
- Toasts appear bottom-trailing above safe-area insets. They never take Controller Focus or block input.

The Active Slot Detail Rail is persistent Boxes layout, never a summoned surface.

<a id="surface-2"></a>

## SURFACE-2: replacement and dismissal

Source: [#158](https://github.com/woahitsraj/PKSX/issues/158), [#162](https://github.com/woahitsraj/PKSX/issues/162), and [#201](https://github.com/woahitsraj/PKSX/issues/201).

At most one Menu or Takeover is visible. A Takeover presents confirmations as internal states. Object workflows replace their launcher and restore the chain with Controller Focus bound by identity, including Slot Menu to confirmation and Pokemon Editor to Legality Report. If the launching Pokemon Action disappears, close its Slot Menu and return focus to the surviving Slot.

A Backdrop tap is exactly one Back press and inherits every workflow guard. Dismissal controls live inside the summoned content. NAV-2 defines the Main Menu launcher exception.

<a id="boxes-1"></a>

## BOXES-1: composition

Source: [#159](https://github.com/woahitsraj/PKSX/issues/159), consolidated by [#151](https://github.com/woahitsraj/PKSX/issues/151) and [#201](https://github.com/woahitsraj/PKSX/issues/201).

Boxes starts with one reusable Box Pane beside the Active Slot Detail Rail when wider than tall and above it when square or taller than wide. A user explicitly opening another collection creates two Box Panes around pointer-only transfer controls and the shared display-only detail summary. The two panes reflow between side-by-side and stacked arrangements and never collapse because the canvas changed.

A Box is always a 6×5 grid. Party is a 3×2 Location in the same Box Pane rather than a separate permanent Focus Zone. Each pane owns its collection control, Box Name and Location display, and pointer-only previous and next controls. Collection labels show the concrete Save File name or Pokemon Storage, never the glossary-only term Box Source.

The Active Slot Detail Rail reflects the Slot under Controller Focus, including an empty Slot, and never takes Controller Focus.

<a id="boxes-2"></a>

## BOXES-2: Box Menu

Source: [#177](https://github.com/woahitsraj/PKSX/issues/177), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210). [#215](https://github.com/woahitsraj/PKSX/issues/215) and [#218](https://github.com/woahitsraj/PKSX/issues/218) own implementation.

X from a Box Pane, or A, tap, or click on its collection control, opens that active pane's Box Menu. B or X closes it. Entries stay in this fixed order:

1. Export
2. Save a backup
3. Switch
4. Open another collection
5. Close

Unavailable entries remain visible and explain why without executing. Pokemon Storage disables Export and Save a backup. The active Save File's pane disables Switch and Close and directs the user to select another active Save File from Saves. That restriction belongs to this Box Menu only and does not prevent choosing Pokemon Storage in Saves. Export writes Workspace bytes. Save a backup invokes the existing manual Backup behavior.

The Switch and Open another collection pickers list available Save Files and Pokemon Storage as peer collections. Their labels and command availability keep Pokemon Storage distinct as app-owned, immediately persisted data. Selecting Pokemon Storage in Open another collection opens it in the second Box Pane with its own Location and focus identity.

Y has no rest action and toggles move or copy only during Carry. The Box Menu is inert during Carry or another summoned workflow.

<a id="focus-1"></a>

## FOCUS-1: shared rules

Source: [#162](https://github.com/woahitsraj/PKSX/issues/162), [#201](https://github.com/woahitsraj/PKSX/issues/201), and the focus relationships in [CONTEXT.md](../../CONTEXT.md).

Controller Focus remains independent of browser DOM focus and binds to a Slot or control identity, never a Pokemon Entity or screen coordinate. One visible Slot highlight drives the Active Slot Detail Rail. There is no separate selected Slot.

Keyboard and gamepad produce the same Navigation Actions. Held directional actions repeat after an initial delay. Every non-directional command requires a fresh press. Slot collections expose grid semantics, and browser keyboard navigation reaches major interactive regions.

Pointer-only controls perform actions without taking Controller Focus, including pane arrows, the Main Menu control, transfer controls, and Saves card trailing controls. Clicking a Slot moves Controller Focus to it without opening the Slot Menu.

<a id="focus-2"></a>

## FOCUS-2: Box Pane transitions

Source: [#201](https://github.com/woahitsraj/PKSX/issues/201).

One Box Pane is one Focus Zone containing its collection control and the Slots in its current Location.

| From               | Input           | Result                                                               |
| ------------------ | --------------- | -------------------------------------------------------------------- |
| Top-row Slot       | Up              | Collection control                                                   |
| Collection control | Down            | Remembered coordinate, clamped to the current Location               |
| Collection control | Left, Right, Up | Clamp                                                                |
| Slot               | Direction       | Neighboring Slot, clamped unless an explicit pane transition applies |
| Bottom-row Slot    | Down            | Clamp when no stacked-pane transition applies                        |
| Anywhere in pane   | L1/R1           | Previous/next Location, preserving and clamping coordinate           |
| Slot               | A               | Slot Menu                                                            |
| Anywhere in pane   | X               | Box Menu                                                             |

For a Save File with a Party, L1/R1 wrap through Party, Box 1 through Box N. Pokemon Storage has no Party stop. Shoulders used on the collection control change Location while focus remains on the control.

In side-by-side panes, moving outward from the facing horizontal edge crosses to the opposite pane's facing edge at the same clamped row. This is column 5 for a Box and column 2 for Party on the leading pane, with the inverse on the trailing pane. In stacked panes, moving outward from the facing vertical edge crosses to the opposite pane's facing edge at the same clamped column. This is row 4 for a Box and row 1 for Party on the upper pane, with the inverse on the lower pane. Rows and columns clamp when the Locations differ. The cross-pane transition takes precedence at the shared edge. Collection controls do not connect across panes. The pane holding focus is active.

<a id="focus-3"></a>

## FOCUS-3: mutation results, disappearance, and Carry

Source: [#162](https://github.com/woahitsraj/PKSX/issues/162), completed by [#201](https://github.com/woahitsraj/PKSX/issues/201).

A Slot Action with a destination finishes on its destination Slot. Clear Slot leaves focus on its now-empty source Slot. When a pane or Focus Zone disappears, focus moves to the surviving active Box Source's current Location at the same coordinate, clamped, for every input kind.

Carry confines focus to Slots, including cross-pane and shoulder transitions, and skips collection controls. An invalid destination Slot may receive focus without becoming a valid operation. A attempts completion, B cancels and returns to the source Slot, and Y toggles move or copy. All Menus remain inert. Existing Slot Swap, empty-copy-destination, Backup, and atomic-write behavior remains authoritative.

<a id="focus-4"></a>

## FOCUS-4: destination and workflow ownership

Source: [#201](https://github.com/woahitsraj/PKSX/issues/201), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210). [#216](https://github.com/woahitsraj/PKSX/issues/216) and [#219](https://github.com/woahitsraj/PKSX/issues/219) own destination implementation.

Opening a Menu or Takeover suspends destination Focus Zones. A Menu owns one list. A Takeover owns its internal Focus Zones and starts from its initial target each time it opens.

| Destination or Takeover | Initial focus                                       |
| ----------------------- | --------------------------------------------------- |
| Boxes                   | Active pane, current Location, Slot 0               |
| Saves                   | Active Save File, else first Save File, else Import |
| Settings                | Theme control                                       |
| Trainer                 | First stop                                          |
| Bag                     | First stop                                          |
| Pokemon Editor          | First section                                       |
| Backup Browser          | Newest Backup                                       |
| Pokemon Creation        | First stop                                          |

Destinations remember their targets for the session and validate them with FOCUS-3 on return. Trainer and Bag retain independent memories. Takeovers have no memory across closures.

<a id="editor-1"></a>

## EDITOR-1: layout and section navigation

Source: [#160](https://github.com/woahitsraj/PKSX/issues/160), amended by [#196](https://github.com/woahitsraj/PKSX/issues/196) and [#201](https://github.com/woahitsraj/PKSX/issues/201).

The Pokemon Editor is a Takeover with a compact identity row, a persistent 11-section rail, a content pane, and an Apply area. When wider than tall, the rail is 148px wide on the leading edge. When square or taller than wide, it becomes a horizontally scrolling top row. Every section remains present and reachable.

The rail and content pane are two Focus Zones. Moving along the rail changes the shown section while retaining rail focus. A enters that section's first stop. From content, Left at the first column reaches the side rail, or Up at the first stop reaches the top rail. L2/R2 page sections from anywhere in the Editor. B dismisses or invokes the discard confirmation and never moves between the zones.

The densest IV/EV section fits the landscape floor with token-backed 32px standard controls, 12px labels, 10px column headers, and the 16px editable-control floor from DENSITY-1.

<a id="editor-2"></a>

## EDITOR-2: staged atomic edits

Source: [#160](https://github.com/woahitsraj/PKSX/issues/160) and [ADR 0010](../adr/0010-use-engine-backed-pokemon-editor-apply-contract.md).

Mark staged sections and fields. The staged-count chip opens a delta list inside the content pane. Review and Apply remain within the Pokemon Editor. Pokemon Edit Validation appears by Apply, identifies the affected field, and pairs disabled Apply with its reason when validation blocks the operation.

Apply keeps ADR 0010's explicit atomic write, Pokemon Editor Source identity check, unsupported-edit rejection, Backup prerequisites, and retention of rejected or failed Staged Pokemon Edits. Legality Report replaces the Editor Takeover and restores its state on return. Leaving through B, Close, or Backdrop with staged edits enters an inline discard confirmation. Leaving without staged edits dismisses directly.

<a id="saves-1"></a>

## SAVES-1: contents and layout

Source: [#180](https://github.com/woahitsraj/PKSX/issues/180), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210). [#219](https://github.com/woahitsraj/PKSX/issues/219) owns implementation.

Saves contains cartridge-style Save File cards, a Pokemon Storage collection card, and Import. Pokemon Storage shows Pokemon and Storage Box counts and identifies that PKSX owns and automatically persists it. It remains visibly and behaviorally distinct from a Save File. Saves does not contain the Backup Browser or Box Source switching. Backup Browser remains globally accessible and scoped to the active Save File.

The title stays fixed while the card grid owns overflow. Cards have a 240px minimum width and at most four columns. The landscape floor uses two columns and the portrait floor uses one. Four grid targets fit fully at 616×336. A fifth target starts grid scrolling. Pokemon Storage counts as a grid target at every floor, target, and large-grid case.

Each Save File card shows game title, Trainer name, original filename, active state, box count, and Pokemon count. Omit Party preview, Trainer ID, generation, play time, import year, and last-opened metadata.

<a id="saves-2"></a>

## SAVES-2: actions and states

Source: [#180](https://github.com/woahitsraj/PKSX/issues/180), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210) and [#250](https://github.com/woahitsraj/PKSX/issues/250). [#219](https://github.com/woahitsraj/PKSX/issues/219) owns implementation.

Saves has one grid Focus Zone with one target per Save File, Pokemon Storage, and Import. Directional movement follows grid coordinates, clamps at edges, and preserves the nearest column in an incomplete row. A, tap, or click activates a Save File and opens Boxes. Confirming Pokemon Storage opens Boxes in its normal single-pane composition with Pokemon Storage active and Controller Focus on its current Location. This explicit route action does not invoke a Box Menu picker or open a second pane. Viewport changes never add a pane automatically.

X from a Save File, or its browser-accessible trailing control, opens the fixed Save File Menu with Open Trainer, Open Bag, and Delete from Saves. Open Trainer or Open Bag activates that Save File and routes to the selected destination.

Deletion confirmation names the file and explains that its Backups are removed. For the active file it also explains Workspace and Dirty Workspace removal. After deletion, focus moves to the next Save File, then the previous Save File, then Pokemon Storage, then Import.

Successful Import remains on Saves, makes the new Save File active, and focuses it. Cancelling returns focus to Import. With no Save Files, Pokemon Storage and Import remain focusable. A loading Save File card retains its filename, sets `aria-busy` immediately, and shows a small local spinner only after 500 ms. A details failure shows `Details unavailable` while preserving the Save File Menu.

<a id="settings-1"></a>

## SETTINGS-1: fixed scope and layout

Source: [#179](https://github.com/woahitsraj/PKSX/issues/179), amended by [#177](https://github.com/woahitsraj/PKSX/issues/177) and [#201](https://github.com/woahitsraj/PKSX/issues/201).

Settings contains only the existing light/dark theme Preference, a static controls reference, and About with app version, PKHeX.Core version, and platform. It has no data dependency, and no app state hides or dims its contents. Preference persistence remains separate work.

The controls reference uses generic controller button names and keyboard equivalents, grouped by context, and includes the final Main Menu, Box Menu, Carry, and Pokemon Editor bindings. It does not infer controller-family glyphs or revive the Boxes hint row.

Settings is one column and one Focus Zone of vertical stops, including reference group headings and About. Its definite-size container scrolls the focused stop into view when needed. Left and Right traverse controls within a row. Up and Down leave the row from any position. Settings has no master/detail composition or shoulder paging.

<a id="savefile-1"></a>

## SAVEFILE-1: shared Trainer and Bag direct commit envelope

Sources: [#202](https://github.com/woahitsraj/PKSX/issues/202), the [Save File overhaul](https://github.com/woahitsraj/PKSX/issues/163), the selected [Ledger direction](https://github.com/woahitsraj/PKSX/issues/169), and the direct commit resolutions [#167](https://github.com/woahitsraj/PKSX/issues/167), [#168](https://github.com/woahitsraj/PKSX/issues/168), and [#209](https://github.com/woahitsraj/PKSX/issues/209), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210) and the progress-copy decision in [#250](https://github.com/woahitsraj/PKSX/issues/250).

### Inherited screen and focus contract

Trainer and Bag each identify the active Workspace with the original filename once. Trainer owns Trainer fields and Money. Trainer name appears only as an editable Trainer field. Bag owns inventory pockets and item commands. Both omit box count and unsupported fields.

Each destination owns one Focus Zone with vertical focus stops in an internal scrollport. Left and Right move within a row, while Up and Down leave it. A first visit starts at that destination's first stop, and Trainer and Bag remember their valid targets independently for the session.

Trainer presents Trainer fields and Money as a ledger. Bag is a grouped scrolling ledger with sticky pocket headers and a pocket jump row. Each pocket header opens Add Item, with one command draft per pocket. Item names wrap to two lines. These are selected inputs from [#170](https://github.com/woahitsraj/PKSX/issues/170). This record does not add editable fields.

Neither destination has page-wide staged state, an Apply or Cancel action, a draft count, a bottom action bar, or a route-leave warning. Successful direct commits are silent. Pending state sets `aria-busy` on the affected field or Bag row immediately and blocks repeated activation. If the operation remains pending after 500 ms, show a small local spinner until it completes or is cancelled. Do not replace action labels with `Saving...`, `Working...`, or other immediate progress copy. An isolated engine, Backup, or storage failure restores the last persisted value and shows one error Toast naming the field or item. A destination-wide editing outage becomes durable content with Retry while navigation remains available.

An initial load failure replaces the editor with Retry and Back to Boxes. No active Save File is a normal empty state. Bag catalogue loading, count, and failure remain beside Add Item. Catalogue failure offers Retry and disables only item addition, leaving quantity and removal available. Export outcomes use Toasts.

### Trainer, Money, and Bag commit boundaries

- Trainer name and typed Money use local drafts. Enter, soft-keyboard Done, or blur commits a valid changed value.
- Selecting a complete stored value, such as Trainer gender, commits immediately. A selector that only configures a later command does not mutate.
- Money and Bag quantity operators commit once per activation. When activated with a valid typed draft, the operator consumes it and produces one combined commit.
- Add Item collects item and quantity as one local command draft. Add commits both atomically.
- Remove enters inline confirmation. Confirm Remove performs one item-level mutation. Cancel, Escape, or controller B abandons it.
- A value equal to the latest accepted PKHeX Engine projection is a no-op, with no engine call, pending state, Backup, persistence, or Dirty Workspace change.
- Every successful commit displays the projection returned by the PKHeX Engine.

A rejected draft remains visible only while its field stays in edit mode, with local feedback and `aria-invalid`. Enter on an invalid draft keeps focus for correction. Invalid blur, Escape, or controller B restores the last accepted value. Its error remains until the control changes or the local view closes, is associated by `aria-describedby`, and is announced politely. Controller A or Enter activates a focused editable field. Enter or Done confirms. Escape or B abandons the draft, consumes that input, and leaves Controller Focus on the field. Engine validation rejection uses the same local path.

Unfinished Add Item and Remove commands are discarded without warning when their pocket, local view, or Bag closes. A failed Add or Remove retains its command for retry only while that view remains open.

### Mutation, Backup, persistence, and deletion ordering

The shared coordinator runs confirmed Trainer and Bag mutations FIFO against the latest committed Workspace. Mutations remain bound to their originating Save File and Workspace identities. Other controls and navigation remain available while a mutation is pending. Revisiting either destination reconstructs its local pending and `aria-busy` state from the coordinator.

Export waits for already confirmed mutations, then serializes the resulting Workspace. It never consumes an unconfirmed draft or triggers a mutation.

Create one idempotent automatic Backup per Workspace immediately before the first valid operation expected to change bytes. Invalid drafts and known no-ops create none. The Backup uses a generic Save File editing reason and a stable Workspace identity, so an interrupted retry reconciles the durable Backup instead of duplicating it. It remains the single automatic Backup even when the first engine mutation fails.

A Backup failure prevents every queued mutation for that origin, restores affected controls, and reports once that no Save File changes were made. A persistence failure discards unpersisted engine output, restores the last persisted Workspace, cancels later queued mutations for that origin, and reports one error.

Deleting a Save File is its terminal queued operation. Confirmed mutations finish first, then deletion removes the Save File, Workspace, and Backups and accepts no later operation for that origin. App termination preserves only persisted commits. It does not restore in-memory drafts or incomplete operations and shows no unload warning.

These direct commit rules apply only to Trainer and Bag Save File editing. EDITOR-2 remains the Pokemon Editor contract.

<a id="boundary-1"></a>

## BOUNDARY-1: module and policy ownership

Source: [#210](https://github.com/woahitsraj/PKSX/issues/210), with executable enforcement owned by [#205](https://github.com/woahitsraj/PKSX/issues/205).

Evolve the existing controller input, box navigation, box shell/workbench, destination, Pokemon Editor, and summoned-workflow modules. Keep domain navigation independently testable, and own the cross-destination Main Menu above Boxes. Trainer and Bag remain separate destination owners over one shared Save File edit coordinator. Pokemon Storage keeps its existing app-owned persistence boundary. Do not add a competing responsive state store, second focus authority, test-only navigation abstraction, or new data schema.

Before #254, root navigation owns only the reserved Search insertion point and Navigation Action. #254 owns rendering the Search Main Menu entry, choosing its physical controller binding, and implementing Quick Search. #255 owns Advanced Search inside that workflow.

Save File bytes, Pokemon Entity ownership, persistence, Backup safety, and PKHeX Engine/Facade contracts retain their current owners. Implementation identifiers use current domain names rather than old action-surface or source terminology.

<a id="enforcement"></a>

## Enforcement

Source: [#205](https://github.com/woahitsraj/PKSX/issues/205). The final static gate is tracked by [#225](https://github.com/woahitsraj/PKSX/issues/225).

The amended checks retain their feature owners: [#212](https://github.com/woahitsraj/PKSX/issues/212) owns editable computed size; [#215](https://github.com/woahitsraj/PKSX/issues/215) and [#218](https://github.com/woahitsraj/PKSX/issues/218) own collection pickers; [#216](https://github.com/woahitsraj/PKSX/issues/216) owns the current destination set and Search reservation; [#219](https://github.com/woahitsraj/PKSX/issues/219) owns the Saves card and focus rules; and [#250](https://github.com/woahitsraj/PKSX/issues/250) owns delayed progress indicators. Search behavior and its tests begin with #254, followed by #255.

Geometry, state, accessibility, and policy assertions fail CI. Target-state screenshots are review artifacts and do not fail on pixel differences.

### Static gate

`pnpm lint` runs the CSS design-contract checker and local JavaScript/Svelte rules.

- Reject viewport width, aspect, or orientation layout queries in shipping code; Tailwind viewport variants; duplicate Height Band thresholds; unauthorized `--pksx-height-band` assignments; raw type sizes where semantic tokens apply; and standard controls without token ownership.
- Permit the sole app-level `min-height: 560px` authority, the named `tall:` and container-query refinements, non-layout media features, and explicit custom categories for Slots, cards, icon-only controls, and composition-owned surfaces. Small controls must derive from the 24–33px token in DENSITY-1.
- Require editable controls to use the shared DENSITY-1 font-size floor, and reject declarations or token use that can lower it below 16px. Static analysis checks declarations and token ownership. Browser acceptance checks computed sizes. Do not raise labels or non-editable compact text to satisfy this rule.
- Reject layout-bearing `matchMedia()` calls, viewport dimension bindings, and direct viewport or screen reads used as classifiers. Permit test inspection, element measurement, and one narrowly owned geometry helper that returns coordinates rather than responsive modes.
- Enable strict enforcement only after fixing every shipping-code violation. Use no baseline snapshot, temporary allowlist, or permanent prototype exception. Remove historical prototype routes when production replaces them and retain their commit-linked evidence.

Diagnostics cite the smallest applicable contract identifier.

### Domain reducer gate

Focused box-navigation reducer tests cover the Box Pane transition table, two-pane facing edges, Party shoulder cycle, close-pane fallback, and Carry confinement from [#201](https://github.com/woahitsraj/PKSX/issues/201). App-level acceptance tests assert externally observable targets, containment, scroll ownership, computed token bounds, accessible grid and focus identity, stable workflow state, and user-action results. They do not assert component nesting, private helpers, implementation-specific timing, or exact screenshots. Do not introduce a test-only navigation abstraction.

### Browser gate

Playwright supplies deterministic safe-area values through the production inset mechanism. Chromium runs the full matrix and interaction workflows. WebKit and Firefox render every destination at the four floor and target cases.

| Case             | Raw viewport |                  Safe Canvas | Coverage                           |
| ---------------- | -----------: | ---------------------------: | ---------------------------------- |
| Landscape floor  |      640×360 |                      616×336 | Every destination                  |
| Landscape target |      640×480 |                      640×456 | Every destination                  |
| Portrait floor   |      360×640 |                      360×544 | Every destination                  |
| Portrait target  |      393×852 |                      393×759 | Every destination                  |
| Below floor      |      568×320 |                      548×300 | Boxes and destination reachability |
| Boundary low     |      640×559 | Derived from explicit insets | Short and state preservation       |
| Boundary high    |      640×560 | Derived from explicit insets | Tall and state preservation        |
| Tall landscape   |     1280×800 |                     1280×800 | Bounded composition and large type |
| Large Tall       |    1920×1080 |                    1920×1080 | Width and column caps              |

Test the 900×700 large-type container threshold at 899×700, 900×699, and 900×700. It remains a container rule rather than a viewport mode.

At floors and targets with the keyboard closed, assert Safe Canvas containment, specified scroll ownership, positive dimensions for visible controls, and complete visibility of the Controller Focus target. Opening a Menu or Takeover must not increase shell scroll extent. Assert the BUDGET-1 co-visibility and Slot measurements, DENSITY token bounds and categories, Height Band boundary, Menu edge selection, Short and Tall Takeover geometry, and LARGE-1 caps. At the portrait floor and target, and at both landscape cases, assert at least 16px computed text on editable controls in Trainer, Bag including an open Add Item command, the Pokemon Editor including its dense IV/EV section, Pokemon Creation, and other applicable summoned workflows. [#212](https://github.com/woahitsraj/PKSX/issues/212) owns the shared rule and the portrait floor and target checks. Exercise square containers explicitly: panes stack, Menus use the bottom edge, and the Pokemon Editor rail uses the top edge.

Crossing the 559/560 boundary or changing aspect may reflow presentation while preserving destination, pane identity and count, Controller Focus, Carry, and open workflow. Below the floor, assert reachability without a warning gate or blank state.

Interaction workflows cover first-run landing, Main Menu order and focus restoration, independent Trainer and Bag destination memory, controller B versus platform Back, unavailable command reasons, Carry suppression of Menus, pane and Party transitions, focus after Slot mutations, pointer-only actions, import and deletion recovery, Pokemon Storage grid selection and collection-picker behavior, replacement chains, vanished launchers, Pokemon Editor section navigation, staged review and validation, Legality Report return, and discard guards. Use real Save File fixtures for data-dependent paths.

Before #254 lands, acceptance keeps the Search slot and Navigation Action reserved and asserts that the Main Menu does not render Search. #254 owns Quick Search entry, shortcut, and result-navigation coverage. #255 owns Advanced Search coverage.

### Native gate

The Android API 36 Pixel 2 emulator runs at 360×640 portrait and 640×360 landscape. A test opens a real editable control and first proves the software keyboard is visible. It begins Tall, proves the WebView crosses below 560px while the inherited band remains Tall, ends editing, and proves one recomputation from the current viewport.

Rotate through single-pane Boxes, two-pane Boxes, Carry, an open Menu, an open Takeover, and keyboard-open editing. Assert state identity, Controller Focus, pane count, surface state, and post-edit Height Band recomputation. Existing iOS controller acceptance remains the iOS gate; no new iOS target duplicates deterministic browser geometry or Android keyboard resizing.

## Source index

The 2026-09-10 amendments to [#151](https://github.com/woahitsraj/PKSX/issues/151), [#207](https://github.com/woahitsraj/PKSX/issues/207), and [#210](https://github.com/woahitsraj/PKSX/issues/210) govern NAV-1, DENSITY-1, BOXES-2, FOCUS-4, SAVES-1, SAVES-2, SAVEFILE-1, and BOUNDARY-1.

| Contract                   | Decision owner and amendments                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUDGET-1                   | [#152](https://github.com/woahitsraj/PKSX/issues/152), [#165](https://github.com/woahitsraj/PKSX/issues/165), [#196](https://github.com/woahitsraj/PKSX/issues/196)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| BUDGET-2                   | [#161](https://github.com/woahitsraj/PKSX/issues/161), [ADR 0011](../adr/0011-derive-platform-floors-from-one-browser-baseline.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| SHELL-1                    | [#155](https://github.com/woahitsraj/PKSX/issues/155), [#156](https://github.com/woahitsraj/PKSX/issues/156), [#177](https://github.com/woahitsraj/PKSX/issues/177), [ADR 0012](../adr/0012-draw-durable-state-in-place.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| NAV-1, NAV-2               | [#156](https://github.com/woahitsraj/PKSX/issues/156), [#177](https://github.com/woahitsraj/PKSX/issues/177), [#201](https://github.com/woahitsraj/PKSX/issues/201), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210); current implementation [#216](https://github.com/woahitsraj/PKSX/issues/216), Quick Search [#254](https://github.com/woahitsraj/PKSX/issues/254), Advanced Search [#255](https://github.com/woahitsraj/PKSX/issues/255)                                                                                                                                                                                                                                                         |
| RESP-1, RESP-2             | [#157](https://github.com/woahitsraj/PKSX/issues/157), [#204](https://github.com/woahitsraj/PKSX/issues/204), [ADR 0013](../adr/0013-drive-responsive-layout-from-one-height-band.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| DENSITY-1                  | [#196](https://github.com/woahitsraj/PKSX/issues/196), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210); shared implementation [#212](https://github.com/woahitsraj/PKSX/issues/212), [ADR 0015](../adr/0015-fix-the-type-scale-and-scale-room-by-container-height.md)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| DENSITY-2                  | [#196](https://github.com/woahitsraj/PKSX/issues/196)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| LARGE-1                    | [#203](https://github.com/woahitsraj/PKSX/issues/203), follow-up [#212](https://github.com/woahitsraj/PKSX/issues/212)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| SURFACE-1, SURFACE-2       | [#158](https://github.com/woahitsraj/PKSX/issues/158), [#162](https://github.com/woahitsraj/PKSX/issues/162), [#196](https://github.com/woahitsraj/PKSX/issues/196), [#201](https://github.com/woahitsraj/PKSX/issues/201), [ADR 0014](../adr/0014-present-summoned-surfaces-as-menus-and-takeovers.md)                                                                                                                                                                                                                                                                                                                                                                                                                |
| BOXES-1, BOXES-2           | [#159](https://github.com/woahitsraj/PKSX/issues/159), [#177](https://github.com/woahitsraj/PKSX/issues/177), [#201](https://github.com/woahitsraj/PKSX/issues/201), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210); implementation [#215](https://github.com/woahitsraj/PKSX/issues/215) and [#218](https://github.com/woahitsraj/PKSX/issues/218)                                                                                                                                                                                                                                                                                                                                                  |
| FOCUS-1 through FOCUS-4    | [#162](https://github.com/woahitsraj/PKSX/issues/162), [#201](https://github.com/woahitsraj/PKSX/issues/201), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210); destination implementation [#216](https://github.com/woahitsraj/PKSX/issues/216) and [#219](https://github.com/woahitsraj/PKSX/issues/219), [CONTEXT.md](../../CONTEXT.md)                                                                                                                                                                                                                                                                                                                                                             |
| EDITOR-1, EDITOR-2         | [#160](https://github.com/woahitsraj/PKSX/issues/160), [#196](https://github.com/woahitsraj/PKSX/issues/196), [#201](https://github.com/woahitsraj/PKSX/issues/201), [ADR 0010](../adr/0010-use-engine-backed-pokemon-editor-apply-contract.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| SAVES-1, SAVES-2           | [#180](https://github.com/woahitsraj/PKSX/issues/180), [#201](https://github.com/woahitsraj/PKSX/issues/201), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210) and [#250](https://github.com/woahitsraj/PKSX/issues/250); implementation [#219](https://github.com/woahitsraj/PKSX/issues/219)                                                                                                                                                                                                                                                                                                                                                                                                         |
| SETTINGS-1                 | [#179](https://github.com/woahitsraj/PKSX/issues/179), [#177](https://github.com/woahitsraj/PKSX/issues/177), [#201](https://github.com/woahitsraj/PKSX/issues/201)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| SAVEFILE-1                 | [#202](https://github.com/woahitsraj/PKSX/issues/202), [#163](https://github.com/woahitsraj/PKSX/issues/163), [#167](https://github.com/woahitsraj/PKSX/issues/167), [#168](https://github.com/woahitsraj/PKSX/issues/168), [#169](https://github.com/woahitsraj/PKSX/issues/169), [#209](https://github.com/woahitsraj/PKSX/issues/209), amended by [#210](https://github.com/woahitsraj/PKSX/issues/210) and [#250](https://github.com/woahitsraj/PKSX/issues/250), detail owner [#170](https://github.com/woahitsraj/PKSX/issues/170)                                                                                                                                                                               |
| BOUNDARY-1 and enforcement | [#205](https://github.com/woahitsraj/PKSX/issues/205), [#210](https://github.com/woahitsraj/PKSX/issues/210), density [#212](https://github.com/woahitsraj/PKSX/issues/212), collection pickers [#215](https://github.com/woahitsraj/PKSX/issues/215) and [#218](https://github.com/woahitsraj/PKSX/issues/218), navigation [#216](https://github.com/woahitsraj/PKSX/issues/216), Saves [#219](https://github.com/woahitsraj/PKSX/issues/219), progress [#250](https://github.com/woahitsraj/PKSX/issues/250), final static gate [#225](https://github.com/woahitsraj/PKSX/issues/225), future Search [#254](https://github.com/woahitsraj/PKSX/issues/254) and [#255](https://github.com/woahitsraj/PKSX/issues/255) |

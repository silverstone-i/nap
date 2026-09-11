# UI design guidelines

These guidelines describe preferred UI patterns for NAP. They are defaults,
not mandatory requirements. Choose a different pattern when it better supports
the feature's workflow, and explain significant departures in the feature's
design documentation. Routine choices do not require a separate approval or ADR.

Use this guide when designing a feature, discussing its interface, or reviewing
its usability. It records design guidance, not implemented behavior or acceptance
criteria. The [platform specification](../specs/nap-platform-specification.md#web-shared-behavior),
accepted component PRDs, and [brand design](../branding/BRAND.md) retain their
authority. This guide does not relax accessibility, authorization, navigation,
or theme requirements. The [product-shell PRD](../PRDs/0009-product-shell-and-navigation.md)
owns the shell's accepted behavior.

## Shell vocabulary and layout

| Term                | Meaning and preferred use                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Header              | Global bar at the top of the window.                                                                                  |
| Navbar              | Navigation area on the left, below the Header.                                                                        |
| Workspace           | Main content area alongside the Navbar.                                                                               |
| Header1             | Feature toolbar at the top of the Workspace: feature title, relevant data filters, and primary and secondary actions. |
| Header2, Header3, … | Optional additional rows below Header1, numbered from top to bottom. They span only the Workspace.                    |

Prefer one feature toolbar. Add another row only when separating controls makes
the task easier, such as keeping view tabs distinct from a busy dataset toolbar.
Do not reserve empty header rows. Adapt the layout to smaller screens within the
specification's responsive navigation contract.

Consolidate the feature title, filters, and actions in Header1 rather than
stacking a large title and several separate action bars above the data. Prefer
compact spacing that preserves readable text and usable controls; allow wrapping
on smaller screens rather than forcing a fixed toolbar height.

Keep the Header and Header1 available while working content scrolls. Prefer a
viewport-sized shell with deliberate scrolling inside the Workspace. For grids,
avoid competing page and grid scrollbars; let the dataset use the available
height. Long forms may use Workspace scrolling instead.

## Navigation

Group Navbar destinations by feature. Tenant Management is a level-1 group;
Tenants and Portal users are its level-2 destinations. Prefer a clickable group
heading with a chevron that expands or collapses its indented links. Selecting
a destination opens its feature in the Workspace.

MUI's List, ListItemButton, and Collapse fit this pattern. Consider allowing
multiple groups to remain open and initially expanding the active destination's
group. These are interaction preferences, not a settled persistence policy for
navigation state. A standalone destination does not need an artificial group.

When the Navbar is collapsed to icons, provide group flyouts containing the
group's permitted destinations. Opening a group should not require expanding
the entire Navbar. Support click and keyboard activation, Escape dismissal,
and focus return to the trigger; do not rely on hover alone. Give icons
accessible names and tooltips, and identify the active destination in the flyout.
MUI Menu or Popover can provide the flyout surface, with appropriate keyboard
behavior. Remembering expansion state is a convenience to consider, not a
settled settings requirement.

Use the feature or record title to establish location. Where a record view
needs a return path, provide a contextual parent link such as All tenants.

## Feature focus and views

Keep each Workspace focused on one feature and the actions needed to complete
its task. Related information can support that task; broader administration of
another feature belongs at its own destination. For example, tenant provisioning
may need portal-user information without turning the Tenants screen into a
second portal-user administration screen.

Keep general feature navigation in the Navbar. Header1 should expose actions
for the current feature or selection, rather than repeating links to other
management screens and operator utilities.

Prefer tabs when a feature or dataset has multiple views. Use Navbar destinations
for distinct features. Follow the specification's URL-state requirements for
shareable views and detail tabs. Tab placement can be in Header1, an optional
Header2, or the content area, depending on the layout.

## Records and datasets

Prefer MUI X DataGrid for tabular data. Use forms, summaries, and detail layouts
where they express the information better than a grid.

For individual-record workflows, such as Tenants, prefer an ellipsis action menu
on each row containing the actions available for that record. A record name can
open the primary detail view. Keep the action's target clear. Row actions do not
require selecting the row first; show selection checkboxes when they enable a
useful bulk operation.

Use readable status indicators and relevant search/filter controls to make lists
easy to scan. In a record detail view, lead with its summary and applicable
actions. Reveal short action-specific forms when requested instead of stacking
every possible form on the page. Tenant provisioning status, memberships, and
jobs can support the tenant workflow; substantial views may warrant tabs.

For datasets edited across many records, such as budgets, prefer spreadsheet
interaction: cell editing, keyboard navigation, copy/paste where useful, and
dropdowns for controlled values. Use searchable choices for large reference
lists. The feature design should define validation, saving, and recovery across
the affected records; an editable grid alone does not define those behaviors.

Coordinate grid controls with Header1 to avoid duplicate filters or action bars.
Choose capabilities against the project's available MUI X edition and dependency
policy rather than assuming every spreadsheet interaction is included.

## Editing and persistence: options under discussion

No application-wide saving policy was selected in the UI discussion. Evaluate
the following patterns for each feature; this guide does not authorize an
autosave mechanism, a draft store, or a publication workflow.

| Pattern                                            | When to consider it                                                                | Design questions                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Explicit Save and Cancel                           | Record forms whose fields form one meaningful change.                              | What is saved together? What happens when leaving with unsaved edits?       |
| Save changes and Discard changes                   | Worksheets where users review several edits before applying them.                  | Is the change set atomic? How are invalid cells and conflicts resolved?     |
| Save on leaving a field or record                  | Simple independent edits and repetitive data entry.                                | Is the save boundary clear? Can failures be corrected without losing edits? |
| Autosave a draft, then explicitly apply or publish | Lengthy work where preserving progress and making it effective are separate needs. | Who can see the draft? How is it recovered, discarded, or made effective?   |
| Immediate command                                  | A deliberate action such as activating a record.                                   | Does its consequence warrant confirmation, and how is completion shown?     |

Validate close to the edited value and make saving, unsaved, saved, and failed
states understandable. Decide whether changing tabs or records saves, retains,
or prompts about edits. Do not let an incidental focus change silently define
business behavior. Keep patterns consistent across comparable workflows.

## Dialogs and contextual work

Prefer MUI Dialog for short, focused tasks that finish or cancel before the user
continues: consequential confirmations, a small record action, or a brief choice.
Name the affected record and use a specific action label, such as Deactivate
tenant, alongside Cancel.

Keep lengthy forms, full feature administration, and spreadsheet editing in the
Workspace. Avoid nested dialogs. If comparing a record with the underlying list
is useful, consider an inline detail area or side panel; use a dialog when the
task actually benefits from blocking interaction with the background.

## Component reference

These mappings are suggestions, not a required component inventory.

| MUI component                                  | Suggested use                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| AppBar, Toolbar                                | Global Header and feature controls in Header1.                                   |
| Drawer, List, ListItemButton, Collapse         | Responsive Navbar and collapsible feature groups.                                |
| Tabs                                           | Views within a feature.                                                          |
| MUI X DataGrid and its toolbar/filter controls | Tabular records, dataset actions, and filters.                                   |
| Menu, Popover, IconButton                      | Navbar group flyouts, row ellipsis menus, and secondary actions.                 |
| TextField, Select, Autocomplete                | Forms and filters; short fixed choices or searchable record choices.             |
| Dialog                                         | Focused tasks and consequential confirmations.                                   |
| Chip                                           | Compact status labels and removable filters.                                     |
| Alert                                          | Persistent validation summaries, access problems, and save failures.             |
| Snackbar                                       | Brief, non-critical completion feedback.                                         |
| Skeleton, LinearProgress                       | Loading placeholders and operation progress.                                     |
| Tooltip                                        | Supplementary explanations for controls; provide accessible names independently. |

Keep errors near the affected content. A failed save should remain visible and
actionable rather than appearing only in a disappearing notification. Preserve
edits when recovery is possible. Treat loading, empty results, denied access,
and failures as distinct states.

## Maintaining this guide

The Axerra and Seqori comparison informed these preferences: dedicated feature
toolbars, controlled Workspace scrolling, collapsible navigation, and consistent
record-list actions. Borrow patterns that fit NAP while retaining its brand,
two-level navigation contract, and feature ownership. Their extensive record
dialogs, default grid checkboxes, and exact dimensions are not defaults for NAP.
Budget worksheets still call for spreadsheet interaction rather than copying a
list-and-dialog editing workflow. Draft/version patterns remain examples for
the unresolved persistence discussion, not adopted requirements.

Update preferences as real workflows reveal better choices. Feature-specific
requirements belong in their owning PRDs; link to them rather than copying
their contracts here. Examples illustrate possible designs and do not promise
that those screens or capabilities currently exist.

MUI references: [Lists](https://mui.com/material-ui/react-list/#nested-list),
[Dialog](https://mui.com/material-ui/react-dialog/),
[component collection](https://mui.com/material-ui/all-components/),
[DataGrid toolbar](https://mui.com/x/react-data-grid/components/toolbar/), and
[Snackbar](https://mui.com/material-ui/react-snackbar/).

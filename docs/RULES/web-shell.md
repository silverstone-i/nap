# RULES — Web shell

Governs `apps/web/src/shell/`, `apps/web/src/pages/`, `apps/web/src/theme/`,
and `apps/web/src/mocks/`.

## Scope lives in the URL

The app is served from the root path (`/`).

Routes are `/:entityId/:module/...` (`/silverstone/inbox`,
`/silverstone/projects/:projectId`, `/harbor/ap/invoices`); the project
filter, an open preview drawer, and the active detail tab are search
params (`?project=`, `?invoice=`, `?tab=`). This is deliberate: the URL
identifies the resource, including whose it is, so deep links are
shareable across users in the same tenant and browser back/forward
replays any screen state exactly. If a new piece of screen state can't be
reconstructed from the URL, it doesn't belong in the shell — with the
persisted-preference exceptions below (theme mode, default entity).

`/login` is the one route outside the entity shell, and everything else
sits behind `auth/RequireAuth`, which carries the unauthenticated target
in `?next=<encoded path>` — the redirect, too, lives in the URL. The
redirect boundary is governed here; login-form behavior and session semantics
are outside this rule's scope.

`shell/EntityRoute` guards the entity segment: unknown entity ids — and
`/` itself — redirect to the default entity's inbox. The default is the
last entity the user explicitly switched to, persisted to localStorage
(`nap:entity`); it is only a tie-breaker for entity-less URLs, never a
substitute for the segment. Switching entity rewrites the segment, keeps
the module path, and drops the entity-scoped params (`?project=`,
`?invoice=`).

`shell/useScope.ts` is the only reader of scope state: entity from the
`:entityId` path param, project from `?project=`. Pages take their entity
and project from it rather than reaching for `useParams` or
`useSearchParams` directly, so the param names stay changeable in one
place. A `?project=` that doesn't belong to the URL's entity (a
hand-edited link) is treated as unset — the page falls back to "all
projects".

## Theme tokens are the single source

All colors and font stacks come from `theme/tokens.ts`. No hex literals appear
in components. Mode-varying colors live in the `light` and `dark` sets;
components never import a set directly — they read the active one through
the MUI theme, via a palette slot (`background.paper`, `primary.main`) or
`theme.tokens.*` for values with no palette slot (`subtle`, `navyText`,
tints). Only the mode-invariant exports (`gold`, the font stacks) may be
imported statically.

`theme/ThemeModeProvider.tsx` owns the mode: the preference is
`system | light | dark`, defaults to `system` (follows
`prefers-color-scheme` live), and is switched from the user menu. An
explicit choice persists in localStorage (`nap:theme-mode`) — like the
default entity, a deliberate exception to "scope lives in the URL", because
a theme is a per-device preference, not shareable screen state.

Gold (`--gold`) is intentionally **not** in the MUI palette, so it cannot leak
through `color="secondary"` or theme defaults. It appears in exactly three
shell locations: the wordmark dot, the single active-nav indicator (the rail's
left bar — tabs therefore use the default navy indicator), and the final-total
rule in the invoice drawer. Never add gold to chips, badges, focus rings,
icons, or selected rows.

## Data access goes through mock selectors

Pages call the selector functions exported by `mocks/data.ts`
(`getEntity`, `getProjects`, `getProject`, `getInvoices`, `getInboxItems`)
and never import the seed arrays directly. The selector signatures are the
seam a future API client replaces — a page that reaches around them into
the raw arrays will break silently when the mock module goes away.

## Grid → drawer for glance, page for work _(applies as modules land)_

List rows preview in a right-side drawer keyed by a search param; anything
involving editing or sustained work gets a routed page with tabs. Don't put
record editing in a drawer or a modal — routed pages keep URLs meaningful
and preserve the audit-style navigation the rest of the shell is built on.

## Navigation depth _(applies as modules land)_

The rail holds at most two levels (module → submodule). A feature that
seems to need a third level gets restructured or reached from within a
page, not a deeper rail.

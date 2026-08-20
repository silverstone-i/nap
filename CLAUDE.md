# CLAUDE.md

Guidance for coding agents and contributors working in the NAP repository.

## Start here

Before planning or changing code, follow the reading order in the
[documentation index](docs/README.md). In particular:

1. Read [PRD 0000](docs/PRDs/0000-nap-platform-architecture.md).
2. Use [PROJECT-STRUCTURE.md](docs/architecture/PROJECT-STRUCTURE.md) for file,
   import, module-ownership, and deployment placement.
3. Read the relevant component PRD. If it does not exist, create and accept it
   before implementing the component.
4. Read the [ADR index](docs/ADRs/INDEX.md) and every applicable ADR.
5. Read every applicable file under [docs/RULES](docs/RULES/).

Do not treat the roadmap or `docs/reference/` as architectural authority. Do
not copy a requirement into a second document; link its stable ID instead.

## Technology and architecture decisions

[ADR 0002](docs/ADRs/0002-technology-stack.md) owns the platform technology
choices, [ADR 0003](docs/ADRs/0003-web-toolchain-vite-and-bundler-mode-typescript.md)
owns the web toolchain, and
[ADR 0004](docs/ADRs/0004-central-admin-cells-and-rls-tenant-isolation.md)
owns database topology and tenant isolation. Package manifests, the lockfile,
`.nvmrc`, and TypeScript configuration own the exact installed versions and
compiler settings.

Database code must conform to
[RULES/database-access.md](docs/RULES/database-access.md). Web-shell code must
conform to [RULES/web-shell.md](docs/RULES/web-shell.md). PRDs must conform to
[RULES/prd-format.md](docs/RULES/prd-format.md).

If a requested change conflicts with an accepted decision, do not silently
work around it. Propose and accept a superseding ADR, then update every affected
current PRD, structural document, RULES file, ADR index entry, and roadmap
dependency in the same change.

## Repository checks

Run checks from the repository root using the Node version pinned by `.nvmrc`:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run format:check`

The API development loop is `npm run dev`; the web development server is
`npm run dev:web`. The web development server does not replace the typecheck.
All applicable checks must pass before a push.

## Documentation changes

- Update the current owning document; do not create parallel architecture
  summaries.
- A decision change requires an ADR. A current requirement change requires its
  owning PRD to change. A layout or ownership change requires
  `PROJECT-STRUCTURE.md` to change. An implementation convention change
  requires its scoped RULES document to change.
- Component table definitions become authoritative only in accepted component
  PRDs and module-owned migrations. The initial table schema in
  `docs/reference/` is planning input.
- Append the required revision entry when changing a PRD.

## Commit and release operations

- Sign every commit using `git commit -s`.
- Use an imperative subject. Conventional Commit prefixes are encouraged.
- Name branches with `feat/`, `fix/`, `docs/`, or `chore/` followed by a short
  description.
- Keep a pull request scoped to one concern. Pull requests are squash-merged.
- `main` is the only long-lived branch; do not push directly to it.
- A releasing pull request carries exactly one `release:patch`,
  `release:minor`, or `release:major` label and updates `## [Unreleased]` in
  `CHANGELOG.md`.
- CI owns version changes, changelog promotion, tags, and GitHub Releases. Do
  not perform those operations manually. The root `package.json` is the
  version source.

## Licensing

NAP is licensed AGPL-3.0-or-later. New source files use the appropriate comment
syntax for:

```text
Copyright (c) 2026–present Ian Silverstone.
SPDX-License-Identifier: AGPL-3.0-or-later
```

Documentation and configuration files are exempt. Production dependencies
must use a license allowed by `.licenses-allowed.json`; adding a new production
license requires the allowlist update and justification in the same pull
request. Do not add production dependencies licensed only under GPL-2.0,
BUSL, SSPL, Commons Clause, a proprietary license, or no license.

## Security

Do not open a public issue for a vulnerability. Use a private GitHub security
advisory or email `ian@isilverstone.com`.

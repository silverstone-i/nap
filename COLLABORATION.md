# Collaborating on NAP

NAP is open source under the **GNU Affero General Public License v3 or later** (AGPL-3.0-or-later). This document describes how to contribute and what you are agreeing to when you do.

The maintainer (Ian Silverstone — GitHub [@silverstone-i](https://github.com/silverstone-i), <ian@isilverstone.com>) has sole enforcement authority over project policy. This baseline may be upgraded to a Contributor License Agreement (CLA) in the future; prior DCO sign-offs remain valid under AGPL-3.0-or-later regardless of any future upgrade.

## Developer Certificate of Origin (DCO)

Every commit to this repository must carry a `Signed-off-by:` trailer:

```
Signed-off-by: Jane Developer <jane@example.com>
```

By adding this trailer, you certify the following:

> **Developer Certificate of Origin 1.1**
>
> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I
> have the right to submit it under the open source license
> indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the best
> of my knowledge, is covered under an appropriate open source
> license and I have the right under that license to submit that
> work with modifications, whether created in whole or in part
> by me, under the same open source license (unless I am
> permitted to submit under a different license), as indicated
> in the file; or
>
> (c) The contribution was provided directly to me by some other
> person who certified (a), (b) or (c) and I have not modified
> it.
>
> (d) I understand and agree that this project and the contribution
> are public and that a record of the contribution (including all
> personal information I submit with it, including my sign-off) is
> maintained indefinitely and may be redistributed consistent with
> this project or the open source license(s) involved.

The DCO text above is the verbatim version 1.1 from <https://developercertificate.org>.

### How to sign off

Use `git commit -s` (or `--signoff`) to append the trailer automatically based on your `user.name` and `user.email`. Anonymous or pseudonymous sign-offs are not accepted.

A husky `commit-msg` hook rejects commits missing a valid `Signed-off-by:` trailer.

### Fixing a missing sign-off

- Last commit only: `git commit --amend -s --no-edit`
- Multiple commits on a branch: `git rebase --signoff main`

Then force-push your branch: `git push --force-with-lease`.

### Commit messages

Write commit subjects in the imperative mood ("Add tenant schema resolver", not "Added…"). [Conventional Commits](https://www.conventionalcommits.org) prefixes (`feat:`, `fix:`, `docs:`, `chore:`, …) are encouraged but not enforced.

---

## Development setup

See the [README](README.md) for the stack (PERN — Postgres 18, Express 5, React 19, Node 24). Detailed install/run/test instructions will be added to the README once the project scaffolding lands; until then, open an issue if you want to get involved early.

---

## Dependency policy

NAP is AGPL-3.0-or-later. Every production dependency must carry a license whose SPDX identifier is listed in `.licenses-allowed.json`, the authoritative list; `npm run licenses` enforces it in CI and dev-only dependencies are not checked. Adding an SPDX identifier to that list is part of the pull request that introduces the dependency needing it, and requires justification in the same pull request. A license that would restrict downstream AGPL redistribution is not added; the dependency is replaced instead.

---

## Contribution workflow

1. Open or claim an issue describing the change.
2. Branch from `main`. Branch names use Conventional Commits prefixes: `feat/`, `fix/`, `docs/`, `chore/` (e.g. `feat/web-app-shell`).
3. Make your change. Follow project conventions in [CLAUDE.md](CLAUDE.md) and the [platform specification](docs/specs/nap-platform-specification.md).
4. Commit with `git commit -s` to attach your DCO sign-off.
5. Push and open a PR to `main`.
6. CI runs lint, format check, typecheck, tests, build, and the license check. A PR that carries a release label must also update `CHANGELOG.md`; see [CLAUDE.md — Commit and release operations](CLAUDE.md#commit-and-release-operations).
7. The maintainer reviews. A change must keep the documents under `docs/` that own its behavior current, as the [change workflow](docs/README.md#change-workflow) describes.

---

## Reporting security issues

Do **not** open a public issue for a vulnerability. Report it privately via [GitHub security advisories](https://github.com/silverstone-i/nap/security/advisories/new) or by email to <ian@isilverstone.com>. You will get an acknowledgment, and a fix will be coordinated before public disclosure.

---

## Code of conduct

Be respectful and professional in issues, PRs, and reviews. Harassment or personal attacks are not tolerated; the maintainer may remove content or block contributors who cross that line. A formal code of conduct (e.g., Contributor Covenant) may be adopted as the contributor base grows.

---

## Copyright

Copyright in contributions remains with the contributor. By signing off you license your contribution to the project under AGPL-3.0-or-later. The project's copyright notice currently reads:

```
Copyright (c) 2026–present NapSoft, LLC.
SPDX-License-Identifier: AGPL-3.0-or-later
```

**New source files must carry this header** (comment syntax adjusted to the language): every `.ts`, `.tsx`, `.js`, and `.mjs` file, as `eslint.config.mjs` does. Markdown, JSON, and YAML files do not need it. See [CLAUDE.md — Licensing](CLAUDE.md#licensing).

If a separate legal entity (e.g., NAP LLC) is later formed and the existing copyrights are assigned to it, the headers will be updated in a single coordinated pass; this does not affect the rights of any prior contributor.

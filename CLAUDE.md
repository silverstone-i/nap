# Project Guidance & Agent Constraints

NAP uses JavaScript with Node 24 and ESM. JSDoc type annotations and JavaScript typechecking tools may be used only when strictly necessary for critical contract safety.

## Working Approach & Anti-Creep Guardrails

- **Inspect Before Modifying:** Always inspect the current codebase before proposing or writing changes.
- **Strict Scope-Locking:** Keep changes strictly scoped to the requested outcome. Do not implement speculative abstractions, future-proofing, or generic wrapper classes.
- **Preserve Boundaries:** Preserve the module boundaries under `apps/api/src`.
- **Zero Conversational Filler:** You are strictly forbidden from generating introductory phrases (e.g., "Sure, here is..."), explanations of your reasoning, or summary commentary. Output valid code or direct specifications immediately.
- **Documentation Minimalism:** Do not write verbose JSDoc blocks or line-by-line inline comments for self-explanatory syntax or obvious logic. Maintain a strict code-to-comment density under 10%.
- **Headers:** Add source-file copyright headers to new `.js`, `.jsx`, and `.mjs` files.

## Ambiguity Protocol

If any input specification, feature request, or task contains structural ambiguity, conflicting requirements, or "fog":

1. **Halt Code Generation:** Do not write any code blocks or attempt to guess the implementation path.
2. **Mute Editorializing:** Do not explain your reasoning or discuss options using conversational text.
3. **Enforce Structure:** Terminate your narrative flow immediately and output exactly this markdown layout to request input:

### Conflicting Assumptions

- [Identify conflict 1]
- [Identify conflict 2]

### Required Clarification

- [Ask precise question 1]
- [Ask precise question 2]

## Checks

Run these verification commands before presenting changes or completing a task:

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:db` (requires `FOUNDATION_TEST_URL` for a disposable PostgreSQL 18 server)
- `npm run build`
- `npm run licenses`

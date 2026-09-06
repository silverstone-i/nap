# JavaScript-first TypeScript

Applies to new and changed TypeScript code across all workspaces. These
conventions implement the strict TypeScript and ES module stack in
[ARCH-051](../specs/nap-platform-specification.md#arch-051--fixed-technology-stack)
and schema-derived transport types in
[ARCH-043](../specs/nap-platform-specification.md#arch-043--shared-transport-boundary).

Write code that reads like straightforward ES module JavaScript. Use
TypeScript to check the code, not to introduce additional architecture.

## Implementation

- Prefer small functions, plain objects, named exports, and direct imports
  within the specification's import and export boundaries.
- Use ordinary control flow. Do not replace readable code with generic
  pipelines, excessive currying, or higher-order abstractions.
- Implement the concrete requirement first. Do not generalize for
  hypothetical future consumers.
- Extract helpers when they remove meaningful duplication, clarify a
  substantial operation, or enforce a required boundary.
- Do not add pass-through wrappers, single-implementation service interfaces,
  dependency injection containers, or factory classes.
- Use classes and factory functions only where the existing architecture or
  an actual lifecycle requirement calls for them. Keep required classes thin;
  do not wrap them in another abstraction layer.
- Preserve required validation, authorization, and transaction boundaries.
  The model and controller classes and router factories required by
  [ARCH-049](../specs/nap-platform-specification.md#arch-049--pg-schemata-is-the-persistence-mechanism)
  and [ARCH-050](../specs/nap-platform-specification.md#arch-050--uniform-module-http-surface)
  remain required.

## Types

- Keep TypeScript strict mode enabled.
- Infer local variables and return types when inference expresses the
  intended contract clearly. Omit redundant annotations such as
  `const count: number = 0`; use `const count = 0`.
- Explicitly type function parameters when they are not contextually typed.
- Declare return types when needed to enforce a public contract or prevent
  implementation details from becoming the contract.
- Keep types beside the code that owns them. Move shared types to their
  actual shared owner only when needed, following the specification's
  placement rules.
- Derive types from existing schemas and authoritative definitions rather
  than maintaining duplicate shapes.
- Use unions, narrowing, and simple object types to represent valid states.
- Introduce generics only when they preserve a meaningful relationship
  between inputs and outputs or support an actual reusable operation.
- Avoid elaborate conditional or mapped types when a simple explicit type
  communicates the contract better.
- Do not use `any`, assertions, or non-null assertions merely to silence
  errors. Validate or narrow uncertain values.
- Remember that types do not validate external data or transform objects.

## Enforcement

ESLint enforces redundant inferred annotations with
`@typescript-eslint/no-inferrable-types`. Strict typechecking and the existing
safety rules remain enabled. Review evaluates whether abstractions and explicit
contracts serve a concrete purpose.

## Review standard

For each new abstraction, identify the concrete duplication, invariant, or
lifecycle requirement it addresses. If none exists, simplify it.

Judge simplicity by how easily someone can follow the behavior, not by line
count alone. Apply these conventions within the requested change; do not
refactor unrelated code solely to match them.

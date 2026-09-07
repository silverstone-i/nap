# Code documentation

Applies to every function, method, class, exported constant, and exported type
in new and changed TypeScript code across all workspaces, including helpers
that are not exported. This convention complements
[JavaScript-first TypeScript](javascript-first-typescript.md) under
[ARCH-051](../specs/nap-platform-specification.md#arch-051--fixed-technology-stack).

## The reader

Write every comment for one person: a competent programmer on their first day
in this repository, who has not read the specification and does not know the
project's vocabulary. That reader must be able to say what the function does
from the comment alone.

That reader does not know what a cell, an admin database, a refusal, a
boundary, a handle, a composition root, or a release target is. Those words
may appear only after the first sentence has said what the function does in
ordinary words, or where the sentence explains them in passing.

## The shape

Every documentation comment has these labeled lines, in this order:

```ts
/**
 * Does: <one sentence, plain words, a verb and its object>
 * Called by: <who calls it>, <when>
 * Why: <the constraint, restriction, safeguard, or workaround, and its reason>
 */
```

- `Does:` is required. It says what the function does, not why, and not what
  it refuses to do. It starts with a verb: reads, parses, creates, returns,
  checks, stores, sends.
- `Called by:` is required. It names the caller and the moment: on every
  request, at startup, from tests only, from the setup script. When the
  function is called from many places, name the kind of caller.
- `Why:` is optional. It holds the constraint, restriction, security
  safeguard, or workaround the reader must not remove, and where it comes
  from. A reason has a source: the task that asked for it, a requirement ID,
  an accepted document, an owner's instruction, or a failure the code guards
  against. Write the constraint and its source, not a motive. Do not contrast
  the code with an alternative nobody proposed; "rather than" and "instead
  of" are the usual signs. If a restriction exists and its reason is not
  known, write `Why: unclear; review` and leave it for the owner. If there
  is no constraint, omit the line.
- A type or constant uses the same lines. `Does:` says what the value holds
  or represents; `Called by:` becomes `Used by:`.
- Inputs, outputs, side effects, and errors get `@param`, `@returns`,
  `@throws` lines after `Why:` only when the name and signature do not already
  say them.

A comment on a helper nested inside another function may be a single `Does:`
line when its only caller is the enclosing function and there is nothing to
say under `Why:`.

## What fails

A comment fails review when any of these is true:

- Its first sentence starts with Own, Refuse, Reject, Never, Only, Validate,
  Classify, Select, Resolve, or another verb that describes the constraint
  rather than the work. Those sentences belong under `Why:`.
- Its first sentence is a noun phrase with no verb.
- Its first sentence uses a project term the reader above would not know.
- The `Does:` line restates the function name in different words and nothing
  else. `Does: Resolves the port.` on `resolvePort` says nothing.
- The comment narrates the body statement by statement, or repeats what an
  inline comment already says.
- Its `Why:` line gives a reason with no source, or argues against an
  alternative that was never on the table. This `Why:` fails:

  ```ts
   * Why: the logger is created once at import time, so an unrecognized level
   * fails startup immediately with a fixed message rather than being silently
   * replaced by a default.
  ```

  The task said to throw on other values. The comment turns that instruction
  into a motive nobody supplied. The passing form states the constraint and
  its source, or omits the line:

  ```ts
   * Why: the logger reads this once at import, so a bad LOG_LEVEL fails
   * startup; the task requires any other value to throw.
  ```

- The behavior changed and the comment did not.

## Self-check

Before finishing, for each comment you wrote or changed: cover the function
body, read only the comment, and write down what the function does and who
calls it. If you cannot, the comment fails. Every comment in the repository
failed this test before this rule was written, which is why it exists.

## Examples

Each pair uses a real function from this repository. The "before" text is the
comment as it stood before this rule; the "after" text is what this rule
requires and what the file now carries.

### Middleware

Before, [jsonBody.ts](../../apps/api/src/middleware/jsonBody.ts):

```ts
/** Classify parser errors here so arbitrary application error fields are untrusted. */
export const jsonBody: RequestHandler = (request, response, next) => {
```

After:

```ts
/**
 * Does: Reads the JSON body of an incoming request and stores it on
 * request.body, or passes a fixed error to the next handler.
 * Called by: the app, on every request, after correlation and logging and
 * before any route handler.
 * Why: parser failures are mapped here to one of three fixed error codes
 * (PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, INVALID_INPUT) so text from the
 * parser library never reaches the client. Compressed bodies, bodies over
 * 100 KB, and non-JSON content types are refused before parsing starts.
 */
export const jsonBody: RequestHandler = (request, response, next) => {
```

### Exported constant

Before, [requestContext.ts](../../apps/api/src/util/requestContext.ts):

```ts
/** Execution identity only; never an actor, tenant, or authorization source. */
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
```

After:

```ts
/**
 * Does: Holds the ID of the request currently being handled, so any code
 * running for that request can read it without being passed it.
 * Used by: the correlation middleware to set it, and the logger and request
 * logging middleware to read it.
 * Why: it carries the request ID and nothing else. It must never be used to
 * find out who the caller is, which tenant they belong to, or what they are
 * allowed to do; those come from server-resolved data, not request scope.
 */
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
```

### Factory function

Before, [runtime.ts](../../apps/api/src/runtime.ts):

```ts
/**
 * Own the listener and database shutdown ordering without installing process
 * handlers. The entry point owns signals and final exit; tests use real sockets
 * with short deadlines. Handles are registered before start and never afterward.
 */
export function createRuntime(
```

After:

```ts
/**
 * Does: Creates the HTTP server and returns start and shutdown functions
 * for it, given the database connections it depends on.
 * Called by: the server entry point at startup, and by runtime tests with
 * short deadlines and real sockets.
 * Why: start refuses to listen until every database passes a readiness
 * check. Shutdown drains HTTP connections before closing database pools so
 * in-flight requests finish against open connections. This function installs
 * no signal handlers and never exits the process; the entry point owns both.
 * All database handles are supplied here; none can be added after start.
 */
export function createRuntime(
```

### Small helper

Before, [env.ts](../../apps/api/src/util/env.ts):

```ts
/** Select the deployment environment without reading a database credential. */
export function resolveEnvironment(env: NodeJS.ProcessEnv = process.env) {
```

After:

```ts
/**
 * Does: Returns DEV, TEST, or PROD from NODE_ENV, defaulting to DEV when
 * NODE_ENV is unset.
 * Called by: the runtime and migration configuration readers, to pick which
 * database URL variables to read.
 * Why: this runs before any credential is read, so a bad NODE_ENV fails with
 * a message that cannot contain a secret.
 * @throws If NODE_ENV is set to anything other than development, test, or
 * production.
 */
export function resolveEnvironment(env: NodeJS.ProcessEnv = process.env) {
```

## Enforcement

No lint rule checks these comments. Presence is not the problem; content is.
Review applies the self-check above to every new or changed comment, and a
pull request is not complete until every comment in its diff passes.

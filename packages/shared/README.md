# @nap/shared

Transport contracts shared by the API and the web client.

`src/index.js` exports the response envelope version, Zod schemas for the
health and not-found envelopes, and frozen instances of both. The API sends
the instances. The client validates responses against the schemas so both
sides agree on shape before any data is shown.

Every envelope carries `version` and either `data` or `error` with `code` and
`message`. Add a contract here when a route needs a shape both sides depend on.

`npm test` from the repository root runs the package tests.

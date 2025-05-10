# 🧪 Test Setup for nap-serv

This guide describes best practices for structuring controller tests in the `nap-serv` project using Jest.

---

## 1. Export Both Class and Instance

Each controller should export:
```js
export class MyController extends BaseController { ... }
export default new MyController();
```

Use the default export in production. Use the named class export in tests.

---

## 2. Allow Optional Model Injection

Define the constructor to accept an injected model:
```js
constructor(model = db.my_table) {
  super('my_table', 'MyLabel');
  this.model = model;
}
```

This enables isolated testing without patching global state.

---

## 3. Mock Before Instantiating the Controller

```js
const mockModel = {
  insert: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const controller = new MyController(mockModel);
```

---

## 4. Avoid `jest.mock('../../../db')` If Possible

Mock individual table models directly and pass them in — this is cleaner and avoids import timing issues.

---

## 5. Use Factory Helpers (Optional)

To reduce repetition:
```js
function makeMockController(overrides = {}) {
  const mock = { insert: jest.fn(), ...overrides };
  return new MyController(mock);
}
```

---

## 6. Keep Tests Isolated

- Reset mocks between tests with `jest.clearAllMocks()`
- Never rely on shared state or the real database in unit tests

---

## 7. Integration Tests

- Use the real controller instance
- Stub or seed the DB using test migrations or setup scripts
- Keep each test case independent

---


---

## 8. When to Use Custom Tests

Use `runControllerCrudUnitTests()` to cover standard CRUD behavior inherited from `BaseController`.

However, when a controller overrides methods to apply business rules — such as conditional logic, pre-checks, or transformations — it's best to write targeted tests explicitly.

For example:
```js
async create(req, res) {
  const result = await db.query(...);
  if (!result) return res.status(403).json({ error: 'Forbidden' });
  return super.create(req, res);
}
```

This kind of logic is not testable via generic helpers and should be verified using custom assertions that test both branches of the conditional and their effects.

Mixing `runControllerCrudUnitTests()` for baseline validation and specific `describe()` blocks for business logic gives you the best balance of coverage and clarity.

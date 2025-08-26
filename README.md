# Vision

NAP (Next-Gen Accounting Platform) is a unified system for project-based cost management and accounting. It is built to serve organizations such as construction firms, consultants, and service contractors who need to plan, control, and report on complex projects.

The platform enables users to:

- Define projects, activities, and budgets at a granular level.
- Record actual costs, track change orders, and monitor budget vs. actual performance in real time.
- Manage vendors, accounts payable/receivable, and general ledger entries.
- Consolidate reporting across multiple companies or tenants while keeping data securely isolated.
- Work in role-specific contexts (e.g., project manager, estimator, accountant, admin, viewer) with clear permissions and workflows.

The goal of NAP is to provide a single source of truth for financial and project data — combining cost tracking, accounting, and reporting in a modern, scalable, multi-tenant architecture with a simple client interface.

# nap Monorepo

## Overview

This repository contains the **nap** project, organized as a monorepo using npm workspaces.

- **apps/nap-serv** — The backend server (Node.js, Express, PostgreSQL).
- **apps/nap-client** — The React client (Vite + MUI).
- **packages/shared** — Shared utilities, constants, and API helpers imported by both server and client.

The monorepo structure allows code sharing, consistent tooling, and unified CI/CD.

---

## How to Participate

We welcome contributions! Here’s how to be part of the project:

1. **Fork the repo** on GitHub.
2. **Clone your fork locally**:
   ```bash
   git clone git@github.com:<your-username>/nap.git
   cd nap
   ```
3. **Create a new branch** for your work:
   ```bash
   git checkout -b feat/my-feature
   ```
4. Make changes and commit with [Conventional Commit](https://www.conventionalcommits.org/) messages (e.g. `feat(client): add login form`).
5. Push your branch and open a Pull Request.

---

## Getting Started (After Cloning)

After cloning the repo, follow these steps:

### 1. Install dependencies

From the repo root:

```bash
npm install
```

This installs all dependencies for `nap-serv`, `nap-client`, and `packages/shared` using npm workspaces.

### 2. Enable Husky Git hooks

Ensure pre-commit hooks are executable:

```bash
chmod +x .husky/pre-commit
```

This enforces commit checks (e.g. blocking mixed commits across apps).

### 3. Start development servers

Run backend and frontend together:

```bash
npm run dev
```

Or separately:

```bash
npm run dev:serv
npm run dev:client
```

### 4. Run tests

```bash
npm test
```

---

## Contribution Guidelines

- Keep commits **scoped** to one app/package when possible (`feat(serv): ...`, `fix(client): ...`).
- Use **Pull Requests** for all changes (even if you’re solo, for history clarity).
- Run `npm run lint` before committing.

---

## License

Licensed under the MIT License. See the `LICENSE` file in the repository root for full text.

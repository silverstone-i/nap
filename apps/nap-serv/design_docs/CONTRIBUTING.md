

# Contributing to nap-serv

Thank you for considering contributing to **nap-serv**! Your input is invaluable in enhancing this project. This guide outlines the process for contributing, including coding standards, naming conventions, and the workflow for submitting changes.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [How to Contribute](#how-to-contribute)
   - [Reporting Bugs](#reporting-bugs)
   - [Suggesting Enhancements](#suggesting-enhancements)
   - [Submitting Pull Requests](#submitting-pull-requests)
4. [Coding Standards](#coding-standards)
   - [File and Module Naming](#file-and-module-naming)
   - [Code Style](#code-style)
   - [Commit Messages](#commit-messages)
5. [Testing](#testing)
6. [Community Support](#community-support)

---

## Code of Conduct

We are committed to fostering an open and welcoming environment. Please review our [Code of Conduct](CODE_OF_CONDUCT.md) to understand the expectations for behavior in our community.

---

## Getting Started

To set up the development environment:

1. **Clone the repository**:

   ```bash
   git clone https://github.com/silverstone-i/nap-serv.git
   cd nap-serv
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**:

   Create a `.env` file in the root directory and configure the necessary environment variables as outlined in `README.md`.

4. **Run the application**:

   ```bash
   npm start
   ```

---

## How to Contribute

### Reporting Bugs

If you encounter a bug:

- **Search existing issues** to see if it has already been reported.
- **Create a new issue** if it hasn't been reported, providing:
  - A clear and descriptive title.
  - Steps to reproduce the issue.
  - Expected and actual results.
  - Any relevant logs or screenshots.

### Suggesting Enhancements

To suggest a new feature or improvement:

- **Check existing issues** to avoid duplicates.
- **Open a new issue**, detailing:
  - The problem your enhancement addresses.
  - A detailed description of the proposed solution.
  - Any alternatives considered.

### Submitting Pull Requests

When you're ready to submit changes:

1. **Fork the repository** and create a new branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**, adhering to the [Coding Standards](#coding-standards).

3. **Write or update tests** to cover your changes.

4. **Commit your changes** with a clear message (see [Commit Messages](#commit-messages)).

5. **Push to your fork** and open a pull request against the `main` branch.

6. **Ensure all checks pass** and address any review comments.

---

## Coding Standards

### File and Module Naming

To maintain consistency:

- **Modules**:
  - Use plural names for modules managing collections (e.g., `tenants`, `projects`).
  - Use singular names for conceptual modules (e.g., `accounting`, `shared`).

- **Files**:
  - Repository files: `<moduleName>Repositories.js` (e.g., `tenantsRepositories.js`).
  - Controller files: `<moduleName>Controller.js` (e.g., `tenantsController.js`).
  - Route files: `<moduleName>Routes.js` (e.g., `tenantsRoutes.js`).

Avoid using `index.js` files to prevent ambiguity during refactoring.

### Code Style

- **Language**: JavaScript (ES6+).
- **Linting**: Use ESLint with the project's configuration.
- **Formatting**: Use Prettier for consistent code formatting.

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(scope): <description>
```

Examples:

- `feat(tenants): add new tenant onboarding process`
- `fix(accounting): correct balance calculation error`

Types include: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

---

## Testing

Ensure your changes are covered by tests:

- **Run tests**:

   ```bash
   npm test
   ```

- **Add tests** for new features or bug fixes in the appropriate test files.

- **Ensure all tests pass** before submitting a pull request.

---

## Community Support

If you have questions or need assistance:

- **Open an issue** with your query.
- **Join our community discussions** on [Discussion Forum/Slack/Discord] (link to be provided).

We appreciate your contributions and look forward to collaborating with you!
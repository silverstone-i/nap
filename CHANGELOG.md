# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under `## [Unreleased]`. Release automation promotes them
when a pull request with a release label merges into `main`.

## [Unreleased]

### Added

- Add PostgreSQL revision vectors and optional Redis validation for consistent Admin authorization caches.

## [v0.3.0] - 2026-09-19

### Added

- Add scoped Admin tenant, portal-user, credential, and membership reads with safe field selection and stable pagination.

## [v0.2.0] - 2026-09-19

### Added

- Set up and migrate the Admin database locally and on Render, with schema verification and retry recovery.
- Serve the built web client through the BFF and check Admin database readiness before accepting requests.

### Changed

- Define the Admin Tenancy PRD work units, database schema contracts, and tenant role seeding; refine PRD authoring guidance.
- Document workspace responsibilities, database setup, and runtime configuration; add PostgreSQL integration tests to CI.

## [v0.1.0] - 2026-09-17

### Fixed

- Allow the first automated release without a pre-existing version tag and
  prevent unlabeled merges from publishing pending releases.

### Changed

- Document the BFF, admin/cell architecture, migration strategy, and module boundaries.
- Add PRD authoring guidance and a reusable requirements template.
- Add the NAP brand reference, visual specimens, and favicon assets.
- Add the development roadmap and CI validation for declared progress updates
  and completion evidence; unrelated PRs require no roadmap update.

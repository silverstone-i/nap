/**
 * @file Central module registry — maps modules to their repositories and migrations
 * @module nap-serv/db/moduleRegistry
 *
 * Modules are added here as each phase is implemented. Each module entry
 * specifies its scope (admin or tenant), its repository map, and its
 * migration list.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

const moduleRegistry = [];

export default moduleRegistry;

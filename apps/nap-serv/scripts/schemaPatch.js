

import fs from 'fs';
import path from 'path';

const PATCHES = [
  {
    oldFile: 'unitsSchema.js',
    newFile: 'subProjectsSchema.js',
    oldTable: 'units',
    newTable: 'sub_projects',
  },
  {
    oldFile: 'unitAssignmentsSchema.js',
    newFile: 'subProjectAssignmentsSchema.js',
    oldTable: 'unit_assignments',
    newTable: 'sub_project_assignments',
  },
  {
    oldFile: 'unitBudgetsSchema.js',
    newFile: 'templatesSchema.js',
    oldTable: 'unit_budgets',
    newTable: 'templates',
  }
];

const baseDir = path.resolve('./modules/activities/schemas');

PATCHES.forEach(({ oldFile, newFile, oldTable, newTable }) => {
  const oldPath = path.join(baseDir, oldFile);
  const newPath = path.join(baseDir, newFile);

  if (!fs.existsSync(oldPath)) {
    console.warn(`File not found: ${oldFile}`);
    return;
  }

  let content = fs.readFileSync(oldPath, 'utf8');

  // Replace table name inside schema definition
  content = content.replace(
    new RegExp(`table:\\s*['"\`]${oldTable}['"\`]`, 'g'),
    `table: '${newTable}'`
  );

  // Rename file
  fs.writeFileSync(newPath, content, 'utf8');
  fs.unlinkSync(oldPath);

  console.log(`Renamed and patched ${oldFile} → ${newFile}`);
});

// modules/activities/schemas/
// ├── activitiesSchema.js
// ├── categoriesSchema.js
// ├── changeOrderLinesSchema.js
// ├── costLinesSchema.js
// ├── actualCostsSchema.js
// ├── projectsSchema.js
// ├── subProjectsSchema.js                ← was units
// ├── subProjectAssignmentsSchema.js      ← was unit_assignments
// ├── templatesSchema.js                  ← was unit_budgets
// └── subProjectBudgetsSchema.js          ← new snapshot table
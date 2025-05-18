

import fs from 'fs';
import path from 'path';

const PATCHES = [
  {
    oldFile: 'unitsSchema.js',
    newFile: 'deliverablesSchema.js',
    oldTable: 'units',
    newTable: 'deliverables',
  },
  {
    oldFile: 'unitAssignmentsSchema.js',
    newFile: 'deliverableAssignmentsSchema.js',
    oldTable: 'unit_assignments',
    newTable: 'deliverable_assignments',
  },
  {
    oldFile: 'unitBudgetsSchema.js',
    newFile: 'budgetsSchema.js',
    oldTable: 'unit_budgets',
    newTable: 'budgets',
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
// ├── deliverablesSchema.js                ← was units
// ├── deliverableAssignmentsSchema.js      ← was unit_assignments
// ├── budgetsSchema.js                  ← was unit_budgets
// └── deliverableBudgetsSchema.js          ← new snapshot table
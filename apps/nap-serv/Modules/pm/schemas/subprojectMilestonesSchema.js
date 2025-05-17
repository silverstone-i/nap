

export default {
  table: 'subproject_milestones',
  schema: 'pm',
  columns: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'project_id', type: 'uuid', references: { table: 'pm.projects', column: 'id' } },
    { name: 'code', type: 'varchar(12)' }, // e.g., PLAN01, FRAMING2
    { name: 'name', type: 'varchar(100)' },
    { name: 'description', type: 'text', nullable: true },
    { name: 'status', type: 'varchar(20)', default: `'draft'` },
    { name: 'start_date', type: 'date', nullable: true },
    { name: 'end_date', type: 'date', nullable: true }
  ],
  hasAuditFields: true
};
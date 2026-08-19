---
name: adr-index
description: Update docs/ADRs/INDEX.md so it matches the ADR files on disk. Use after writing a new ADR, changing an ADR's status or title, or renaming/removing an ADR file.
---

# ADR Index

Reconcile `docs/ADRs/INDEX.md` with the ADRs on disk. Edit the index only —
never the ADRs themselves.

## Steps

1. List the ADRs and read the index:

   ```bash
   ls docs/ADRs/
   ```

   Read `docs/ADRs/INDEX.md`. Compute the three differences: ADR files with no
   row, rows with no file, and rows whose Title/Status/Date disagree with the
   file.

2. Read each ADR that needs a row or a correction. Take the number and title
   from the H1 (`# NNNN — Title`) and the status and date from the
   `**Status:**` / `**Date:**` bullets, verbatim.

3. Write the scope cell from the ADR's Decision sections. List the directories,
   file paths, and named concepts the decision governs — the terms someone would
   match a task against. Concrete nouns, not a summary of the reasoning; roughly
   25 words, semicolons between distinct decisions.

4. Insert or update the row in ascending ADR-number order. For a superseded ADR,
   keep the row and set its status to `Superseded by NNNN`. For a deleted file,
   delete the row.

5. Report what changed in one line per row. Do not commit unless asked — if
   asked, note that the index change belongs in the same commit as the ADR.

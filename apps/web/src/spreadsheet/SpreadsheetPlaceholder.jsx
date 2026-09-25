/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

/**
 * A small, representative editable grid demonstrating the interaction
 * pattern a future spreadsheet-style work area needs (I0001-R018,
 * "space for future spreadsheet-style editors"): arrow-key navigation,
 * range selection, clipboard copy/paste, bulk cell editing, and inline
 * validation. Deliberately not a spreadsheet package or a product
 * feature — a fixed demo shape proving the shell can host this pattern
 * without redesign. `columns` and `initialRows` are demo data only.
 * @param {{columns?: string[], initialRows?: string[][]}} [props]
 * @returns {JSX.Element}
 */
export function SpreadsheetPlaceholder({
  columns = ['A', 'B', 'C', 'D'],
  initialRows = Array.from({ length: 6 }, () => Array(4).fill('')),
}) {
  const theme = useTheme();
  const [rows, setRows] = useState(initialRows);
  const [active, setActive] = useState({ row: 0, col: 0 });
  const [anchor, setAnchor] = useState({ row: 0, col: 0 });
  const [editingValue, setEditingValue] = useState(null);
  const [notice, setNotice] = useState('');

  const selection = useMemo(() => {
    const rowStart = Math.min(anchor.row, active.row);
    const rowEnd = Math.max(anchor.row, active.row);
    const colStart = Math.min(anchor.col, active.col);
    const colEnd = Math.max(anchor.col, active.col);
    return { rowStart, rowEnd, colStart, colEnd };
  }, [anchor, active]);

  const isSelected = (r, c) =>
    r >= selection.rowStart &&
    r <= selection.rowEnd &&
    c >= selection.colStart &&
    c <= selection.colEnd;

  const isValid = value => value === '' || /^-?\d+(\.\d+)?$/.test(value);

  const clampMove = useCallback(
    (row, col, extend) => {
      const nextRow = Math.max(0, Math.min(rows.length - 1, row));
      const nextCol = Math.max(0, Math.min(columns.length - 1, col));
      setActive({ row: nextRow, col: nextCol });
      if (!extend) setAnchor({ row: nextRow, col: nextCol });
    },
    [rows.length, columns.length]
  );

  const writeCell = useCallback((row, col, value) => {
    setRows(prev => {
      const next = prev.map(line => [...line]);
      next[row][col] = value;
      return next;
    });
  }, []);

  /** Bulk edit: apply one value to every cell in the current selection (Ctrl/Cmd+Enter). */
  const fillSelection = useCallback(
    value => {
      setRows(prev => {
        const next = prev.map(line => [...line]);
        for (let r = selection.rowStart; r <= selection.rowEnd; r += 1)
          for (let c = selection.colStart; c <= selection.colEnd; c += 1)
            next[r][c] = value;
        return next;
      });
      setNotice(
        `Filled ${(selection.rowEnd - selection.rowStart + 1) * (selection.colEnd - selection.colStart + 1)} cells.`
      );
    },
    [selection]
  );

  const copySelection = useCallback(async () => {
    const lines = [];
    for (let r = selection.rowStart; r <= selection.rowEnd; r += 1)
      lines.push(
        rows[r].slice(selection.colStart, selection.colEnd + 1).join('\t')
      );
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copied selection.');
    } catch {
      setNotice('Could not access the clipboard.');
    }
  }, [rows, selection]);

  const pasteAtActive = useCallback(async () => {
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setNotice('Could not access the clipboard.');
      return;
    }
    const lines = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ''));
    setRows(prev => {
      const next = prev.map(line => [...line]);
      lines.forEach((line, rowOffset) => {
        const cells = line.split('\t');
        cells.forEach((value, colOffset) => {
          const r = active.row + rowOffset;
          const c = active.col + colOffset;
          if (r < next.length && c < next[0].length) next[r][c] = value;
        });
      });
      return next;
    });
    setNotice('Pasted from clipboard.');
  }, [active]);

  const handleKeyDown = event => {
    if (editingValue !== null) {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) fillSelection(editingValue);
        else writeCell(active.row, active.col, editingValue);
        setEditingValue(null);
      } else if (event.key === 'Escape') {
        setEditingValue(null);
      }
      return;
    }

    const extend = event.shiftKey;
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        clampMove(active.row - 1, active.col, extend);
        return;
      case 'ArrowDown':
        event.preventDefault();
        clampMove(active.row + 1, active.col, extend);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        clampMove(active.row, active.col - 1, extend);
        return;
      case 'ArrowRight':
        event.preventDefault();
        clampMove(active.row, active.col + 1, extend);
        return;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        setEditingValue(rows[active.row][active.col]);
        return;
      case 'c':
      case 'C':
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          copySelection();
        }
        return;
      case 'v':
      case 'V':
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          pasteAtActive();
        }
        return;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          setEditingValue(event.key);
        }
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Arrow keys to move, Shift+Arrow to extend selection, type to edit,
        Ctrl/Cmd+Enter to fill the selection, Ctrl/Cmd+C/V to copy and paste.
      </Typography>
      <TableContainer
        role="grid"
        aria-label="Spreadsheet-style example"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        sx={{
          border: 1,
          borderColor: 'divider',
          maxWidth: 560,
          outline: 'none',
          '&:focus-visible': {
            boxShadow: `0 0 0 3px ${theme.custom.focusRing}`,
          },
        }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map(label => (
                <TableCell key={label} sx={{ fontWeight: 500 }}>
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((line, r) => (
              <TableRow key={r}>
                {line.map((value, c) => {
                  const activeCell = active.row === r && active.col === c;
                  const selected = isSelected(r, c);
                  const valid = isValid(value);
                  return (
                    <TableCell
                      key={c}
                      role="gridcell"
                      aria-selected={selected}
                      aria-invalid={!valid}
                      onMouseDown={() => clampMove(r, c, false)}
                      sx={{
                        fontFamily: theme.custom.fontMono,
                        cursor: 'cell',
                        userSelect: 'none',
                        bgcolor: activeCell
                          ? theme.custom.subtle
                          : selected
                            ? theme.custom.subtle
                            : undefined,
                        outline: activeCell
                          ? `2px solid ${theme.palette.primary.main}`
                          : 'none',
                        outlineOffset: -2,
                        color: valid
                          ? 'text.primary'
                          : theme.palette.error.main,
                      }}
                    >
                      {activeCell && editingValue !== null ? (
                        <input
                          autoFocus
                          value={editingValue}
                          onChange={event =>
                            setEditingValue(event.target.value)
                          }
                          aria-label={`Edit cell row ${r + 1} column ${columns[c]}`}
                          style={{
                            width: '100%',
                            font: 'inherit',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                          }}
                        />
                      ) : (
                        value
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography
        variant="body2"
        color="text.secondary"
        aria-live="polite"
        sx={{ mt: 1 }}
      >
        {notice}
      </Typography>
    </Box>
  );
}

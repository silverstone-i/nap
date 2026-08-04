/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { Close as CloseIcon } from '@mui/icons-material';
import type { Invoice } from '../mocks/types';
import { formatCurrency, formatDate } from '../lib/format';
import { InvoiceStatusChip } from '../lib/StatusChip';
import { fontMono, gold } from '../theme/tokens';

export function InvoicePreviewDrawer({
  invoice,
  onClose,
}: {
  invoice: Invoice | undefined;
  onClose: () => void;
}) {
  return (
    <Drawer anchor="right" open={Boolean(invoice)} onClose={onClose}>
      {invoice && (
        <Box sx={{ width: 440, p: 3 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
              {invoice.number}
            </Typography>
            <InvoiceStatusChip status={invoice.status} />
            <IconButton onClick={onClose} aria-label="Close preview">
              <CloseIcon />
            </IconButton>
          </Stack>
          <Typography sx={{ mt: 1 }}>{invoice.vendor}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Issued {formatDate(invoice.issuedDate)} · Due{' '}
            {formatDate(invoice.dueDate)}
          </Typography>

          <Table size="small" sx={{ mt: 3 }}>
            <TableHead>
              <TableRow>
                <TableCell>Cost code</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoice.lines.map(line => (
                <TableRow key={line.id}>
                  <TableCell sx={{ fontFamily: fontMono, fontSize: 13 }}>
                    {line.costCode}
                  </TableCell>
                  <TableCell>{line.description}</TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontFamily: fontMono, fontSize: 13 }}
                  >
                    {formatCurrency(line.amount)}
                  </TableCell>
                </TableRow>
              ))}
              {/* Final-total rule: the 2px gold bar above the totals row —
                  gold use #3 of the three shell uses (gold discipline). */}
              <TableRow>
                <TableCell
                  colSpan={2}
                  sx={{ borderTop: `2px solid ${gold}`, fontWeight: 500 }}
                >
                  Total
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    borderTop: `2px solid ${gold}`,
                    fontFamily: fontMono,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {formatCurrency(invoice.amount)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      )}
    </Drawer>
  );
}

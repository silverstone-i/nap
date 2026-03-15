/**
 * @file Reusable spreadsheet import dialog — file picker + FormDialog wrapper
 * @module nap-client/components/shared/ImportDialog
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useCallback, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FormDialog from './FormDialog.jsx';

export default function ImportDialog({ open, title = 'Import Spreadsheet', loading, onSubmit, onCancel }) {
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (!open) setFile(null);
  }, [open]);

  const handleFileChange = useCallback((e) => {
    setFile(e.target.files?.[0] || null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    onSubmit(fd);
  }, [file, onSubmit]);

  return (
    <FormDialog
      open={open}
      title={title}
      submitLabel="Import"
      loading={loading}
      submitDisabled={!file}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    >
      <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
        {file ? file.name : 'Choose .xlsx file'}
        <input type="file" hidden accept=".xlsx,.xls" onChange={handleFileChange} />
      </Button>
      {file && (
        <Typography variant="body2" color="text.secondary">
          {(file.size / 1024).toFixed(1)} KB
        </Typography>
      )}
    </FormDialog>
  );
}

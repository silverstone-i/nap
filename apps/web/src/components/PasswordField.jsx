/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

/**
 * A password `TextField` with a button that shows or hides the value.
 * Accepts every `TextField` prop except `type`.
 * @param {import('@mui/material/TextField').TextFieldProps} props
 * @returns {JSX.Element}
 */
export function PasswordField(props) {
  const [visible, setVisible] = useState(false);
  const input = props.slotProps?.input ?? {};
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      slotProps={{
        ...props.slotProps,
        input: {
          ...input,
          endAdornment: (
            <>
              {input.endAdornment}
              <InputAdornment position="end">
                <IconButton
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  onClick={() => setVisible(value => !value)}
                  onMouseDown={event => event.preventDefault()}
                  edge="end"
                >
                  {visible ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            </>
          ),
        },
      }}
    />
  );
}

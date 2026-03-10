/**
 * @file Pattern-formatted text field — formats display value with a placeholder pattern
 * @module nap-client/components/shared/PatternTextField
 *
 * Wraps MUI TextField to display a raw value formatted by a pattern (e.g. `XXX-XX-XXXX`)
 * while storing only the stripped raw value. Uses the same pattern string as the
 * input placeholder when one is not explicitly provided.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import TextField from '@mui/material/TextField';
import { formatByPattern, stripFormatting } from '../../utils/formatByPattern.js';

/**
 * A TextField that formats its display value using a placeholder pattern.
 * @param {object} props
 * @param {string} props.value        Raw (unformatted) value
 * @param {function} props.onChange    Called with the stripped raw value: `(rawValue) => void`
 * @param {string} [props.pattern]    Format pattern where `X` = input character
 * @param {object} [rest]             Forwarded to MUI TextField
 */
export default function PatternTextField({ value, onChange, pattern, ...rest }) {
  return (
    <TextField
      {...rest}
      value={formatByPattern(value, pattern)}
      onChange={(e) => onChange(stripFormatting(e.target.value))}
      placeholder={rest.placeholder ?? pattern}
    />
  );
}

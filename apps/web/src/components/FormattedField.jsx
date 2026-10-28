/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useLayoutEffect, useRef } from 'react';
import TextField from '@mui/material/TextField';

// Characters the user types; everything else is layout the format adds.
const TYPED = /[0-9A-Za-z+]/;

/**
 * Index of the typed character nearest `from`, stepping by `step`.
 * @param {string} text
 * @param {number} from
 * @param {1|-1} step
 * @returns {number} -1 when there is none.
 */
function typedIndex(text, from, step) {
  for (let i = from; i >= 0 && i < text.length; i += step)
    if (TYPED.test(text[i])) return i;
  return -1;
}

/**
 * The caret position just after the `count`th typed character of `text`.
 * @param {string} text
 * @param {number} count
 * @returns {number}
 */
function caretAfter(text, count) {
  if (count === 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i += 1)
    if (TYPED.test(text[i]) && ++seen === count) return i + 1;
  return text.length;
}

/**
 * A `TextField` that reformats its value on every keystroke, such as a tax
 * ID into its mask or a phone as you type. The caret stays after the same
 * typed character, and backspace or delete next to layout the format puts
 * back (a `-` or `)`) removes the typed character beside it instead.
 * Accepts every `TextField` prop except `inputRef`.
 * @param {import('@mui/material/TextField').TextFieldProps & {value: string, onChange: (value: string) => void, format: (input: string) => string}} props
 * @returns {JSX.Element}
 */
export function FormattedField({ value, onChange, format, ...props }) {
  const inputRef = useRef(null);
  const caret = useRef(null);

  useLayoutEffect(() => {
    if (caret.current === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  function handleChange(event) {
    const input = event.target;
    let raw = input.value;
    let at = input.selectionStart ?? raw.length;
    let next = format(raw);
    if (next === value && raw.length < value.length) {
      const forward = event.nativeEvent?.inputType === 'deleteContentForward';
      const i = forward ? typedIndex(raw, at, 1) : typedIndex(raw, at - 1, -1);
      if (i !== -1) {
        raw = raw.slice(0, i) + raw.slice(i + 1);
        at = Math.min(at, i);
        next = format(raw);
      }
    }
    // The text before the caret, formatted, ends where the caret goes. A
    // format that lays out a prefix differently falls back to counting.
    const before = format(raw.slice(0, at));
    caret.current = next.startsWith(before)
      ? before.length
      : caretAfter(
          next,
          [...raw.slice(0, at)].filter(c => TYPED.test(c)).length
        );
    if (next === value) {
      // No re-render follows, and React puts the old value back after this
      // handler, so place the caret once it has.
      const position = caret.current;
      caret.current = null;
      queueMicrotask(() => input.setSelectionRange(position, position));
    }
    onChange(next);
  }

  return (
    <TextField
      {...props}
      value={value}
      onChange={handleChange}
      inputRef={inputRef}
    />
  );
}

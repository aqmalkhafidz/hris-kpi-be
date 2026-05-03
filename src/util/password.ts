import { PASSWORD_MIN_LEN } from '../config.js';
import { fail } from '../http/error.js';

export function validatePassword(value: string): void {
  if (value.length < PASSWORD_MIN_LEN)
    fail(400, `Password must be at least ${PASSWORD_MIN_LEN} characters`);
  // Require at least 3 of: lower, upper, digit, symbol.
  const classes = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /[0-9]/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length;
  if (classes < 3)
    fail(
      400,
      'Password must mix at least 3 of: lowercase, uppercase, digit, symbol'
    );
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  signInSchema,
  signUpSchema,
} from './credentials.ts';

test('sign-up validation normalizes email and accepts the password policy', () => {
  const result = signUpSchema.parse({
    fullName: '  Alex Morgan  ',
    email: '  ALEX@Example.COM ',
    password: 'Secure123',
    passwordConfirmation: 'Secure123',
  });

  assert.equal(result.fullName, 'Alex Morgan');
  assert.equal(result.email, 'alex@example.com');
});

test('sign-up validation reports password confirmation mismatch', () => {
  const result = signUpSchema.safeParse({
    fullName: 'Alex Morgan',
    email: 'alex@example.com',
    password: 'Secure123',
    passwordConfirmation: 'Different123',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(
      result.error.flatten().fieldErrors.passwordConfirmation,
      ['Passwords do not match.'],
    );
  }
});

test('sign-in validation requires a valid normalized email and password', () => {
  const valid = signInSchema.parse({
    email: ' MERCHANT@Example.com ',
    password: 'value',
  });
  assert.equal(valid.email, 'merchant@example.com');

  const invalid = signInSchema.safeParse({
    email: 'not-an-email',
    password: '',
  });
  assert.equal(invalid.success, false);
});

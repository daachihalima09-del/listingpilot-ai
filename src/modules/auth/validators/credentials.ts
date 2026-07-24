import { z } from 'zod';

const MAX_PASSWORD_LENGTH = 128;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const emailSchema = z.preprocess(
  (value) => typeof value === 'string' ? normalizeEmail(value) : value,
  z.string()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.')
    .max(320, 'Email must be 320 characters or fewer.'),
);

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters.')
  .max(MAX_PASSWORD_LENGTH, `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`)
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/[0-9]/, 'Password must include a number.');

export const signUpSchema = z.object({
  fullName: z.string()
    .trim()
    .min(1, 'Full name is required.')
    .max(200, 'Full name must be 200 characters or fewer.'),
  email: emailSchema,
  password: passwordSchema,
  passwordConfirmation: z.string().min(1, 'Confirm your password.'),
}).strict().superRefine((value, context) => {
  if (value.password !== value.passwordConfirmation) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['passwordConfirmation'],
      message: 'Passwords do not match.',
    });
  }
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string()
    .min(1, 'Password is required.')
    .max(MAX_PASSWORD_LENGTH, `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`),
}).strict();

export type SignUpInput = z.input<typeof signUpSchema>;
export type ValidatedSignUpInput = z.output<typeof signUpSchema>;
export type SignInInput = z.input<typeof signInSchema>;
export type ValidatedSignInInput = z.output<typeof signInSchema>;

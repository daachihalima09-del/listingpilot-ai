import {
  argon2id,
  hash,
  verify,
  type Options,
} from 'argon2';

const ARGON2ID_OPTIONS: Options & { type: number } = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

let dummyPasswordHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword('ListingPilot timing equalization value');
  return dummyPasswordHash;
}

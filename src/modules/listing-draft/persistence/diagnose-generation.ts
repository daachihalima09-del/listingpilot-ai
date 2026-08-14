import { readGenerationTrace } from './generation-trace.server.ts';

const requestId = process.argv[2];
if (!requestId) throw new Error('Usage: npm run diagnose:generation -- <reference-id>');
const trace = await readGenerationTrace(requestId);
if (!trace) throw new Error(`No development trace found for ${requestId}.`);
console.log(JSON.stringify(trace, null, 2));

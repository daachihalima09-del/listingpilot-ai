import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProjectSchema,
  saveProjectStateSchema,
} from './project.ts';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';

test('project creation normalizes names and accepts optional source data', () => {
  const result = createProjectSchema.parse({
    workspaceId,
    name: '  Summer   Catalog  ',
    sourceType: 'SUPPLIER_URL',
    sourceUrl: 'https://supplier.example.com/product',
    rawInput: null,
  });

  assert.equal(result.name, 'Summer   Catalog');
  assert.equal(result.sourceType, 'SUPPLIER_URL');
});

test('project validation rejects unsafe URLs, short names, and unknown fields', () => {
  assert.equal(createProjectSchema.safeParse({
    workspaceId,
    name: 'x',
    sourceType: 'SUPPLIER_URL',
    sourceUrl: 'https://user:password@example.com/product',
    rawInput: null,
    role: 'OWNER',
  }).success, false);
});

test('project state accepts only structured persistence fields', () => {
  const result = saveProjectStateSchema.safeParse({
    workspaceId,
    projectId,
    version: 1,
    sourceType: 'RAW_SPECIFICATIONS',
    sourceUrl: null,
    rawInput: 'Material: cotton',
    analysisData: null,
    generatedListing: {
      title: 'Cotton shirt',
      description: 'A comfortable cotton shirt.',
      keyFeatures: 'Cotton\nMachine washable',
    },
    seoData: {
      seoTitle: 'Cotton Shirt',
      seoDescription: 'Shop a comfortable cotton shirt.',
      tags: 'cotton,shirt',
    },
    readinessData: {
      analysisStarted: false,
      activeStage: 'input',
      completedStages: [],
      shopifyReady: false,
    },
  });
  assert.equal(result.success, true);
});

test('project state rejects arbitrary session or authentication data', () => {
  const result = saveProjectStateSchema.safeParse({
    workspaceId,
    projectId,
    version: 1,
    sourceType: null,
    sourceUrl: null,
    rawInput: null,
    analysisData: null,
    generatedListing: null,
    seoData: null,
    readinessData: null,
    sessionToken: 'must-not-be-stored',
  });
  assert.equal(result.success, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { inviteSharePath, normalizeInviteCode } from '../src/lib/invite.ts';

test('normalizes invite codes for typed and URL values', () => {
  assert.equal(normalizeInviteCode('  ab3k9xyz '), 'AB3K9XYZ');
});

test('builds invite links under the deployed base path', () => {
  assert.equal(
    inviteSharePath('/couple-spending/', 'ab3k9xyz'),
    '/couple-spending/?invite=AB3K9XYZ',
  );
  assert.equal(inviteSharePath('/', 'AB3K9XYZ'), '/?invite=AB3K9XYZ');
});

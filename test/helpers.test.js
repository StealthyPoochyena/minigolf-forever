import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtDate, fmt1, courseName } from '../js/views/helpers.js';
import { courses } from './fixtures.js';

test('esc escapes HTML metacharacters', () => {
  assert.equal(esc(`<b>"a" & 'b'</b>`), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
});

test('fmtDate renders a readable date', () => {
  assert.equal(fmtDate('2026-07-12'), '12 Jul 2026');
});

test('fmt1 rounds to one decimal', () => {
  assert.equal(fmt1(2.4499), '2.4');
  assert.equal(fmt1(3), '3.0');
});

test('courseName resolves an id, falling back to the id', () => {
  assert.equal(courseName(courses, 'boom'), 'Golf Boom');
  assert.equal(courseName(courses, 'gone'), 'gone');
});

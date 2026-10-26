import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestVoice, kokoroLabel, rankVoices, voiceLabel, type VoiceInfo } from './index.ts';

const ios: VoiceInfo[] = [
  { id: 'com.apple.speech.synthesis.voice.Albert', name: 'Albert', lang: 'en-US' },
  { id: 'com.apple.eloquence.en-US.Eddy', name: 'Eddy', lang: 'en-US' },
  { id: 'com.apple.voice.compact.en-US.Samantha', name: 'Samantha', lang: 'en-US', quality: 'Default' },
  { id: 'com.apple.voice.enhanced.en-US.Evan', name: 'Evan', lang: 'en-US', quality: 'Enhanced' },
  { id: 'com.apple.voice.premium.en-US.Ava', name: 'Ava', lang: 'en-US', quality: 'Enhanced' },
  { id: 'com.apple.voice.premium.en-GB.Jamie', name: 'Jamie', lang: 'en-GB', quality: 'Enhanced' },
  { id: 'com.apple.voice.compact.fr-FR.Thomas', name: 'Thomas', lang: 'fr-FR' },
  { id: 'com.apple.speech.synthesis.voice.Zarvox', name: 'Zarvox', lang: 'en-US' },
];

test('a Premium voice in your language wins; robotic ones never get picked', () => {
  assert.equal(bestVoice(ios)?.name, 'Ava');
  const names = rankVoices(ios).map((v) => v.name);
  assert.deepEqual(names.slice(0, 3), ['Ava', 'Evan', 'Jamie']);
  for (const bad of ['Albert', 'Eddy', 'Zarvox', 'Thomas']) assert.ok(!names.includes(bad), bad);
  assert.ok(names.includes('Samantha'), 'compact is fine, just last');
});

test('with only compact voices, the compact one is still better than a robot', () => {
  assert.equal(bestVoice(ios.filter((v) => !/premium|enhanced/.test(v.id)))?.name, 'Samantha');
});

test('browser voices: natural and Google voices first', () => {
  const web: VoiceInfo[] = [
    { id: 'Microsoft David - English (United States)', name: 'Microsoft David - English (United States)', lang: 'en-US' },
    { id: 'Microsoft Aria Online (Natural) - English (United States)', name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US' },
    { id: 'Google US English', name: 'Google US English', lang: 'en-US' },
  ];
  assert.deepEqual(rankVoices(web).map((v) => v.name.split(' ')[1]), ['Aria', 'US', 'David']);
});

test('labels', () => {
  assert.equal(voiceLabel(ios[4]!), 'Ava (Premium)');
  assert.equal(voiceLabel(ios[3]!), 'Evan (Enhanced)');
  assert.equal(kokoroLabel('af_heart'), 'Heart (American, female)');
  assert.equal(kokoroLabel('bm_george'), 'George (British, male)');
  assert.equal(kokoroLabel('custom-mix'), 'custom-mix');
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadApp(setupStorage) {
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/',
    virtualConsole: new (require('jsdom')).VirtualConsole().on('jsdomError', error => {
      errors.push(error);
    }),
    beforeParse(window) {
      window.confirm = () => true;
      if (setupStorage) setupStorage(window.localStorage);
    },
  });

  assert.deepEqual(errors, []);
  return dom.window;
}

function savedScores(window) {
  return JSON.parse(window.localStorage.getItem('carcassonneData'));
}

test('creates two players by default and saves them', () => {
  const window = loadApp();

  assert.equal(window.document.querySelectorAll('.player-card').length, 2);
  assert.deepEqual(savedScores(window), [
    { name: 'Player 1', score: 0 },
    { name: 'Player 2', score: 0 },
  ]);
});

test('updates scores and persists player names', () => {
  const window = loadApp();
  const firstName = window.document.querySelector('.player-name');

  firstName.value = 'Blue';
  firstName.dispatchEvent(new window.Event('input'));
  window.updateScore(0, 5);
  window.updateScore(0, -1);

  assert.equal(window.document.querySelector('#score-0').textContent, '4');
  assert.equal(savedScores(window)[0].name, 'Blue');
  assert.equal(savedScores(window)[0].score, 4);
});

test('clamps invalid player count to supported range', () => {
  const window = loadApp();
  const countInput = window.document.querySelector('#playerCount');

  countInput.value = '99';
  window.generatePlayers();
  assert.equal(countInput.value, '8');
  assert.equal(window.document.querySelectorAll('.player-card').length, 8);

  countInput.value = '0';
  window.generatePlayers();
  assert.equal(countInput.value, '1');
  assert.equal(window.document.querySelectorAll('.player-card').length, 1);
});

test('recovers from corrupted saved score data', () => {
  const window = loadApp(storage => {
    storage.setItem('carcassonneData', '{broken');
  });

  assert.equal(window.document.querySelectorAll('.player-card').length, 2);
  assert.deepEqual(savedScores(window), [
    { name: 'Player 1', score: 0 },
    { name: 'Player 2', score: 0 },
  ]);
});

test('switches to Ukrainian and saves language choice', () => {
  const window = loadApp();
  const ukrainianButton = window.document.querySelector('[data-lang="uk"]');

  ukrainianButton.click();

  assert.equal(window.localStorage.getItem('carcassonneLanguage'), 'uk');
  assert.equal(window.document.documentElement.lang, 'uk');
  assert.equal(window.document.querySelector('[data-i18n="playersLabel"]').textContent, 'Гравці:');
  assert.equal(ukrainianButton.getAttribute('aria-pressed'), 'true');
});

test('uses saved Ukrainian language on startup', () => {
  const window = loadApp(storage => {
    storage.setItem('carcassonneLanguage', 'uk');
  });

  assert.equal(window.document.documentElement.lang, 'uk');
  assert.equal(window.document.querySelector('[data-i18n="resetScores"]').textContent, 'Скинути рахунок');
  assert.equal(window.document.querySelector('.player-name').placeholder, 'Гравець 1');
});

test('renders saved player names as text, not injected HTML', () => {
  const window = loadApp(storage => {
    storage.setItem('carcassonneData', JSON.stringify([
      { name: '<img src=x onerror=alert(1)>', score: 7 },
    ]));
  });

  const firstName = window.document.querySelector('.player-name');
  assert.equal(firstName.value, '<img src=x onerror=alert(1)>');
  assert.equal(window.document.querySelectorAll('.player-card img').length, 0);
  assert.equal(window.document.querySelector('#score-0').textContent, '7');
});

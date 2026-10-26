const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const playback = scripts.at(-1)[1];
const messageCount = (playback.match(/\{text:`/g) || []).length;
const cycle = 2200;

function createReader() {
  let now = 0;
  let timerId = 0;
  let randomCalls = 0;
  let seed = 17;
  let selection = { isCollapsed:true, rangeCount:0 };
  const timers = new Map();
  const listeners = new Map();

  function element(tag = 'div') {
    const classes = new Set();
    return {
      style:{}, dataset:{}, attributes:{}, innerHTML:'', textContent:'',
      clientHeight:900, clientWidth:1200, scrollHeight:100, scrollWidth:500, offsetWidth:500,
      classList:{ add:name => classes.add(name), remove:name => classes.delete(name), contains:name => classes.has(name) },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, handler) { this[name] = handler; },
      closest(selector) { return selector.split(',').map(s => s.trim()).includes(tag) ? this : null; }
    };
  }

  const line = element();
  const fade = element();
  const body = element('body');
  const stage = element();
  const button = element('button');
  const label = element();
  const elements = { line, fade, hero:element(), 'playback-toggle':button, 'playback-label':label };
  const math = Object.create(Math);
  math.random = () => {
    randomCalls++;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  class ResizeObserver { observe() {} }
  vm.runInNewContext(playback, {
    document:{
      body,
      getElementById:id => elements[id],
      querySelector:() => stage,
      addEventListener(name, handler) { listeners.set(name, handler); }
    },
    window:{ ResizeObserver, getSelection:() => selection }, ResizeObserver,
    getComputedStyle:() => ({ paddingTop:'64px', paddingBottom:'64px', fontSize:'72px' }),
    performance:{ now:() => now }, Math:math,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { at:now + delay, callback }); return id; },
    clearTimeout:id => timers.delete(id)
  });

  return {
    line, fade, body, stage, button, label, timers,
    text:() => line.innerHTML.replace(/<[^>]*>/g, ''),
    randomCalls:() => randomCalls,
    key(key, options = {}) {
      const event = {
        key, code:key === ' ' ? 'Space' : key, target:body, prevented:false,
        preventDefault() { this.prevented = true; }, ...options
      };
      listeners.get('keydown')(event);
      return event;
    },
    target:element,
    select() {
      selection = { isCollapsed:false, rangeCount:1, getRangeAt:() => ({ intersectsNode:() => true }) };
      listeners.get('selectionchange')();
    },
    tick(ms) {
      const until = now + ms;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next || next[1].at > until) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = until;
    }
  };
}

test('left and right replay the full automatic sequence without another shuffle', () => {
  const reader = createReader();
  const history = [reader.text()];
  for (let i = 1; i < messageCount; i++) {
    reader.tick(cycle);
    history.push(reader.text());
  }
  reader.key(' ');
  for (let i = messageCount - 2; i >= 0; i--) {
    reader.key('ArrowLeft');
    assert.equal(reader.text(), history[i], `rewind position ${i}`);
  }
  for (let i = 0; i < 5; i++) reader.key('ArrowLeft');
  assert.equal(reader.text(), history[0]);
  for (let i = 1; i < messageCount; i++) {
    reader.key('ArrowRight');
    assert.equal(reader.text(), history[i], `forward position ${i}`);
  }
  assert.equal(reader.randomCalls(), messageCount - 1);
  assert.equal(reader.body.dataset.paused, 'true');
});

test('manual skips cancel the old timer and start a full reading interval', () => {
  const reference = createReader();
  reference.tick(cycle);
  const second = reference.text();
  reference.tick(cycle);
  const third = reference.text();
  const reader = createReader();
  reader.tick(1500);
  assert.equal(reader.key('ArrowRight').prevented, true);
  assert.equal(reader.text(), second);
  assert.equal(reader.body.dataset.paused, 'false');
  reader.tick(cycle - 1);
  assert.equal(reader.text(), second);
  reader.tick(1);
  assert.equal(reader.text(), third);
  assert.equal(reader.timers.size, 1);
});

test('navigation during fade-out restores visibility and cancels the old advance', () => {
  const reader = createReader();
  const first = reader.text();
  reader.tick(cycle + 1700);
  assert.equal(reader.line.style.opacity, 0);
  reader.key('ArrowLeft');
  assert.equal(reader.text(), first);
  assert.equal(reader.line.style.opacity, 1);
  reader.tick(500);
  assert.equal(reader.text(), first);
  assert.equal(reader.line.style.opacity, 1);
});

test('paused navigation stays paused and resumes from the selected message', () => {
  const reference = createReader();
  reference.tick(cycle * 2);
  const third = reference.text();
  const reader = createReader();
  reader.key(' ');
  reader.key('ArrowRight');
  const second = reader.text();
  reader.tick(cycle * 10);
  assert.equal(reader.text(), second);
  assert.equal(reader.label.textContent, 'Resume');
  assert.equal(reader.timers.size, 0);
  reader.key(' ');
  reader.tick(cycle - 1);
  assert.equal(reader.text(), second);
  reader.tick(1);
  assert.equal(reader.text(), third);
});

test('pause/resume without navigation retains the remaining time', () => {
  const reader = createReader();
  const first = reader.text();
  reader.tick(1000);
  reader.button.click();
  reader.tick(10000);
  assert.equal(reader.text(), first);
  reader.button.click();
  reader.tick(1199);
  assert.equal(reader.text(), first);
  reader.tick(1);
  const reference = createReader();
  reference.tick(cycle);
  assert.equal(reader.text(), reference.text());
});

test('rapid and held arrows move once per key event, without delayed skips', () => {
  const reference = createReader();
  reference.tick(cycle * 3);
  const reader = createReader();
  for (let i = 0; i < 20; i++) reader.key('ArrowRight', { repeat:i > 0 });
  for (let i = 0; i < 17; i++) reader.key('ArrowLeft', { repeat:i > 0 });
  assert.equal(reader.text(), reference.text());
  assert.equal(reader.timers.size, 1);
  reader.tick(cycle);
  reference.tick(cycle);
  assert.equal(reader.text(), reference.text());
});

test('modifiers and editable fields retain native keys; focused controls allow arrows', () => {
  const reader = createReader();
  const first = reader.text();
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
    assert.equal(reader.key('ArrowRight', { [modifier]:true }).prevented, false);
  }
  for (const tag of ['input', 'textarea', 'select', '[contenteditable]']) {
    assert.equal(reader.key('ArrowRight', { target:reader.target(tag) }).prevented, false);
  }
  assert.equal(reader.text(), first);
  assert.equal(reader.key(' ', { target:reader.button }).prevented, false);
  assert.equal(reader.key('ArrowRight', { target:reader.button }).prevented, true);
  const reference = createReader();
  reference.tick(cycle);
  assert.equal(reader.text(), reference.text());
});

test('the final message is bounded and can be rewound with normal styling restored', () => {
  const reader = createReader();
  reader.key(' ');
  for (let i = 1; i < messageCount; i++) reader.key('ArrowRight');
  const last = reader.text();
  reader.key('ArrowRight');
  assert.equal(reader.text(), 'Just Win.');
  assert.equal(reader.line.classList.contains('flash'), true);
  for (let i = 0; i < 5; i++) reader.key('ArrowRight');
  assert.equal(reader.text(), 'Just Win.');
  reader.key('ArrowLeft');
  assert.equal(reader.text(), last);
  assert.equal(reader.line.classList.contains('flash'), false);
  assert.equal(reader.line.style.transition, '');
  assert.equal(reader.fade.classList.contains('active'), false);
});

test('navigating away from the final transition cancels its pending callback', () => {
  const reader = createReader();
  reader.tick(cycle * (messageCount - 1));
  const last = reader.text();
  reader.tick(cycle + 1000);
  assert.equal(reader.fade.classList.contains('active'), true);
  reader.key('ArrowLeft');
  reader.key(' ');
  reader.tick(10000);
  assert.equal(reader.text(), last);
  assert.equal(reader.fade.classList.contains('active'), false);
  assert.equal(reader.line.classList.contains('flash'), false);
  reader.key(' ');
  reader.tick(cycle + 2000);
  assert.equal(reader.text(), 'Just Win.');
  assert.equal(reader.timers.size, 0);
});

test('selection and reading-area pause controls still work with navigation', () => {
  const reader = createReader();
  reader.stage.pointerdown({ isPrimary:true, button:0 });
  reader.stage.click();
  assert.equal(reader.body.dataset.paused, 'true');
  reader.stage.pointerdown({ isPrimary:true, button:0 });
  reader.stage.click();
  assert.equal(reader.body.dataset.paused, 'false');
  reader.select();
  reader.key('ArrowRight');
  const selected = reader.text();
  reader.tick(10000);
  assert.equal(reader.text(), selected);
  assert.equal(reader.body.dataset.paused, 'true');
});

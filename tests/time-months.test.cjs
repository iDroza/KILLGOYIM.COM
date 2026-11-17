const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'time', 'index.html'), 'utf8');
const clockScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];

function createClock(instant) {
  let now = new Date(instant).getTime();
  let tick;
  let timeout;
  function element() {
    return {
      dataset:{}, attributes:{}, textContent:'', children:[],
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      appendChild(child) {
        if (child.parentElement) child.parentElement.children = child.parentElement.children.filter(item => item !== child);
        this.children.push(child);
        child.parentElement = this;
      }
    };
  }
  const lights = Array.from({ length:12 }, element);
  const strip = element();
  strip.parentElement = element();
  strip.querySelectorAll = () => lights;
  strip.querySelector = () => lights.flatMap(light => light.children).find(child => child.className === 'month-pointer') || null;
  const elements = { 'month-strip':strip };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  vm.runInNewContext(clockScript, {
    Date:ClockDate, Intl,
    document:{
      getElementById(id) { return elements[id] || (elements[id] = element()); },
      createElement:element
    },
    setTimeout(callback) { timeout = callback; },
    setInterval(callback) { tick = callback; }
  });
  timeout();
  return { lights, strip, elements, advance(instant) { now = new Date(instant).getTime(); tick(); } };
}

function assertMonth(clock, month, year) {
  for (let index = 0; index < 12; index++) {
    const light = clock.lights[index];
    assert.equal(light.dataset.state, index < month - 1 ? 'past' : index === month - 1 ? 'current' : 'upcoming');
    assert.equal(light.attributes['aria-current'], index === month - 1 ? 'date' : undefined);
    assert.equal(light.children.length, index === month - 1 ? 1 : 0, 'one pointer over the current month');
  }
  assert.ok(clock.strip.parentElement.attributes['aria-label'].includes(String(year)));
  assert.equal(clock.lights[month - 1].children[0].attributes['aria-hidden'], 'true');
}

test('all twelve months light the current and future months and dim the past', () => {
  const clock = createClock('2026-01-15T20:00:00Z');
  for (let month = 1; month <= 12; month++) {
    clock.advance(`2026-${String(month).padStart(2, '0')}-15T20:00:00Z`);
    assertMonth(clock, month, 2026);
  }
});

test('the live clock moves the same pointer at Los Angeles midnight, not UTC midnight', () => {
  const clock = createClock('2026-12-01T07:59:59Z');
  assertMonth(clock, 11, 2026);
  const pointer = clock.lights[10].children[0];
  clock.advance('2026-12-01T08:00:00Z');
  assertMonth(clock, 12, 2026);
  assert.equal(clock.lights[11].children[0], pointer);
});

test('January resets every light on at the Los Angeles year boundary', () => {
  const clock = createClock('2027-01-01T07:59:59Z');
  assertMonth(clock, 12, 2026);
  clock.advance('2027-01-01T08:00:00Z');
  assertMonth(clock, 1, 2027);
});

test('summer month rollover observes daylight saving time', () => {
  const clock = createClock('2026-08-01T06:59:59Z');
  assertMonth(clock, 7, 2026);
  clock.advance('2026-08-01T07:00:00Z');
  assertMonth(clock, 8, 2026);
});

test('second ticks keep both original clocks running without rebuilding the marker', () => {
  const clock = createClock('2026-11-17T20:00:00Z');
  const pointer = clock.lights[10].children[0];
  assert.equal(clock.elements['l-s'].textContent, '00');
  assert.equal(clock.elements['d-s'].textContent, '00');
  clock.advance('2026-11-17T20:00:01Z');
  assert.equal(clock.elements['l-s'].textContent, '01');
  assert.equal(clock.elements['d-s'].textContent, '59');
  assert.equal(clock.lights[10].children[0], pointer);
  assertMonth(clock, 11, 2026);
});

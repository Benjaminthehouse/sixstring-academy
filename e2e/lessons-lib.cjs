/**
 * Helpers for e2e/lessons.cjs: read the running session from storage, work out the answer with
 * the lesson engine itself (loaded into Node through Vite), and give it the way a learner would:
 * by touch (taps on the real controls) or by keyboard alone (number keys, letters, arrows,
 * Space and Enter). Not a check on its own.
 */
'use strict';

const SLOT = 'ssa:lesson-session.lesson';

/** The saved session of a mode, restored with the engine (null when nothing is saved). */
async function savedSession(page, L, mode = 'lesson') {
  const raw = await page.evaluate((key) => localStorage.getItem(key), `ssa:lesson-session.${mode}`);
  return raw ? L.restoreSession(raw) : null;
}

/** The learner's progress as stored. */
async function storedProgress(page) {
  const raw = await page.evaluate(() => localStorage.getItem('ssa:progress'));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return parsed.state || parsed;
}

/** A plausible wrong answer for an exercise. */
function wrongAnswer(L, ex) {
  // The engine's own wrong answers may use one tile twice; a learner's taps cannot, so swap two.
  const own = ex.type === 'match-pairs' || ex.type === 'order' || ex.type === 'fill-blanks' ? null : L.wrongAnswers(ex)[0];
  if (own) return own;
  switch (ex.type) {
    case 'match-pairs':
      return { type: 'match-pairs', pairs: ex.pairs.map((_p, i) => [i, i < 2 ? 1 - i : i]) };
    case 'order':
      return { type: 'order', order: ex.tiles.map((_t, i) => i).reverse() };
    case 'fill-blanks':
      return { type: 'fill-blanks', blanks: [...ex.blanks].reverse() };
    case 'flashcard':
      return { type: 'flashcard', rating: 'again' };
    case 'type-answer': {
      const spec = ex.answer;
      if (spec.kind === 'number') return { type: 'type-answer', text: String(spec.value + 1) };
      if (spec.kind === 'note') return { type: 'type-answer', text: spec.value.startsWith('C') ? 'D' : 'C' };
      return { type: 'type-answer', text: 'xyz' };
    }
    case 'fretboard-find': {
      const targets = new Set(L.findTargets(ex).map((p) => `${p.string}:${p.fret}`));
      for (let fret = Math.max(1, ex.frets[0]); fret <= ex.frets[1]; fret++) {
        for (let string = 1; string <= 6; string++) if (!targets.has(`${string}:${fret}`)) return { type: 'fretboard-find', positions: [{ string, fret }] };
      }
      return null;
    }
    case 'chord-build': {
      const ref = L.referenceFrets(ex) || [0, 0, 0, 0, 0, 0];
      return { type: 'chord-build', frets: ref.map((f, i) => (i === ref.length - 2 && f !== null ? f + 1 : f)) };
    }
    case 'staff-place': {
      const t = L.staffPlaceTarget(ex);
      return { type: 'staff-place', position: ((t && t.position) || 4) + 1, accidental: null };
    }
    default:
      return null;
  }
}

/** What kind of step is on screen: 'card', 'exercise', 'summary' or null. */
async function onScreen(page) {
  return page.evaluate(() => {
    if (document.querySelector('[data-summary]')) return 'summary';
    const el = document.querySelector('[data-step-kind]');
    return el ? el.getAttribute('data-step-kind') : null;
  });
}

/** The id of the step on screen (key, attempt, tapping version), or null. */
async function stepId(page) {
  return page.evaluate(() => document.querySelector('[data-step-id]')?.getAttribute('data-step-id') ?? null);
}

/** Wait until the step on screen is another one than `previous` (or the summary shows). */
async function waitForNewStep(page, previous, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const id = await stepId(page);
    if (id && id !== previous) return id;
    await page.waitForTimeout(80);
  }
  throw new Error(`The step did not change from ${previous}`);
}

const sel = {
  primary: '[data-player-bar] [data-action="check"], [data-player-bar] [data-action="primary"]',
  cont: '[data-player-bar] [data-action="continue"]',
};

async function press(page, key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(60);
}

async function tap(page, selector) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await el.tap();
  await page.waitForTimeout(60);
}

/** The accessible name the fretboard gives a cell. */
function cellName(pos) {
  return pos.fret === 0 ? `string ${pos.string}, open` : `string ${pos.string}, fret ${pos.fret}`;
}

/** Move keyboard focus into a fretboard's cell grid and walk it to a cell, reading where focus is. */
async function keyboardToCell(page, scope, target) {
  const name = cellName(target);
  for (let tries = 0; tries < 60; tries++) {
    const where = await page.evaluate((s) => {
      const a = document.activeElement;
      if (!a || !a.closest(s) || !/^string \d/.test(a.getAttribute('aria-label') || '')) return null;
      return a.getAttribute('aria-label');
    }, scope);
    if (where === null) {
      await press(page, 'Tab');
      continue;
    }
    const m = /^string (\d+), (?:open|fret (\d+))/.exec(where);
    const cur = { string: Number(m[1]), fret: m[2] ? Number(m[2]) : 0 };
    if (where.startsWith(name)) return true;
    const before = where;
    // Try the arrow that should get closer; the board knows its own orientation.
    const keys = [];
    if (cur.fret < target.fret) keys.push('ArrowRight', 'ArrowDown');
    if (cur.fret > target.fret) keys.push('ArrowLeft', 'ArrowUp');
    if (cur.string < target.string) keys.push('ArrowDown', 'ArrowRight');
    if (cur.string > target.string) keys.push('ArrowUp', 'ArrowLeft');
    let moved = false;
    for (const k of keys) {
      await press(page, k);
      const now = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label'));
      const n = /^string (\d+), (?:open|fret (\d+))/.exec(now || '');
      if (!n) continue;
      const next = { string: Number(n[1]), fret: n[2] ? Number(n[2]) : 0 };
      const dist = (p) => Math.abs(p.string - target.string) + Math.abs(p.fret - target.fret);
      if (dist(next) < dist(cur)) {
        moved = true;
        break;
      }
      if (now !== before) {
        // Went the wrong way: go back.
        const back = { ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' }[k];
        await press(page, back);
      }
    }
    if (!moved) return false;
  }
  return false;
}

/**
 * Give an answer through the screen. `how` is 'touch' or 'keys'. Returns false when the answer
 * shape cannot be given that way (the caller then gives up on the run).
 */
async function giveAnswer(page, L, step, answer, how) {
  const ex = step.exercise;
  const pres = step.presentation;
  const touch = how === 'touch';
  const digit = (pos) => press(page, String(pos + 1));
  switch (answer.type) {
    case 'choice':
    case 'listen-choice':
      for (const i of answer.selected) {
        if (touch) await tap(page, `[data-option="${i}"]`);
        else await digit(pres.options.indexOf(i));
      }
      return true;
    case 'true-false':
      if (touch) await tap(page, `[data-option="${answer.value}"]`);
      else await press(page, answer.value ? 't' : 'f');
      return true;
    case 'match-pairs': {
      const n = ex.pairs.length;
      for (const [l, r] of answer.pairs) {
        if (touch) {
          await tap(page, `[data-left="${l}"]`);
          await tap(page, `[data-right="${r}"]`);
        } else {
          await digit(pres.left.indexOf(l));
          await digit(n + pres.right.indexOf(r));
        }
      }
      return true;
    }
    case 'order':
      for (const t of answer.order) {
        if (touch) await tap(page, `[data-tile="${t}"]`);
        else await digit(pres.tiles.indexOf(t));
      }
      return true;
    case 'fill-blanks': {
      const used = new Set();
      for (const word of answer.blanks) {
        if (touch) {
          const k = await page.evaluate((w) => {
            const el = [...document.querySelectorAll('[data-bank]')].find((b) => b.getAttribute('data-word') === w && b.getAttribute('data-state') !== 'used');
            return el ? el.getAttribute('data-bank') : null;
          }, word);
          if (k === null) return false;
          await tap(page, `[data-bank="${k}"]`);
          continue;
        }
        const k = pres.bank.findIndex((w, i) => w === word && !used.has(i));
        used.add(k);
        await digit(k);
      }
      return true;
    }
    case 'type-answer': {
      const kind = ex.answer.kind;
      if (kind === 'note' && ex.input !== 'keyboard') {
        const m = /^([A-G])(#|b)?/.exec(answer.text);
        if (touch) {
          await tap(page, `[data-key="${m[1]}"]`);
          if (m[2]) await tap(page, `[data-key="${m[2]}"]`);
        } else {
          await press(page, m[1].toLowerCase());
          if (m[2]) await press(page, m[2] === '#' ? '#' : '-');
        }
        return true;
      }
      if (kind === 'number' && ex.input !== 'keyboard') {
        for (const d of String(answer.text)) {
          if (touch) await tap(page, `[data-key="${d}"]`);
          else await press(page, d);
        }
        return true;
      }
      if (touch) await tap(page, '[data-typed] input, input[data-typed]');
      else {
        for (let i = 0; i < 30; i++) {
          const inField = await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'INPUT');
          if (inField) break;
          await press(page, 'Tab');
        }
      }
      await page.keyboard.type(String(answer.text));
      return true;
    }
    case 'fretboard-name':
    case 'staff-read':
    case 'chord-build': {
      if (answer.type === 'chord-build' && answer.frets) {
        const strings = answer.frets.length;
        for (let i = 0; i < strings; i++) {
          const string = strings - i;
          const f = answer.frets[i];
          if (f === 0) continue;
          const target = { string, fret: f === null ? 0 : f };
          if (touch) await tap(page, `[data-answer] button[aria-label^="${cellName(target)}"]`);
          else {
            if (!(await keyboardToCell(page, '[data-answer]', target))) return false;
            await press(page, 'Space');
          }
        }
        return true;
      }
      const text = answer.text;
      if (pres.buttons) {
        if (touch) await tap(page, `[data-value="${text}"]`);
        else await digit(pres.buttons.indexOf(text));
        return true;
      }
      const m = /^([A-G])(#|b)?/.exec(text);
      if (!m) return false;
      if (touch) {
        await tap(page, `[data-key="${m[1]}"]`);
        if (m[2]) await tap(page, `[data-key="${m[2]}"]`);
      } else {
        await press(page, m[1].toLowerCase());
        if (m[2]) await press(page, m[2] === '#' ? '#' : '-');
      }
      return true;
    }
    case 'fretboard-find':
      for (const pos of answer.positions) {
        if (touch) await tap(page, `[data-answer] button[aria-label^="${cellName(pos)}"]`);
        else {
          if (!(await keyboardToCell(page, '[data-answer]', pos))) return false;
          await press(page, 'Space');
        }
      }
      return true;
    case 'staff-place': {
      const steps = answer.position - 4;
      if (touch) {
        await tap(page, 'button[aria-label="Move the note up"]');
        for (let i = 0; i < Math.abs(steps); i++) await tap(page, `button[aria-label="Move the note ${steps > 0 ? 'up' : 'down'}"]`);
        if (answer.accidental) await tap(page, `[data-accidental="${answer.accidental}"]`);
      } else {
        await press(page, 'ArrowUp');
        for (let i = 0; i < Math.abs(steps); i++) await press(page, steps > 0 ? 'ArrowUp' : 'ArrowDown');
        if (answer.accidental) await press(page, answer.accidental === 'sharp' ? '#' : answer.accidental === 'flat' ? 'b' : 'n');
      }
      return true;
    }
    case 'flashcard': {
      const n = ['again', 'hard', 'good', 'easy'].indexOf(answer.rating);
      if (touch) {
        await tap(page, '[data-player-bar] [data-action="primary"]');
        await tap(page, `[data-rating="${answer.rating}"]`);
      } else {
        await press(page, 'Space');
        await press(page, String(n + 1));
      }
      return true;
    }
    default:
      return false;
  }
}

module.exports = { SLOT, savedSession, storedProgress, wrongAnswer, onScreen, stepId, waitForNewStep, giveAnswer, cellName, keyboardToCell, press, tap, sel };

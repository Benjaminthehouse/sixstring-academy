// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ownsKey } from './shared';

function el(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe('which keys a focused control keeps for itself', () => {
  it('lets text fields, buttons and links keep Space and Enter', () => {
    expect(ownsKey(el('<input />'), ' ')).toBe(true);
    expect(ownsKey(el('<button>Save</button>'), ' ')).toBe(true);
    expect(ownsKey(el('<a href="#x">x</a>'), 'Enter')).toBe(true);
    expect(ownsKey(el('<button role="radio" aria-checked="false">G major</button>'), ' ')).toBe(true);
    expect(ownsKey(document.body, ' ')).toBe(false);
  });

  // Bug: after clicking a scale chip in the jam, Space selected the chip again (a no-op) instead
  // of pausing the band, so a learner who had just changed the scale could not pause from the
  // keyboard. Space on the chip that is already chosen is the screen's again.
  it('gives Space back to the screen when it lands on the option already chosen', () => {
    expect(ownsKey(el('<button role="radio" aria-checked="true">Follow the chords</button>'), ' ')).toBe(false);
    expect(ownsKey(el('<button role="radio" aria-checked="true">Follow the chords</button>'), 'Enter')).toBe(true);
  });

  it('keeps the arrows inside radio groups', () => {
    const group = el('<div role="radiogroup"><button role="radio" aria-checked="true">A</button></div>');
    expect(ownsKey(group.firstElementChild, 'ArrowRight')).toBe(true);
  });
});

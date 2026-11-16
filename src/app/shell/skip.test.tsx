// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findMainAction, focusMainAction } from './Shell';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Jump to the main action', () => {
  it("focuses the main (last) button of the screen's ActionBar, skipping disabled ones", () => {
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    document.body.innerHTML = `<main id="main"><button>Elsewhere</button><div data-ui-action-bar=""><button>Back</button><button>Start session</button><button disabled>Not yet</button></div></main>`;
    expect(focusMainAction()).toBe(true);
    expect(document.activeElement?.textContent).toBe('Start session');
  });

  it('falls back to the first primary button (a desktop layout without an ActionBar)', () => {
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    document.body.innerHTML = `<main id="main"><button>Ten minutes</button><button data-ui-primary="" disabled>Not yet</button><button data-ui-primary="">Start session</button></main>`;
    expect(findMainAction()?.textContent).toBe('Start session');
    expect(focusMainAction()).toBe(true);
    expect(document.activeElement?.textContent).toBe('Start session');
  });

  it('says so when the screen has no main action', () => {
    document.body.innerHTML = `<main id="main"><button>Play</button></main>`;
    expect(focusMainAction()).toBe(false);
  });
});

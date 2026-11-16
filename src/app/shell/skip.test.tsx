// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusMainAction } from './Shell';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Jump to actions', () => {
  it("focuses the main (last) button of the screen's ActionBar, skipping disabled ones", () => {
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    document.body.innerHTML = `<main id="main"><button>Elsewhere</button><div data-ui-action-bar=""><button>Back</button><button>Start session</button><button disabled>Not yet</button></div></main>`;
    expect(focusMainAction()).toBe(true);
    expect(document.activeElement?.textContent).toBe('Start session');
  });

  it('says so when the screen has no ActionBar', () => {
    document.body.innerHTML = `<main id="main"><button>Play</button></main>`;
    expect(focusMainAction()).toBe(false);
  });
});

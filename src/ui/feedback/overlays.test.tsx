// @vitest-environment jsdom
/**
 * Dialogs and the things around them: the Back gesture closes the open dialog (and only it), and
 * toasts never cover an open dialog.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBackClose, watchDialogHistory } from './dialogHistory';
import { Modal, Sheet } from './Dialog';
import { openDialogCount, toastSpotOverDialog } from './overlays';
import { toast } from './Toast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

/** Let history steps, the dialog's exit animation and React all finish. */
const settle = async (ms = 40) => {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms / 3));
    });
  }
};
const marker = () => (window.history.state as Record<string, unknown> | null)?.ssaDialog;
const go = async (hash: string) => {
  window.location.hash = hash;
  await settle();
};
const back = async () => {
  window.history.back();
  await settle(260);
};

let setOpenFromOutside: (open: boolean) => void = () => undefined;
const closes = vi.fn();

function Harness({ initial = true, onClose, dismissable = true, kind = 'sheet' }: { initial?: boolean; onClose?: () => void; dismissable?: boolean; kind?: 'sheet' | 'modal' }) {
  const [open, setOpen] = useState(initial);
  setOpenFromOutside = setOpen;
  const close = () => {
    closes();
    onClose?.();
    setOpen(false);
  };
  const Dialog = kind === 'sheet' ? Sheet : Modal;
  return (
    <Dialog open={open} onClose={close} title="Options" dismissable={dismissable}>
      <a href="#elsewhere">Somewhere else</a>
    </Dialog>
  );
}

async function mount(node: JSX.Element) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  await settle();
}

beforeEach(async () => {
  resetBackClose();
  closes.mockClear();
  await go('#start');
});

afterEach(async () => {
  await act(async () => {
    toast.clear();
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
  await settle();
});

const dialogOpen = () => document.querySelector('[role="dialog"]') !== null;

describe('Back with a dialog open', () => {
  it('closes the dialog and stays on the screen', async () => {
    await go('#songs');
    await mount(<Harness />);
    expect(dialogOpen()).toBe(true);
    expect(marker()).toBeTypeOf('number');
    await back();
    expect(closes).toHaveBeenCalledTimes(1);
    expect(dialogOpen()).toBe(false);
    expect(window.location.hash).toBe('#songs');
    // The next Back leaves the screen, as it did before the dialog opened.
    await back();
    expect(window.location.hash).toBe('#start');
  });

  it('takes its history entry away again when it is closed another way', async () => {
    await go('#tuner');
    await mount(<Harness />);
    await act(async () => (document.querySelector('[aria-label="Close"]') as HTMLButtonElement).click());
    await settle(260);
    expect(dialogOpen()).toBe(false);
    expect(marker()).toBeUndefined();
    expect(window.location.hash).toBe('#tuner');
    await back();
    expect(window.location.hash).toBe('#start');
  });

  it('also when the screen closes it by itself', async () => {
    await go('#metronome');
    await mount(<Harness />);
    await act(async () => setOpenFromOutside(false));
    await settle(260);
    expect(marker()).toBeUndefined();
    await back();
    expect(window.location.hash).toBe('#start');
  });

  it('skips the entry a dialog leaves behind when a link inside it leads to another screen', async () => {
    await go('#learn');
    await mount(<Harness />);
    await go('#lesson');
    await act(async () => setOpenFromOutside(false));
    await settle(260);
    await back();
    expect(window.location.hash).toBe('#learn');
    expect(marker()).toBeUndefined();
    await back();
    expect(window.location.hash).toBe('#start');
  });

  it('does not bring back an address the screen replaced while closing a sheet it opened from it', async () => {
    // As #songs--add does: the address opens the sheet, and closing it redirects to #songs.
    await go('#songs--add');
    const redirect = () => {
      window.history.replaceState(null, '', '#songs');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    };
    await mount(<Harness onClose={redirect} />);
    await act(async () => (document.querySelector('[aria-label="Close"]') as HTMLButtonElement).click());
    await settle(300);
    expect(window.location.hash).toBe('#songs');
    await back();
    expect(window.location.hash).toBe('#start');
    expect(dialogOpen()).toBe(false);
  });

  it('ignores an entry left marked by a reload while a dialog was open', async () => {
    await go('#tuner');
    window.history.replaceState({ ssaDialog: 1 }, '');
    resetBackClose();
    await mount(<Harness />);
    await act(async () => (document.querySelector('[aria-label="Close"]') as HTMLButtonElement).click());
    await settle(260);
    expect(window.location.hash).toBe('#tuner');
    await back();
    expect(window.location.hash).toBe('#start');
  });

  it('a screen that replaces its address while the sheet stays open (the camera picking a song) keeps the sheet, and Back still closes it', async () => {
    await go('#camera');
    await mount(<Harness />);
    await act(async () => {
      window.history.replaceState(null, '', '#camera--song--greensleeves');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await settle(300);
    expect(dialogOpen()).toBe(true);
    expect(window.location.hash).toBe('#camera--song--greensleeves');
    await back();
    expect(closes).toHaveBeenCalledTimes(1);
    expect(dialogOpen()).toBe(false);
    expect(window.location.hash).toBe('#camera--song--greensleeves');
    await back();
    expect(window.location.hash).toBe('#start');
  });

  it('after a reload, still skips an entry a dialog of the earlier load left behind under another screen', async () => {
    // A link inside a sheet on #learn led to #lesson; then the page was reloaded on #lesson.
    await go('#learn');
    window.history.pushState({ ssaDialog: 1 }, '');
    await go('#lesson');
    resetBackClose();
    watchDialogHistory(); // what loading the kit does, before any dialog of this load has opened
    await back();
    expect(window.location.hash).toBe('#learn');
    expect(marker()).toBeUndefined();
    await back();
    expect(window.location.hash).toBe('#start');
  });

  it('keeps a dialog that cannot be dismissed right now, and the screen with it', async () => {
    await go('#scan');
    await mount(<Harness dismissable={false} kind="modal" />);
    await back();
    expect(closes).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(true);
    expect(window.location.hash).toBe('#scan');
    expect(marker()).toBeTypeOf('number');
  });

  it('closes only the top dialog of two', async () => {
    await go('#profile');
    const inner = vi.fn();
    function Two() {
      const [outer, setOuter] = useState(true);
      const [top, setTop] = useState(true);
      return (
        <>
          <Sheet open={outer} onClose={() => setOuter(false)} title="Outer">
            outer
          </Sheet>
          <Modal
            open={top}
            onClose={() => {
              inner();
              setTop(false);
            }}
            title="Inner"
          >
            inner
          </Modal>
        </>
      );
    }
    await mount(<Two />);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    await back();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    await back();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
    expect(window.location.hash).toBe('#profile');
  });
});

describe('toastSpotOverDialog: where replies go while a dialog is open', () => {
  const phoneStack = { left: 0, right: 390, height: 74 };
  it('keeps the top edge when the stack fits above a short bottom sheet', () => {
    expect(toastSpotOverDialog(phoneStack, { top: 214, bottom: 844, left: 0, right: 390 }, 290, 12, 8, 390)).toBeNull();
  });
  it('goes under the header of a phone sheet that reaches the top, clear of its title and Close button', () => {
    // The tuner's Tuning sheet on a 390 x 844 phone: the panel starts 32 px down, its header ends at 98.
    expect(toastSpotOverDialog(phoneStack, { top: 32, bottom: 844, left: 0, right: 390 }, 98, 12, 8, 390)).toEqual({ top: 106 });
  });
  it('keeps the top edge beside a centred modal, and moves left of a right-hand drawer', () => {
    const column = { left: 906, right: 1256, height: 74 };
    expect(toastSpotOverDialog(column, { top: 111, bottom: 689, left: 448, right: 832 }, 180, 24, 8, 1280)).toBeNull();
    // The tuner's Tuning drawer on a 1280 px desktop: 26rem at the right edge, from the top.
    expect(toastSpotOverDialog(column, { top: 0, bottom: 800, left: 864, right: 1280 }, 76, 24, 8, 1280)).toEqual({ right: 424 });
  });
  it('goes under the header of a wide dialog that leaves no room beside it', () => {
    const column = { left: 906, right: 1256, height: 74 };
    expect(toastSpotOverDialog(column, { top: 24, bottom: 776, left: 256, right: 1024 }, 110, 24, 8, 1280)).toEqual({ top: 118 });
  });
  it('does nothing without a stack or with nonsense measurements', () => {
    expect(toastSpotOverDialog({ left: 0, right: 390, height: 0 }, { top: 32, bottom: 844, left: 0, right: 390 }, 98, 12, 8, 390)).toBeNull();
    expect(toastSpotOverDialog(phoneStack, { top: Number.NaN, bottom: 844, left: 0, right: 390 }, 98, 12, 8, 390)).toBeNull();
  });
});

describe('toasts and dialogs', () => {
  it('holds news while a dialog is open, shows replies at the top, and shows the news once it closes', async () => {
    await mount(<Harness />);
    expect(openDialogCount()).toBe(1);
    await act(async () => {
      toast({ id: 'reward', title: '+15 XP', news: true });
      toast({ id: 'reply', title: 'Copied' });
    });
    const viewport = document.querySelector('ol[aria-label="Notifications"]')!;
    expect(viewport.hasAttribute('data-over-dialog')).toBe(true);
    expect(document.querySelector('[data-toast="reward"]')).toBeNull();
    expect(document.querySelector('[data-toast="reply"]')).not.toBeNull();
    await act(async () => setOpenFromOutside(false));
    await settle(300);
    expect(openDialogCount()).toBe(0);
    expect(viewport.hasAttribute('data-over-dialog')).toBe(false);
    expect(document.querySelector('[data-toast="reward"]')?.textContent).toContain('+15 XP');
  });
});

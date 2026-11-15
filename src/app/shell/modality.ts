/**
 * Whether the learner is driving the app with the keyboard right now.
 *
 * Browsers decide `:focus-visible` from the last input, and treat "no input yet" as the keyboard:
 * moving focus from script right after the page loads draws a focus ring nobody asked for. Things
 * that open by themselves (the first-run flow) use this to put that first focus somewhere quiet.
 */
let keyboard = false;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (event) => {
      // A shortcut held with a modifier (Ctrl+R, Cmd+L) says nothing about how the page is being used.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      keyboard = true;
    },
    true,
  );
  window.addEventListener('pointerdown', () => (keyboard = false), true);
}

/** True when the most recent input was a key press (false until the first one). */
export function lastInputWasKeyboard(): boolean {
  return keyboard;
}

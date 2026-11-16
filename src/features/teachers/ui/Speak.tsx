/**
 * Read a teacher's words aloud in that teacher's voice (`speak` from `@/core/platform`): on request
 * with the speaker button, and by itself on a teaching card when the learner keeps Settings > "Read
 * explanations aloud" on (`speechWanted()`). Hidden where the device has no voice; the words always
 * stay on screen.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, IconButton } from '@/ui';
import { getSpeechState, speak, speechAvailable, stopSpeaking, subscribeSpeech } from '@/core/platform';
import { speechWanted } from '@/core/settings';
import type { TeacherKey } from '@/content/teachers';

/** Whether speech is available here (false until known). */
export function useSpeechAvailable(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    void speechAvailable().then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}

/** Speak a text with a teacher's voice; `speaking` is true while this caller's text is being read. */
export function useTeacherVoice(teacher: TeacherKey) {
  const state = useSyncExternalStore(subscribeSpeech, getSpeechState, getSpeechState);
  const mine = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (mine.current) stopSpeaking();
    },
    [],
  );
  const speaking = (key: string) => state.speaking && mine.current === key;
  const say = (key: string, text: string) => {
    mine.current = key;
    void speak(text, { voice: teacher });
  };
  const toggle = (key: string, text: string) => {
    if (speaking(key)) {
      stopSpeaking();
      mine.current = null;
      return;
    }
    say(key, text);
  };
  return { speaking, toggle, say };
}

/** Props of {@link SpeakButton}. */
export interface SpeakButtonProps {
  teacher: TeacherKey;
  text: string;
  /** Words on the button; without them it is an icon button labelled "Read aloud". */
  children?: string;
  size?: 'sm' | 'md';
  className?: string;
  /**
   * Read the text by itself once it is shown (a teaching card), but only when the learner wants
   * explanations read aloud (`speechWanted()`). The button works on request either way.
   */
  auto?: boolean;
}

/** "Hear Mia" / a speaker icon: reads the text aloud, and stops it on a second press. */
export function SpeakButton({ teacher, text, children, size = 'sm', className, auto = false }: SpeakButtonProps) {
  const available = useSpeechAvailable();
  const voice = useTeacherVoice(teacher);
  const sayRef = useRef(voice.say);
  sayRef.current = voice.say;
  // Each text is read by itself at most once, and only with the learner's "read aloud" switch on.
  const autoRead = useRef<string | null>(null);
  useEffect(() => {
    if (!auto || !available || autoRead.current === text) return;
    autoRead.current = text;
    if (speechWanted()) sayRef.current(text, text);
  }, [auto, available, text]);
  if (!available) return null;
  const on = voice.speaking(text);
  if (!children) {
    return (
      <IconButton
        icon={on ? 'Square' : 'Volume2'}
        label={on ? 'Stop reading' : 'Read aloud'}
        size={size}
        className={className}
        data-own-enter=""
        data-speak=""
        onClick={() => voice.toggle(text, text)}
      />
    );
  }
  return (
    <Button variant="ghost" size={size} iconLeft={on ? 'Square' : 'Volume2'} className={className} data-own-enter="" data-speak="" onClick={() => voice.toggle(text, text)}>
      {on ? 'Stop' : children}
    </Button>
  );
}

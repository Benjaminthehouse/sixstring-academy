/**
 * Read a teacher's words aloud, on request only, in that teacher's voice (`speak` from
 * `@/core/platform`). Hidden where the device has no voice; the words always stay on screen.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, IconButton } from '@/ui';
import { getSpeechState, speak, speechAvailable, stopSpeaking, subscribeSpeech } from '@/core/platform';
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
  const toggle = (key: string, text: string) => {
    if (speaking(key)) {
      stopSpeaking();
      mine.current = null;
      return;
    }
    mine.current = key;
    void speak(text, { voice: teacher });
  };
  return { speaking, toggle };
}

/** Props of {@link SpeakButton}. */
export interface SpeakButtonProps {
  teacher: TeacherKey;
  text: string;
  /** Words on the button; without them it is an icon button labelled "Read aloud". */
  children?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** "Hear Mia" / a speaker icon: reads the text aloud, and stops it on a second press. */
export function SpeakButton({ teacher, text, children, size = 'sm', className }: SpeakButtonProps) {
  const available = useSpeechAvailable();
  const voice = useTeacherVoice(teacher);
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

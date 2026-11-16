import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tokenize, formatToken, looseSymbols, speakable, plainText, glossaryFor, type Course } from '@/lessons';

it('probe', () => {
  const out: string[] = [];
  const texts = ['{c:Cø7} {c:C°7} {c:Cm7b5} {c:Cdim7} {c:CmMaj7} {c:AmMaj7} {c:Cmaj7} {c:C7} {c:Cm7}', '{r:viiø7} {r:vii°7} {r:Imaj7} {r:bIIImaj7} {r:iiø7} {r:V7} {r:i7} {r:bVII7} {r:imaj7} {r:IVmaj7} {r:bII} {r:i}', '{d:bb7} {d:b7} {d:7} {d:#4} {d:b2} {d:6}', '{i:M7} {i:m7} {i:d7}', '{k:A Dorian} {k:D dorian} {k:G mixolydian}', 'maj7 7 m7b5 dim7 7th m7 chord ø7 °7 Imaj7 ii7 mMaj7'];
  for (const t of texts) {
    const toks = tokenize(t, { glossary: glossaryFor({ id: 'x', title: 'x', teacher: 'none', level: 'beginner', units: [] } as unknown as Course) });
    out.push(t);
    out.push('  show: ' + toks.map((k) => (k.type === 'text' ? k.text : `[${k.type}:${formatToken(k as never, {})}]`)).join(''));
    out.push('  say:  ' + speakable(t));
    out.push('  plain: ' + plainText(t));
    out.push('  loose: ' + looseSymbols(t).map((l) => l.tag).join(' '));
  }
  writeFileSync('/tmp/claude-0/-home-user-context-frontend/0b0936e9-a44d-5458-b711-cf2957d3d9cc/scratchpad/probe.txt', out.join('\n'));
});

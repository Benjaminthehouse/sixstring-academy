import { it } from 'vitest';
import { spellInKey, detectKeyFromNotes, detectBestKey, getKey, midiToNote } from '@/core/theory';
import { spellMidi } from '@/core/guitar';
it('explore', () => {
  const am = getKey('A minor')!;
  console.log('Am pc3', spellInKey(3, am), 'pc 8', spellInKey(8, am), 'pc 10', spellInKey(10, am));
  console.log('C pc 3', spellInKey(3, getKey('C major')!), 'pc 6', spellInKey(6, getKey('C major')!), 'pc 8', spellInKey(8, getKey('C major')!), 'pc 10', spellInKey(10, getKey('C major')!), 'pc 1', spellInKey(1, getKey('C major')!));
  console.log(detectKeyFromNotes([64,63,64,63,64,59,62,60,57]).slice(0,4).map(k=>[k.key.name,k.score.toFixed(2)]));
  console.log(detectKeyFromNotes([57,61,64,69,68,66]).slice(0,4).map(k=>[k.key.name,k.score.toFixed(2)]));
  console.log(detectKeyFromNotes([53,57,60,58,65]).slice(0,4).map(k=>[k.key.name,k.score.toFixed(2)]));
  console.log(detectKeyFromNotes([61]).slice(0,4).map(k=>[k.key.name,k.score.toFixed(2)]));
  console.log(spellMidi(61, { key: 'A major' }), spellMidi(56, {key: 'A major'}), spellMidi(61, {chord: 'A'}), spellMidi(61, {prefer: 'sharps'}));
});

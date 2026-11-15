/**
 * The fretboard trainer: learning every note on the neck. `#fretboard` is the home (the next step
 * of the method, the neck map, the drills); the rest are params:
 *
 *   #fretboard--stage--<id>    a step of the method: what it teaches, a round, the summary
 *   #fretboard--drill--<id>    a free drill (name-the-note, find-the-note, find-every-note,
 *                              play-the-note, sprint, blind-spots) over the learner's settings
 */
import { useEffect } from 'react';
import { redirect } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { drillById } from './core/drills';
import { stageById } from './core/path';
import { Hub } from './ui/Hub';
import { RoundScreen } from './ui/RoundScreen';

/** An address that names nothing (an old link, a typo) goes to the trainer's home instead of a blank. */
function Home() {
  useEffect(() => {
    redirect('fretboard');
  }, []);
  return null;
}

/** The fretboard trainer screen. */
export default function FretboardTrainer({ params }: RouteProps) {
  const [section, id] = params;
  if (!section) return <Hub />;
  if (section === 'stage') {
    const stage = stageById(id);
    return stage ? <RoundScreen key={`stage:${stage.id}`} stage={stage} /> : <Home />;
  }
  if (section === 'drill') {
    const drill = drillById(id);
    return drill ? <RoundScreen key={`drill:${drill.id}`} drill={drill} /> : <Home />;
  }
  return <Home />;
}

/**
 * Rhythm: the timing class. `#rhythm` is the hub; everything else is a param:
 *
 *   #rhythm--beat[--<level>]        Feel the beat
 *   #rhythm--read[--<level>]        Read and tap (notation)
 *   #rhythm--strum[--<pattern>]     Strumming library / one pattern (`my-…` = a built pattern)
 *   #rhythm--strum--builder         Pattern builder
 *   #rhythm--drill[--<id>]          Subdivision and counting drills
 *   #rhythm--clock[--<level>]       Inner clock
 *   #rhythm--calibrate[--mic]       Latency calibration
 */
import { useEffect } from 'react';
import { redirect } from '@/app/router';
import type { RouteProps } from '@/app/routes';
import { READ_LEVELS } from './core/generate';
import { BEAT_LEVELS, CLOCK_LEVELS, DRILLS } from './core/ladder';
import { resolvePattern } from './core/strum';
import { BeatScreen, ClockScreen, DrillScreen, ReadScreen } from './screens/Activities';
import { CalibrateScreen } from './screens/Calibrate';
import { Hub } from './screens/Hub';
import { LevelList } from './screens/Levels';
import { StrumBuilder, StrumLibrary, StrumScreen } from './screens/Strum';

/** An address that names nothing (an old link, a typo) goes to the nearest list instead of a blank. */
function Redirect({ params }: { params: string[] }) {
  useEffect(() => {
    redirect('rhythm', ...params);
  }, [params]);
  return null;
}

export default function Rhythm({ params }: RouteProps) {
  const [section, id] = params;
  switch (section) {
    case 'beat': {
      if (!id) return <LevelList activity="beat" />;
      const level = BEAT_LEVELS.find((l) => String(l.id) === id);
      return level ? <BeatScreen key={id} level={level} /> : <Redirect params={['beat']} />;
    }
    case 'read': {
      if (!id) return <LevelList activity="read" />;
      const level = READ_LEVELS.find((l) => String(l.id) === id);
      return level ? <ReadScreen key={id} level={level} /> : <Redirect params={['read']} />;
    }
    case 'strum': {
      if (!id) return <StrumLibrary />;
      if (id === 'builder') return <StrumBuilder />;
      const pattern = resolvePattern(id);
      return pattern ? <StrumScreen key={id} pattern={pattern} /> : <Redirect params={['strum']} />;
    }
    case 'drill': {
      if (!id) return <LevelList activity="drill" />;
      const drill = DRILLS.find((d) => d.id === id);
      return drill ? <DrillScreen key={id} drill={drill} /> : <Redirect params={['drill']} />;
    }
    case 'clock': {
      if (!id) return <LevelList activity="clock" />;
      const level = CLOCK_LEVELS.find((l) => String(l.id) === id);
      return level ? <ClockScreen key={id} level={level} /> : <Redirect params={['clock']} />;
    }
    case 'calibrate':
      return <CalibrateScreen key={id ?? 'tap'} initial={id === 'mic' ? 'mic' : 'tap'} />;
    case undefined:
      return <Hub />;
    default:
      return <Redirect params={[]} />;
  }
}

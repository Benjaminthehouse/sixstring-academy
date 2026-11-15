import { useState } from 'react';
import { navigate } from '@/app/router';
import { isArtifact } from '@/core/platform';
import { Button, Card, Page, SegmentedControl, Text, confirmDialog, toast } from '@/ui';
import { EMPTY_CALIBRATION, loadCalibration, saveCalibration, type InputSource } from '../core/calibration';
import { CalibrationFlow } from '../ui/CalibrationFlow';
import styles from '../ui/Rhythm.module.css';

const when = (at: number | null): string => {
  if (!at) return '';
  const days = Math.floor((Date.now() - at) / 86_400_000);
  return days <= 0 ? ', measured today' : days === 1 ? ', measured yesterday' : `, measured ${days} days ago`;
};

/** Latency calibration as its own screen: tap with the click, or clap with it for the microphone. */
export function CalibrateScreen({ initial }: { initial: InputSource }) {
  const micBlocked = isArtifact();
  const [source, setSource] = useState<InputSource>(initial === 'mic' && !micBlocked ? 'mic' : 'tap');
  // Bumped after a reset so the stored values are read again.
  const [version, setVersion] = useState(0);
  const cal = loadCalibration();
  const line = (label: string, ms: number | null, at: number | null) => (
    <div className={styles.calibStored} key={label}>
      <Text tone="muted">{label}</Text>
      <Text weight="semibold" tabular>
        {ms === null ? 'not measured' : `${Math.round(ms)} ms${when(at)}`}
      </Text>
    </div>
  );
  const reset = async () => {
    if (!(await confirmDialog({ title: 'Forget the stored calibration?', description: 'Scoring goes back to the uncorrected timing until you measure again.', confirmLabel: 'Forget it', tone: 'danger' }))) return;
    saveCalibration({ ...EMPTY_CALIBRATION, offered: true, micOffered: true });
    setVersion((v) => v + 1);
    toast.ok('Calibration cleared');
  };
  return (
    <Page
      title="Latency calibration"
      subtitle="Taps and claps reach the app late, by an amount that depends on your device. Measure it once and every score allows for it."
      back={{ to: 'rhythm', label: 'Rhythm' }}
      width="prose"
    >
      <div className={styles.calibPage} data-version={version}>
        {!micBlocked && (
          <SegmentedControl
            aria-label="What to calibrate"
            value={source}
            onChange={setSource}
            options={[
              { value: 'tap', label: 'Taps and keys', icon: 'Hand' },
              { value: 'mic', label: 'Microphone', icon: 'Mic' },
            ]}
            fullWidth
          />
        )}
        <Card padding="lg" variant="raised">
          <CalibrationFlow key={`${source}-${version}`} source={source} onDone={() => navigate('rhythm')} doneLabel="Back to rhythm" />
        </Card>
        <div className={styles.calibStoredBox}>
          {line('Taps and keys', cal.tapMs, cal.tapAt)}
          {!micBlocked && line('Microphone', cal.micMs, cal.micAt)}
          {(cal.tapMs !== null || cal.micMs !== null) && (
            <div>
              <Button variant="ghost" size="sm" iconLeft="Trash2" onClick={reset}>
                Forget these values
              </Button>
            </div>
          )}
        </div>
        <Text tone="muted" size="sm">
          Calibrate again when you change something in the chain: Bluetooth headphones, a different phone, an audio interface.
        </Text>
      </div>
    </Page>
  );
}

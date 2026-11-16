/**
 * Proofreading a text sheet (chords over lyrics, typed tab): the text as read beside the song it
 * makes, updated as you type; the picture it came from one tap away; the AI helper can type the
 * sheet out again from the picture when the OCR struggled.
 */
import { useEffect, useMemo, useState } from 'react';
import { Badge, Banner, Button, Icon, Page, SegmentedControl, Spinner, Text, TextArea, TextField, cx, toast, useDebouncedCallback, useMediaQuery } from '@/ui';
import { TabView } from '@/ui/music';
import { href } from '@/app/router';
import { AI_SETTINGS_PARAMS } from '@/core/settings';
import { FORMAT_NAMES, cloneSong } from '@/core/song';
import type { ScanState } from '../engine/useScan';
import { saveErrorMessage } from '../engine/useScan';
import { type AiAvailability, aiAvailability } from '../engine/read';
import { Saved } from './Saved';
import styles from './TextProof.module.css';

/** The text proofreader. */
export function TextProof({ scan }: { scan: ScanState }) {
  const t = scan.text!;
  const twoPane = useMediaQuery('(min-width: 1000px)');
  const [pane, setPane] = useState<'text' | 'song' | 'picture'>('song');
  const [value, setValue] = useState(t.text);
  const [title, setTitle] = useState(t.reading?.result.song.meta.title ?? '');
  const [saving, setSaving] = useState(false);
  const [ai, setAi] = useState<AiAvailability | null>(null);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const pictures = scan.pages.filter((p) => !p.pdfText);
  const fromPicture = t.source === 'ocr' && pictures.length > 0;

  useEffect(() => setValue(t.text), [t.text]);
  useEffect(() => {
    if (!title && t.reading?.result.song.meta.title) setTitle(t.reading.result.song.meta.title);
    // Only when a reading first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.reading]);
  useEffect(() => {
    let live = true;
    if (fromPicture) void aiAvailability().then((a) => live && setAi(a));
    return () => {
      live = false;
    };
  }, [fromPicture]);

  const reparse = useDebouncedCallback((v: string) => void scan.setTextValue(v), 350);
  const song = t.reading?.result.song ?? null;
  const shown = useMemo(() => {
    if (!song) return null;
    const s = cloneSong(song);
    if (title.trim()) s.meta.title = title.trim();
    return s;
  }, [song, title]);

  if (scan.saved) return <Saved scan={scan} />;

  const save = async () => {
    if (!t.reading) return;
    setSaving(true);
    try {
      if (title.trim()) t.reading.result.song.meta.title = title.trim();
      await scan.saveText();
    } catch (e) {
      toast.error('It could not be saved', { description: saveErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const runAi = async () => {
    setAiMsg(null);
    const r = await scan.improveWithAi();
    setAiMsg(r.message);
  };

  const r = t.reading?.result;
  const formatName = t.reading ? FORMAT_NAMES[t.reading.format] ?? t.reading.format : null;
  const bars = song?.bars.length ?? 0;
  const chords = song ? new Set(song.chords.map((c) => c.symbol)).size : 0;

  const textPane = (
    <div className={styles.pane}>
      <div className={styles.paneHead}>
        <h3 className={styles.h3}>{t.source === 'ocr' ? 'The text, as read from your picture' : t.source === 'pdf' ? 'The text from your PDF' : t.source === 'ai' ? 'The text, typed by the AI helper' : 'Your text'}</h3>
        {formatName && <Badge tone="info">{formatName}</Badge>}
      </div>
      <TextArea
        label="Text to check"
        hideLabel
        value={value}
        onChange={(v) => {
          setValue(v);
          reparse(v);
        }}
        mono
        autoGrow
        rows={14}
        className={styles.text}
        data-scan-text=""
      />
      <Text size="sm" tone="muted">
        Fix any misread chord or fret here; the song on the right follows as you type.
      </Text>
    </div>
  );

  const songPane = (
    <div className={styles.pane}>
      <div className={styles.paneHead}>
        <h3 className={styles.h3}>The song it makes</h3>
        {song && (
          <Text size="sm" tone="muted" tabular>
            {bars} {bars === 1 ? 'bar' : 'bars'}
            {chords ? ` · ${chords} chords` : ''}
          </Text>
        )}
      </div>
      {t.error && (
        <Banner tone="warn" title="Not readable as a song yet" live>
          {t.error}
        </Banner>
      )}
      {shown && <TabView song={shown} size="md" chords="diagrams" aria-label={`The song read from the text: ${shown.meta.title}`} />}
      {r?.estimatedRhythm && (
        <p className={styles.hint}>
          <Icon name="Ear" size="sm" /> Text tab and chord sheets do not print rhythm, so it was estimated. Play it in the Player and trust your ear.
        </p>
      )}
      {r && r.warnings.length > 0 && (
        <details className={styles.warn}>
          <summary>{r.warnings.length === 1 ? 'One note from the reader' : `${r.warnings.length} notes from the reader`}</summary>
          <ul>
            {r.warnings.slice(0, 12).map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );

  const picturePane = fromPicture ? (
    <div className={styles.pane}>
      <div className={styles.pictures}>
        {pictures.map((p) => (
          <img key={p.id} src={p.url} alt={`Your picture: ${p.label}`} className={styles.picture} />
        ))}
      </div>
    </div>
  ) : null;

  return (
    <Page title="Check the text" hideHeader width="full" gap={4}>
      <div className={styles.root} data-scan="text">
        <header className={styles.head}>
          <div className={styles.headMain}>
            <p className={styles.eyebrow}>Check the text</p>
            <TextField label="Title" value={title} onChange={setTitle} className={styles.title} data-scan-text-title="" />
          </div>
          <Button variant="primary" size="lg" iconLeft="Check" disabled={!t.reading} loading={saving} onClick={() => void save()} data-scan-save="">
            Save and play
          </Button>
        </header>

        {fromPicture && ai && ai.state !== 'unavailable' && ai.state !== 'no-images' && (
          <div className={styles.ai} data-scan-ai={ai.state}>
            <Icon name="Sparkles" size="sm" />
            {ai.state === 'ready' ? (
              <>
                <Text size="sm" tone="muted" aria-live="polite">
                  {aiMsg ?? 'Picture text reading misses things. The AI helper can type the sheet out from your picture (it is sent to Claude only when you ask).'}
                </Text>
                {scan.aiBusy ? (
                  <span className={styles.busy}>
                    <Spinner size={16} /> Reading…
                  </span>
                ) : (
                  <Button size="sm" iconLeft="Sparkles" onClick={() => void runAi()} data-scan-ai-run="">
                    Type it out with AI
                  </Button>
                )}
              </>
            ) : (
              <Text size="sm" tone="muted">
                {ai.message}{' '}
                <a href={href('profile', ...AI_SETTINGS_PARAMS)} className={styles.link}>
                  Open AI settings
                </a>
              </Text>
            )}
          </div>
        )}

        {!twoPane && (
          <SegmentedControl
            aria-label="Show"
            fullWidth
            options={[{ value: 'song', label: 'Song' }, { value: 'text', label: 'Text' }, ...(fromPicture ? [{ value: 'picture', label: 'Picture' }] : [])]}
            value={pane}
            onChange={(v) => setPane(v as typeof pane)}
          />
        )}
        <div className={cx(styles.body, twoPane && styles.twoPane)}>
          {twoPane ? (
            <>
              <div className={styles.left}>
                {textPane}
                {picturePane && (
                  <details className={styles.pictureToggle}>
                    <summary>Your picture</summary>
                    {picturePane}
                  </details>
                )}
              </div>
              {songPane}
            </>
          ) : pane === 'text' ? (
            textPane
          ) : pane === 'picture' ? (
            picturePane
          ) : (
            songPane
          )}
        </div>
      </div>
    </Page>
  );
}

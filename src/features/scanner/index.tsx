/**
 * Scan & Import (`#scan`): a printed sheet, a photo, a PDF or pasted text becomes a song you can
 * play along with.
 *
 *   #scan          bring the pages in (camera, files, drop, paste, the sample) and look at them
 *   #scan--check   proofread printed music: your picture beside the tab, fix what was misread
 *   #scan--text    proofread a chord sheet or typed tab as text beside the song it makes
 *
 * The pages and the reading live in this screen's memory; going back to `#scan` keeps them, so
 * "Back" never loses work. The heavy readers (sheet reader, pdf.js, OCR) load only when used.
 */
import { useEffect, useRef } from 'react';
import type { RouteProps } from '@/app/routes';
import { navigate, redirect } from '@/app/router';
import { useImmersive, useScreenTitle } from '@/app/shell';
import { useScan } from './engine/useScan';
import { Capture } from './ui/Capture';
import { Reading } from './ui/Reading';
import { Proofread } from './ui/Proofread';
import { TextProof } from './ui/TextProof';

/** The scanner screen. */
export default function ScanScreen({ params }: RouteProps) {
  const scan = useScan();
  const step = params[0] ?? '';
  const { phase, setPhase, draft, text } = scan;
  const proofing = phase === 'music' || phase === 'text';
  useImmersive(proofing || phase === 'reading', 'focus');
  useScreenTitle(proofing ? (phase === 'music' ? draft?.song.meta.title ?? null : 'Check the text') : null);

  // The address follows the step, so the browser's Back goes from checking to the pages.
  const shownStep = useRef(step);
  shownStep.current = step;
  useEffect(() => {
    if (phase === 'music' && shownStep.current !== 'check') navigate('scan', 'check');
    else if (phase === 'text' && shownStep.current !== 'text') navigate('scan', 'text');
  }, [phase]);
  useEffect(() => {
    if (step === '' && proofing) setPhase('pages');
    else if (step === 'check' && phase !== 'music') {
      if (draft) setPhase('music');
      else redirect('scan');
    } else if (step === 'text' && phase !== 'text') {
      if (text) setPhase('text');
      else redirect('scan');
    }
    // Only the address decides here; phase changes are handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Browser checks read the reading from here (development builds only).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __ssaScan?: unknown }).__ssaScan = { phase, draft, text: text ?? null, pages: scan.pages.map((p) => ({ id: p.id, label: p.label, width: p.width, height: p.height, look: p.look, pdfText: p.pdfText ?? null })), saved: scan.saved };
  }, [phase, draft, text, scan.pages, scan.saved]);

  if (phase === 'reading') return <Reading scan={scan} />;
  if (phase === 'music' && draft) return <Proofread scan={scan} />;
  if (phase === 'text' && text) return <TextProof scan={scan} />;
  return <Capture scan={scan} />;
}

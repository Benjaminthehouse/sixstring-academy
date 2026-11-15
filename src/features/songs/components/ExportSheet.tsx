/**
 * Export a song as a file: SixTab, text tab, MusicXML or an exact copy. Formats this host cannot
 * save (MusicXML inside the Claude viewer) are shown but switched off with the reason; the two
 * text formats can also be copied.
 */
import { useEffect, useState } from 'react';
import { Button, Callout, RadioGroup, Sheet, Stack, Text, toast } from '@/ui';
import { canSaveFile, copyText, saveFile } from '@/core/platform';
import { EXPORT_FORMATS, exportFileName, getLibrary, isLibraryError, type ExportFormat, type SongListing } from '@/core/library';

/** Props of `ExportSheet`. */
export interface ExportSheetProps {
  listing: SongListing | null;
  onClose: () => void;
}

/** The export sheet. */
export function ExportSheet({ listing, onClose }: ExportSheetProps) {
  const [format, setFormat] = useState<ExportFormat>('sixtab');
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const [losses, setLosses] = useState<string[]>([]);
  const [busy, setBusy] = useState<'save' | 'copy' | null>(null);

  useEffect(() => {
    if (!listing) return;
    let alive = true;
    void Promise.all(EXPORT_FORMATS.map(async (f) => [f.id, await canSaveFile(exportFileName(listing.title, f.id))] as const)).then((pairs) => {
      if (!alive) return;
      const map = Object.fromEntries(pairs);
      setAllowed(map);
      setFormat((current) => (map[current] ? current : (EXPORT_FORMATS.find((f) => map[f.id])?.id ?? current)));
    });
    return () => {
      alive = false;
    };
  }, [listing]);

  useEffect(() => {
    if (!listing || format !== 'sixtab') {
      setLosses([]);
      return;
    }
    let alive = true;
    getLibrary()
      .exportSong(listing.id, 'sixtab')
      .then((file) => alive && setLosses(file.losses), () => alive && setLosses([]));
    return () => {
      alive = false;
    };
  }, [listing, format]);

  const run = async (how: 'save' | 'copy') => {
    if (!listing) return;
    setBusy(how);
    try {
      const file = await getLibrary().exportSong(listing.id, format);
      if (how === 'copy') {
        if (await copyText(file.data)) toast.ok('Copied', { description: 'Paste it wherever you need it.' });
        else toast.error('Could not copy', { description: 'This browser did not allow it. Save the file instead.' });
        return;
      }
      const result = await saveFile(file.filename, file.data, file.mime);
      if (result.ok) {
        toast.ok(`Saved ${file.filename}`);
        onClose();
      } else if (result.reason !== 'declined') toast.error('The file was not saved', { description: result.message });
    } catch (e) {
      toast.error('The song could not be exported', { description: isLibraryError(e) ? e.message : 'Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const textual = format === 'sixtab' || format === 'ascii-tab';
  const anyAllowed = Object.values(allowed).some(Boolean);
  return (
    <Sheet
      open={!!listing}
      onClose={onClose}
      title="Export"
      description={listing ? `Save “${listing.title}” as a file.` : undefined}
      footer={
        <>
          {textual && (
            <Button iconLeft="Copy" loading={busy === 'copy'} onClick={() => run('copy')}>
              Copy text
            </Button>
          )}
          <Button variant="primary" iconLeft="Download" loading={busy === 'save'} disabled={allowed[format] === false} onClick={() => run('save')}>
            Save file
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <RadioGroup
          label="Format"
          variant="cards"
          value={format}
          onChange={(v) => setFormat(v as ExportFormat)}
          options={EXPORT_FORMATS.map((f) => ({
            value: f.id,
            label: `${f.label} (${f.extension.replace(/^-tab/, '').replace(/^\./, '.')})`,
            description: allowed[f.id] === false ? `${f.description} Files of this type can only be saved from the app’s own address.` : f.description,
            disabled: allowed[f.id] === false,
          }))}
        />
        {format === 'sixtab' && losses.length > 0 && (
          <Callout tone="info" label="Good to know">
            SixTab keeps almost everything, but not quite all of this song: {losses.slice(0, 2).join(' ')} “Exact copy” keeps everything.
          </Callout>
        )}
        {Object.keys(allowed).length > 0 && !anyAllowed && (
          <Text size="sm" tone="muted">
            Files cannot be saved in this view. Use “Copy text” and paste it into a note, or open the app from its own address.
          </Text>
        )}
      </Stack>
    </Sheet>
  );
}

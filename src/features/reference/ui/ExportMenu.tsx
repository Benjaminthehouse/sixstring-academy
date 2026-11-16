/**
 * "Copy as text" and "Download as text" for one section, through the platform services (the
 * download item only appears where the host can save a .txt file).
 */
import { useEffect, useState } from 'react';
import { canSaveFile, copyText, saveFile } from '@/core/platform';
import { IconButton, Menu, toast, type MenuItem } from '@/ui';
import type { SectionId } from '../model/sections';
import { sectionFileName, sectionText } from '../model/text';
import type { Fmt } from './format';

/** The ⋯ menu of a section page. */
export function ExportMenu({ section, fmt }: { section: SectionId; fmt: Fmt }) {
  const [canSave, setCanSave] = useState(false);
  useEffect(() => {
    let alive = true;
    canSaveFile(sectionFileName(section))
      .then((ok) => alive && setCanSave(ok))
      .catch(() => alive && setCanSave(false));
    return () => {
      alive = false;
    };
  }, [section]);

  const items: MenuItem[] = [
    {
      label: 'Copy as text',
      icon: 'Copy',
      onSelect: () => {
        void copyText(sectionText(section, fmt)).then((ok) => {
          if (ok) toast.ok('Copied', { description: 'Paste it into your notes or a message.' });
          else toast.warn('Copying is not allowed here', { description: 'Your browser or the page host blocked the clipboard.' });
        });
      },
    },
  ];
  if (canSave) {
    items.push({
      label: 'Download as text',
      icon: 'Download',
      onSelect: () => {
        void saveFile(sectionFileName(section), sectionText(section, fmt), 'text/plain').then((r) => {
          if (!r.ok && r.reason !== 'declined') toast.warn('The file could not be saved', { description: r.message });
        });
      },
    });
  }
  return <Menu trigger={<IconButton icon="EllipsisVertical" label="Copy or download this section" variant="secondary" />} items={items} aria-label="Copy or download" />;
}

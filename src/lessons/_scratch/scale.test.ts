import { it } from 'vitest';
import { getScale } from '@/core/theory';
it('x', () => { console.log(['dorian','mixolydian','minor-pentatonic'].map((s) => !!getScale(s))); });

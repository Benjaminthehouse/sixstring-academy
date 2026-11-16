/**
 * Display spelling for catalog names that the engines keep in ASCII: tuning names (`Drop C#`) and
 * scale names and aliases (`Dorian b2`, `Minor 7b5 pentatonic`, `Phrygian b4 bb7`).
 */

/** Accidentals in a plain name as signs: `Drop C#` -> `Drop C♯`, `Dorian b2` -> `Dorian ♭2`, `bb7` -> `𝄫7`. */
export function prettyName(text: string): string {
  return (
    text
      // Note names: C#, Eb (a lone letter, so words such as "Bebop" stay as they are).
      .replace(/\b([A-G])#/g, '$1♯')
      .replace(/\b([A-G])b\b/g, '$1♭')
      // Altered degrees: "b2", "#4", "bb7", also straight after a number ("7b5").
      .replace(/(^|[\s(\d])bb(?=\d)/g, '$1𝄫')
      .replace(/(^|[\s(\d])b(?=\d)/g, '$1♭')
      .replace(/(^|[\s(\d])#(?=\d)/g, '$1♯')
  );
}

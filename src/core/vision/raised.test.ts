/**
 * Strings are not in the board plane: markers drawn where the learner reads them (on the string as
 * seen, between the wire crowns as seen). Checked against a pinhole camera built here.
 */
import { describe, expect, it } from 'vitest';
import { FRET_HEIGHT_MM, cameraCentre, makePose, markerPlanePosition, neckModel, projectMarker, projectMarkerSeen, stringHeightAt } from './geometry';
import type { Mat3 } from './types';

/** A pinhole camera at board point (cx, cy, cz) looking straight down (-z), focal f, frame w x h. */
function lookDown(cx: number, cy: number, cz: number, f: number, w: number, h: number, tiltDeg = 0): { H: Mat3; project: (x: number, y: number, z: number) => { x: number; y: number } } {
  const a = (tiltDeg * Math.PI) / 180;
  // Camera axes in board coordinates: x' along the neck tilted, y' across, view direction mostly -z.
  const r = [
    [Math.cos(a), 0, Math.sin(a)],
    [0, -1, 0],
    [Math.sin(a), 0, -Math.cos(a)],
  ];
  const project = (x: number, y: number, z: number): { x: number; y: number } => {
    const d = [x - cx, y - cy, z - cz];
    const X = r[0][0] * d[0] + r[0][1] * d[1] + r[0][2] * d[2];
    const Y = r[1][0] * d[0] + r[1][1] * d[1] + r[1][2] * d[2];
    const Z = r[2][0] * d[0] + r[2][1] * d[1] + r[2][2] * d[2];
    return { x: (f * X) / Z + w / 2, y: (f * Y) / Z + h / 2 };
  };
  // H for z = 0: K [r1 r2 t] with t = -R c.
  const t = [0, 1, 2].map((i) => -(r[i][0] * cx + r[i][1] * cy + r[i][2] * cz));
  const H: Mat3 = [
    f * r[0][0] + (w / 2) * r[2][0], f * r[0][1] + (w / 2) * r[2][1], f * t[0] + (w / 2) * t[2],
    f * r[1][0] + (h / 2) * r[2][0], f * r[1][1] + (h / 2) * r[2][1], f * t[1] + (h / 2) * t[2],
    r[2][0], r[2][1], t[2],
  ];
  return { H, project };
}

describe('markers on raised strings', () => {
  const model = neckModel('steel');
  it('recovers the camera centre from a pose with real perspective', () => {
    const cam = lookDown(200, 20, 300, 520, 640, 360, 45);
    const pose = makePose(cam.H, model, 640, 360);
    const c = cameraCentre(pose);
    expect(c).not.toBeNull();
    const [x, y, z] = c as [number, number, number];
    expect(Math.abs(x - 200)).toBeLessThan(8);
    expect(Math.abs(y - 20)).toBeLessThan(8);
    expect(Math.abs(z - 300)).toBeLessThan(8);
  });

  it('is the plain marker without a camera, and nearly so seen from straight above', () => {
    const cam = lookDown(150, 21, 450, 600, 640, 360, 0);
    const pose = makePose(cam.H, model, 640, 360);
    const plain = projectMarker(pose, 3, 5);
    expect(projectMarkerSeen(pose, 3, 5, null)).toEqual(plain);
    const seen = projectMarkerSeen(pose, 3, 5, [150, 21, 450]);
    // Directly under the camera the parallax is a fraction of a pixel.
    expect(Math.hypot(seen.x - plain.x, seen.y - plain.y)).toBeLessThan(0.5);
  });

  it('lies on the string as seen and between the wire crowns as seen for a steep view', () => {
    const cam = lookDown(-250, 120, 260, 520, 640, 360, 55);
    const pose = makePose(cam.H, model, 640, 360);
    const c = cameraCentre(pose);
    for (const [s, f] of [[1, 3], [6, 9], [4, 14]] as const) {
      const seen = projectMarkerSeen(pose, s, f, c);
      const m = markerPlanePosition(model, s, f);
      const z = stringHeightAt(model, m.x);
      // The same pixel, built straight from the 3-D camera: the string at height z crosses the
      // ray that meets the crown layer at the marker's x.
      const crown = cam.project(m.x, m.y, FRET_HEIGHT_MM);
      const onString = cam.project(m.x, m.y, z);
      // This camera's image x runs along the neck and image y across it: along the neck the dot
      // reads like the crown layer, across it like the string.
      expect(Math.abs(seen.x - crown.x)).toBeLessThan(1.5);
      expect(Math.abs(seen.y - onString.y)).toBeLessThan(1.5);
      // And it is clearly not the footprint on the wood when the view is this steep.
      const plain = projectMarker(pose, s, f);
      expect(Math.hypot(seen.x - plain.x, seen.y - plain.y)).toBeGreaterThan(1);
    }
  });
});

// Viridis: perceptually uniform, low grade is dark purple, high grade is yellow.
const STOPS: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
]

/** Maps a normalised grade in 0..1 to sRGB components in 0..1. */
export function gradeColor(t: number): [number, number, number] {
  const scaled = Math.min(Math.max(t, 0), 1) * (STOPS.length - 1)
  const i = Math.min(Math.floor(scaled), STOPS.length - 2)
  const f = scaled - i
  const a = STOPS[i]
  const b = STOPS[i + 1]
  return [
    (a[0] + (b[0] - a[0]) * f) / 255,
    (a[1] + (b[1] - a[1]) * f) / 255,
    (a[2] + (b[2] - a[2]) * f) / 255,
  ]
}

export const LEGEND_GRADIENT = `linear-gradient(to right, ${STOPS.map(
  ([r, g, b]) => `rgb(${r}, ${g}, ${b})`,
).join(', ')})`

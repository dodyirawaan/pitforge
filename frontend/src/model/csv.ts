import { createBlockModel } from './BlockModel.ts'
import type { BlockColumns, BlockModel, Vec3 } from './BlockModel.ts'

const ALIASES = {
  x: ['x', 'xc', 'xcentre', 'xcenter', 'east', 'easting'],
  y: ['y', 'yc', 'ycentre', 'ycenter', 'north', 'northing'],
  z: ['z', 'zc', 'zcentre', 'zcenter', 'elev', 'elevation', 'rl'],
  dx: ['dx', 'xinc', 'xsize', 'xlength'],
  dy: ['dy', 'yinc', 'ysize', 'ylength'],
  dz: ['dz', 'zinc', 'zsize', 'zlength'],
  grade: ['grade'],
}

export interface CsvResult {
  model: BlockModel
  /** Rows dropped because a coordinate or the grade was not a number. */
  skipped: number
}

function detectDelimiter(header: string): string {
  let best = ','
  let bestCount = 0
  for (const delimiter of [',', ';', '\t']) {
    const count = header.split(delimiter).length - 1
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

/**
 * Parses a block model CSV with one block per row. Requires centroid columns
 * (x, y, z or a common alias). The grade is the `grade` column, or else the
 * first column that is not a coordinate or block size. Block size comes from
 * dx/dy/dz columns when present, otherwise from the centroid spacing.
 */
export function parseBlockModelCsv(text: string): CsvResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) throw new Error('The file has no data rows.')

  const delimiter = detectDelimiter(lines[0])
  const header = lines[0].split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''))
  const names = header.map((name) => name.toLowerCase())
  const find = (aliases: string[]) => names.findIndex((name) => aliases.includes(name))

  const xCol = find(ALIASES.x)
  const yCol = find(ALIASES.y)
  const zCol = find(ALIASES.z)
  if (xCol < 0 || yCol < 0 || zCol < 0) {
    throw new Error('Could not find x, y and z columns in the header row.')
  }
  const sizeCols = [find(ALIASES.dx), find(ALIASES.dy), find(ALIASES.dz)]

  const reserved = new Set([xCol, yCol, zCol, ...sizeCols])
  let gradeCol = find(ALIASES.grade)
  if (gradeCol < 0) gradeCol = names.findIndex((_, i) => !reserved.has(i))
  if (gradeCol < 0) throw new Error('Could not find a grade column.')

  // Semicolon-delimited exports usually use a decimal comma.
  const toNumber =
    delimiter === ';' ? (cell: string) => Number(cell.replace(',', '.')) : (cell: string) => Number(cell)

  const columns: BlockColumns = { x: [], y: [], z: [], grade: [] }
  let size: Vec3 | undefined
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter)
    const x = toNumber(cells[xCol] ?? '')
    const y = toNumber(cells[yCol] ?? '')
    const z = toNumber(cells[zCol] ?? '')
    const grade = toNumber(cells[gradeCol] ?? '')
    if (![x, y, z, grade].every(Number.isFinite) || (cells[gradeCol] ?? '').trim() === '') {
      skipped++
      continue
    }
    if (!size && sizeCols.every((col) => col >= 0)) {
      const dims = sizeCols.map((col) => toNumber(cells[col] ?? ''))
      if (dims.every((d) => Number.isFinite(d) && d > 0)) size = dims as Vec3
    }
    columns.x.push(x)
    columns.y.push(y)
    columns.z.push(z)
    columns.grade.push(grade)
  }

  if (columns.x.length === 0) throw new Error('No valid block rows found in the file.')
  return { model: createBlockModel(columns, header[gradeCol], size), skipped }
}

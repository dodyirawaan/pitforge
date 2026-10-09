# PitForge

3D simulation and planning toolkit for open-pit mines.

PitForge aims to let mine planners build, visualise and compare pit designs and
extraction sequences in an interactive 3D environment.

## Planned scope

- **Block model** — import and visualise block models (grade, density, rock type)
- **Pit design** — benches, berms, ramps and overall slope angles
- **Pit optimisation** — ultimate pit limit and pushback generation
- **Scheduling** — period-by-period extraction sequence with 3D playback
- **Reporting** — tonnage, grade and strip ratio per bench, pushback and period

## Status

Early development. The frontend can load a block model and display it in 3D,
coloured by grade, with a cutoff-grade filter.

## Running the frontend

Requires Node.js 22 or newer.

```bash
cd frontend
npm install
npm run dev
```

Then open the URL that Vite prints. To reach it from another machine, run
`npm run dev -- --host`.

### Block model CSV format

One block per row, with a header row. Comma, semicolon and tab delimiters are
supported.

| Column | Accepted names | Required |
| --- | --- | --- |
| Centroid easting | `x`, `xc`, `east`, `easting` | yes |
| Centroid northing | `y`, `yc`, `north`, `northing` | yes |
| Centroid elevation | `z`, `zc`, `elev`, `elevation`, `rl` | yes |
| Grade | `grade`, or the first other column | yes |
| Block size | `dx`, `dy`, `dz` | no, inferred from centroid spacing |

All blocks are assumed to be the same size; sub-blocked models are not
supported yet.

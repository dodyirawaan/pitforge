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

Early development. The frontend can:

- load a block model and display it in 3D, coloured by grade, with a
  cutoff-grade filter
- design a benched pit from an elliptical floor (position, floor elevation and
  size, bench height, berm width, face angle), show the excavated model with
  bench toe and crest lines, and report tonnage, strip ratio and ore grade
  inside the pit
- add a spiral haul ramp to the pit (width, gradient, start bearing and
  direction); the wall is pushed out to make room for the road, and the extra
  stripping is included in the reported tonnage

- optimise the ultimate pit from a price, recovery, processing cost, mining
  cost and overall slope angle, and compare its value with the manual design
- split the optimised pit into pushbacks, built from nested shells optimised
  at lower prices

- schedule the pit into periods at a set mining rate, with a table of
  tonnage, grade, cash flow and NPV per period and a 3D playback of the pit
  being mined

The ramp is a single continuous spiral without switchbacks, and tonnage uses a
single density for all blocks. The schedule mines each pushback in turn, bench
by bench from the top down; within that order it is not optimised for value,
and it has no processing limit. Pushbacks have no minimum mining width. The optimiser runs in the browser, which limits
it to small and medium block models; it gives an undiscounted ultimate pit with
one slope angle.

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

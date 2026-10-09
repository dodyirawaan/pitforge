# PitForge

3D simulation and planning toolkit for open-pit mines.

PitForge lets a mine planner load a block model, design a pit, optimise the
ultimate pit and its pushbacks, and schedule the extraction, all in an
interactive 3D view in the browser.

**Status:** early development, paused after the first pass over every planned
area. Everything below runs in the browser; there is no backend yet.

## What works today

### Block model

- Load a block model from CSV (see [the format](#block-model-csv-format)) or use
  the built-in sample deposit of about 76,000 blocks.
- 3D view with orbit, pan and zoom. Elevation is up, as in mine coordinates.
- Blocks coloured by grade, with a cutoff-grade slider that hides lower grades.
- Summary of block count, block size and grade range.

### Pit design

- A benched pit grown upwards from an elliptical floor. Inputs: floor centre,
  floor elevation, floor length, width and azimuth, bench height, berm width
  and face angle.
- The excavated block model is shown with bench toe and crest lines, cut off at
  the ground surface.
- Inter-ramp and overall wall angles are reported.
- Blocks can be shown as remaining after mining, inside the pit, or all.

### Haul ramp

- A spiral ramp from the pit floor to the surface. Inputs: width, gradient,
  start bearing and direction of climb.
- The wall above the ramp is pushed out to make room for the road, and the
  extra stripping is included in every tonnage figure.

### Pit optimisation

- Ultimate pit from a price, recovery, processing cost, mining cost and overall
  slope angle. Solved exactly as a maximum closure problem with a push-relabel
  minimum cut, in a web worker.
- Reports shell value, tonnage, ore, waste and strip ratio, the break-even
  cutoff grade, and the value of the manual design under the same economics.

### Pushbacks

- Each optimisation also solves ten nested shells at 30% to 100% of the price.
- The shells are grouped into one to eight pushbacks of similar tonnage. The
  number can be changed without running the optimisation again.
- Tonnage and value are reported per pushback.

### Scheduling

- The pit in use (manual design or optimised shell) is split into periods at a
  set mining rate. The schedule updates whenever the pit or an input changes.
- With the optimised shell, each pushback is mined out in turn, bench by bench
  from the top down.
- A table shows rock, ore, waste, strip ratio, ore grade, cash flow, discounted
  cash flow and cumulative NPV per period.
- 3D playback of the pit being mined, by Play button, period slider or clicking
  a table row.
- Blocks can be coloured by grade, pushback or period mined.

### Reference result

On the sample deposit with the default inputs, the ultimate pit is 60.74 Mt
with a strip ratio of 1.04 and an undiscounted value of $1,050.9 M. Scheduled
over 12 periods at a 10% discount rate, NPV is $434.7 M mined top-down as a
single phase and $670.5 M with four pushbacks.

## Known limitations

- **Block model:** all blocks must be the same size (no sub-blocks). Only one
  grade column is read, and a single density applies to every block.
- **Pit design:** the floor can only be an ellipse, and there is one pit.
- **Ramp:** one continuous spiral, no switchbacks. The measured gradient along
  the road centre runs slightly under the requested value (9.84% for 10%).
  The floor outline widens by up to one ramp width so the road stays
  continuous.
- **Optimisation:** one slope angle for all directions and depths, and no
  discounting. For some angles the wall can come out slightly steeper than
  requested in some directions, because the precedence pattern is capped to
  keep the solve fast. Running in the browser limits it to small and medium
  models: the sample deposit takes about 5 seconds in Node and about 11 seconds
  in a headless browser, and models that are too large are rejected.
- **Pushbacks:** no minimum mining width, and they exist only for the optimised
  shell, not the manual design.
- **Scheduling:** the only constraint is the total mining rate. There is no
  processing capacity, stockpile or grade target, and the order within a
  pushback is not optimised for value.
- **Project:** nothing is saved between sessions, results cannot be exported,
  and there is no automated test suite yet.

## Next steps

Roughly in order of value:

1. Automated tests for the geometry, optimiser and scheduler, which so far have
   only been checked with one-off scripts.
2. Save and load a project, and export the schedule and reserves to CSV.
3. Read density and more than one grade or rock type from the block model.
4. A processing capacity and stockpiles in the scheduler.
5. Slope angles by direction or rock type in the optimiser.
6. A Python backend for the optimiser, so that models with millions of blocks
   can be handled.
7. Pit floors drawn as free polygons, and ramps with switchbacks.
8. A minimum mining width for pushbacks.

## Running the frontend

Requires Node.js 22 or newer.

```bash
cd frontend
npm install
npm run dev
```

Then open the URL that Vite prints. To reach it from another machine, run
`npm run dev -- --host`. That serves the app to the whole network without a
login, so prefer an SSH tunnel when working with real mine data.

`npm run build` type-checks the code and writes a production build to
`frontend/dist`.

### Block model CSV format

One block per row, with a header row. Comma, semicolon and tab delimiters are
supported; semicolon files are read with a decimal comma.

| Column | Accepted names | Required |
| --- | --- | --- |
| Centroid easting | `x`, `xc`, `east`, `easting` | yes |
| Centroid northing | `y`, `yc`, `north`, `northing` | yes |
| Centroid elevation | `z`, `zc`, `elev`, `elevation`, `rl` | yes |
| Grade | `grade`, or the first other column | yes |
| Block size | `dx`, `dy`, `dz` | no, inferred from centroid spacing |

Rows with a missing or non-numeric coordinate or grade are skipped and counted.

### Price per grade unit

The optimiser values a tonne of ore as grade × price × recovery, less the
processing cost. For grades in g/t the price is per gram of metal. For grades
in percent it is the price of 1% of a tonne, which is 10 kg of metal.

## Code layout

Everything is under `frontend/`, a Vite + TypeScript + Three.js app.

| Path | Contents |
| --- | --- |
| `src/main.ts` | Wires the controls to the model, pit, optimiser and schedule |
| `src/model/` | Block model type, CSV parser, sample deposit, ground surface |
| `src/design/` | Pit and ramp geometry, tonnage inside a pit |
| `src/optimise/` | Block values, slope precedence, minimum cut, nested shells, pushbacks, web worker |
| `src/schedule/` | Period schedule and cash flows |
| `src/viewer/` | Three.js scene, instanced block mesh, colour ramp, pit lines |
| `src/ui/` | Slider and table helpers |

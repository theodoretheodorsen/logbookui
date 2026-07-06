import express from 'express';
import { db, getDb, withTransaction } from './db.js';
import { createPagesApi } from '../lib/pages.js';
import { listAircraft } from '../lib/aircraft.js';
import { createFlightsApi } from '../lib/flights.js';
import { createSimulatorApi } from '../lib/simulator.js';
import { createRemarksApi } from '../lib/remarks.js';
import { deleteEntryAt } from '../lib/entries.js';
import { isConstraintError } from '../lib/errors.js';

const { getPage, getLastPageNumber } = createPagesApi({ getDb });
const { addFlight, updateFlight, getFlight } = createFlightsApi({ getDb, withTransaction });
const { addSimulatorSession, updateSimulatorSession, getSimulatorSession } = createSimulatorApi({
  getDb,
  withTransaction,
});
const { addRemark, updateRemark, getRemark } = createRemarksApi({ getDb, withTransaction });

const app = express();
app.use(express.json());

function asyncHandler(fn) {
  return (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      next(err);
    }
  };
}

app.get(
  '/pages/:page',
  asyncHandler((req, res) => {
    const page = Number(req.params.page);
    res.json(getPage(page));
  })
);

app.get(
  '/pages',
  asyncHandler((req, res) => {
    res.json({ lastPage: getLastPageNumber() });
  })
);

app.get(
  '/aircraft',
  asyncHandler((req, res) => {
    res.json(listAircraft(db));
  })
);

app.get(
  '/flights/:position',
  asyncHandler((req, res) => {
    res.json(getFlight(Number(req.params.position)));
  })
);

app.post(
  '/flights',
  asyncHandler((req, res) => {
    const position = addFlight(req.body);
    res.status(201).json({ position });
  })
);

app.put(
  '/flights/:position',
  asyncHandler((req, res) => {
    updateFlight(Number(req.params.position), req.body);
    res.status(204).end();
  })
);

app.get(
  '/simulator-sessions/:position',
  asyncHandler((req, res) => {
    res.json(getSimulatorSession(Number(req.params.position)));
  })
);

app.post(
  '/simulator-sessions',
  asyncHandler((req, res) => {
    const position = addSimulatorSession(req.body);
    res.status(201).json({ position });
  })
);

app.put(
  '/simulator-sessions/:position',
  asyncHandler((req, res) => {
    updateSimulatorSession(Number(req.params.position), req.body);
    res.status(204).end();
  })
);

app.get(
  '/remarks/:position',
  asyncHandler((req, res) => {
    res.json(getRemark(Number(req.params.position)));
  })
);

app.post(
  '/remarks',
  asyncHandler((req, res) => {
    const position = addRemark(req.body);
    res.status(201).json({ position });
  })
);

app.put(
  '/remarks/:position',
  asyncHandler((req, res) => {
    updateRemark(Number(req.params.position), req.body);
    res.status(204).end();
  })
);

// Generic delete: works for a flight, simulator session, or remark alike -
// removes whichever entry is at `position` and renumbers everything after it.
app.delete(
  '/entries/:position',
  asyncHandler((req, res) => {
    withTransaction((db) => deleteEntryAt(db, Number(req.params.position)));
    res.status(204).end();
  })
);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.statusCode) {
    res.status(err.statusCode).json({ error: err.message });
  } else if (isConstraintError(err)) {
    res.status(400).json({ error: err.message });
  } else {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Logbook API listening on http://localhost:${PORT}`);
});

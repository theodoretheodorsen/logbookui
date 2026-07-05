const express = require('express');
const { db, withTransaction } = require('./db');
const { getPage, getLastPageNumber } = require('./lib/pages');
const { listAircraft } = require('./lib/aircraft');
const { addFlight, updateFlight, getFlight } = require('./lib/flights');
const { addSimulatorSession } = require('./lib/simulator');
const { addRemark } = require('./lib/remarks');
const { deleteEntryAt } = require('./lib/entries');
const { isConstraintError } = require('./lib/errors');

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

app.post(
  '/simulator-sessions',
  asyncHandler((req, res) => {
    const position = addSimulatorSession(req.body);
    res.status(201).json({ position });
  })
);

app.post(
  '/remarks',
  asyncHandler((req, res) => {
    const position = addRemark(req.body);
    res.status(201).json({ position });
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

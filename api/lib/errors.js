class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

// SQLite CHECK/FOREIGN KEY/UNIQUE constraint failures throw plain Errors
// whose message starts with these prefixes - treat them as 400 Bad Request.
function isConstraintError(err) {
  return /CHECK constraint failed|FOREIGN KEY constraint failed|UNIQUE constraint failed|NOT NULL constraint failed/.test(err.message);
}

module.exports = { NotFoundError, ValidationError, isConstraintError };

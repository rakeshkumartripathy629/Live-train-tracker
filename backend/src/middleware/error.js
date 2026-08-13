// Central error handler — keeps a stable { success: false, error } envelope.
function notFound(req, res) {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    success: false,
    error: status >= 500 ? 'Internal server error' : err.message,
    code: err.code,
  });
}

module.exports = { notFound, errorHandler };

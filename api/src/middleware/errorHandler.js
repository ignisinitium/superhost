/**
 * Global Express error handler.
 * Must be registered as the LAST middleware with app.use().
 * Catches all errors thrown or passed via next(err) in route handlers.
 */
export function globalErrorHandler(err, req, res, _next) {
    // Log the full error internally, but never expose stack traces to clients
    console.error(`[ERROR] ${req.method} ${req.path}`, err);
    if (res.headersSent) {
        return;
    }
    const statusCode = err?.statusCode ?? err?.status ?? 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'An internal server error occurred'
        : (err instanceof Error ? err.message : String(err));
    res.status(statusCode).json({ success: false, message });
}
/**
 * Wraps an async route handler so that any rejected promise is forwarded to
 * the global error handler instead of crashing Express.
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
//# sourceMappingURL=errorHandler.js.map
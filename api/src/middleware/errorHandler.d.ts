import type { Request, Response, NextFunction } from 'express';
/**
 * Global Express error handler.
 * Must be registered as the LAST middleware with app.use().
 * Catches all errors thrown or passed via next(err) in route handlers.
 */
export declare function globalErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void;
/**
 * Wraps an async route handler so that any rejected promise is forwarded to
 * the global error handler instead of crashing Express.
 */
export declare function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=errorHandler.d.ts.map
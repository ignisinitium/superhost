import type { Request, Response, NextFunction } from 'express';
export declare const checkIpBlock: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const logLoginAttempt: (ip: string, username: string, success: boolean) => Promise<void>;
//# sourceMappingURL=rateLimiter.d.ts.map
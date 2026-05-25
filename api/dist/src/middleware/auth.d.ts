import express from 'express';
export interface AuthRequest extends express.Request {
    adminId?: number;
    userId?: number;
}
export declare const authenticateAdmin: (req: AuthRequest, res: express.Response, next: express.NextFunction) => express.Response<any, Record<string, any>> | undefined;
export declare const authenticateClient: (req: AuthRequest, res: express.Response, next: express.NextFunction) => express.Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.d.ts.map
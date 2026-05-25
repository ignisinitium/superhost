import { Pool } from 'pg';
declare const pool: Pool;
export declare const query: (text: string, params?: unknown[]) => Promise<import("pg").QueryResult<any>>;
export default pool;
//# sourceMappingURL=db.d.ts.map
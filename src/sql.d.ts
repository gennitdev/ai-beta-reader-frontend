declare module 'sql.js' {
  export type SqlValue = string | number | null | Uint8Array

  export interface Database {
    run(sql: string, params?: SqlValue[]): void;
    exec(sql: string, params?: SqlValue[]): Array<{ columns: string[]; values: SqlValue[][] }>;
    export(): Uint8Array;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  export interface Config {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: Config): Promise<SqlJsStatic>;
}

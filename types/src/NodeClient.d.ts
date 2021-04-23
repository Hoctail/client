import Client from "@hoctail/query";
import {RollupOptions} from "rollup";

export class NodeClient extends Client {
    constructor(options: UserOptions, args?: string[]);

    argv: string[];

    get url(): string;

    close(): Promise<void>;

    getAppState(name?: string): Promise<Object>;

    initApp(): Promise<void>;

    install(src?: string, options?: RollupOptions, name?: string, pkg?: Object): Promise<{name: string, path: string}>;

    serve(src?: string, options?: RollupOptions): Promise<{name: string, path: string}>;

    tailLogs(latestLogsNumber?: number, logLevel?: string|number): Promise<string[]>;

    tailHttpLogs(type: ('client'|'server'), latestLogsNumber?: number, ...cols: string[]): Promise<Object[]>;
}

export function initOptions(options: UserOptions): Client.ClientOptions;

export function parseApp(appName: string): {owner: string|undefined, name: string};

export type UserOptions = {
    endpoint?: string;
    baseURL?: string;
    schema?: string;
    token?: string;
    app?: string;
    key?: string;
    logLevel?: number;
};

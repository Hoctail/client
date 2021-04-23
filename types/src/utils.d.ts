import { Tx } from "@hoctail/query";
import {NodeClient} from "./NodeClient";
import {InputOptions, OutputOptions, RollupOptions} from "rollup";

export function findPkgDir(main: string): string|null;

export function pack(main: string, client: NodeClient|Tx, options: RollupOptions): PackOutput;

export type PackOutput = {
    input: InputOptions;
    output: OutputOptions;
};

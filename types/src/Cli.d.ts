import {Command} from "commander";
import {NodeClient} from "./NodeClient";

export class Cli {
    constructor();

    program: Command;

    setup(): void;

    run(): void;

    createClient(cmdObj: Command): NodeClient;

    _setupInstall(): void;

    _setupServe(): void;

    _setupRepl(): void;
}

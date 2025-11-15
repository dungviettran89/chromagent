import {Command} from 'commander';

/**
 * Base for cli application, it handle general life cycle of this cli application
 */
export class CliApplication {
    readonly command: Command;

    constructor() {
        this.command = new Command()
            .name("chromagent")
            .description("Simple tool to connect and run various agents")
    }

    run(args?: string[]) {
        this.command.parse(args);
    }
}


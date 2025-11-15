import {CliApplication,} from "./CliApplication";
import * as process from "node:process";
import * as dotenvx from '@dotenvx/dotenvx';
import {ModelCommand} from "./model/ModelCommand";
import {ListModelCommand} from "./model/ListModelCommand";

dotenvx.config();
export const cliApplication = new CliApplication();
export const modelCommand = new ModelCommand(cliApplication);
export const listModelCommand = new ListModelCommand(modelCommand);
cliApplication.run(process.argv);
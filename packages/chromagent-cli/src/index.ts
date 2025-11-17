import {cliApplication} from "./CliApplication";
import * as dotenvx from '@dotenvx/dotenvx';

dotenvx.config({quiet: true});

export * from './CliApplication';
export * from './AnthropicModels';
export * from './model/ModelCommand';
export * from './model/ModelListCommand';
export * from './model/ModelChatCommand';

cliApplication.run(process.argv)
import { Config } from '@ton-ai-core/blueprint';
import { MistiPlugin } from '@ton-ai-core/blueprint-misti';

export const config: Config = {
  plugins: [
    new MistiPlugin(),
  ],
}; 
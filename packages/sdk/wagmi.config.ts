import { defineConfig } from '@wagmi/cli'
import { actions } from '@wagmi/cli/plugins'

let Foil = require("@/protocol/deployments/13370/Foil.json");
Foil.name = "Foil";
Foil.address = undefined;

export default defineConfig({
  out: 'src/generated.ts',
  contracts: [
    Foil
  ],
  plugins: [actions()],
})

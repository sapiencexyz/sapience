import { runChainProcess } from './processes/chain';
import { runMarketProcess } from './processes/market';

Promise.all([
  runChainProcess(),
  runMarketProcess()
]).catch(error => {
  console.error('Error running processes in parallel:', error);
});

import { BUNGEE_NATIVE_TOKEN } from '~/lib/bungee/sources';

/**
 * Stargate's bridge UI deep-link with srcChain=ethereal preselected and the
 * native USDe sentinel as the source token. This is the recommended path
 * out of Ethereal — Bungee doesn't yet bridge from Ethereal in this direction.
 */
export const STARGATE_FROM_ETHEREAL_URL = `https://stargate.finance/?srcChain=ethereal&srcToken=${BUNGEE_NATIVE_TOKEN}`;

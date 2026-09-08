// Side-effect module: registers the app's network-defaults fallback with the
// SDK GraphQL client so every consumer — client hooks and server/OG fetches —
// resolves the endpoint the same way (Settings override, then the active
// network's endpoint). Imported by providers.tsx (client bundle) and
// lib/data/graphql.ts (server paths); registering twice is harmless.
import { setGraphQLEndpointResolver } from '~/lib/sdk/queries/client/graphqlClient';

import { getNetworkEndpointDefaults } from '~/lib/config/networkDefaults';

setGraphQLEndpointResolver(() => getNetworkEndpointDefaults().graphqlEndpoint);

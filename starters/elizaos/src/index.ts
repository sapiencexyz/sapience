import {
  logger,
  type IAgentRuntime,
  type Project,
  type ProjectAgent,
} from "@elizaos/core";
import customActionsPlugin from "./plugin";
import { character } from "./character";
import { ForecastService } from "./services/forecastService";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const initCharacter = async ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info("Initializing ElizaOS starter agent");
  logger.info({ name: character.name }, "Character:");
  logger.info({ plugins: character.plugins }, "Plugins:");

  // Initialize ForecastService - it will wait for Sapience plugin and auto-start if enabled
  new ForecastService(runtime);
  logger.info("🤖 ForecastService initialization started");
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [customActionsPlugin],
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from "./character";

export default project;

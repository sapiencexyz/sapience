import path from 'path';
import { pathToFileURL } from 'url';

type SdkModule = Record<string, any>;

export async function loadSdk(): Promise<SdkModule> {
  const override = process.env.SAPIENCE_SDK_PATH;
  if (override && override.trim().length > 0) {
    try {
      const resolved = path.isAbsolute(override)
        ? override
        : path.resolve(process.cwd(), override);
      const url = pathToFileURL(resolved).href;
      return await import(url);
    } catch (e) {
      // Surface override import failures to aid debugging, then fall back to published SDK
      // eslint-disable-next-line no-console
      console.warn(`[sdk] Failed to import SAPIENCE_SDK_PATH: ${override}\n`, e);
    }
  }
  return await import('@sapience/sdk');
}



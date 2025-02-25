import { ResourcePerformance } from "./resourcePerformance";
import { Resource } from "src/models/Resource";

export class ResourcePerformanceManager {
  private static _instance: ResourcePerformanceManager;
  private static _initialized: boolean = false;
  private static _initializing: boolean = false;

  private resources: Resource[] = [];
  private resourcePerformances: {
    [resourceSlug: string]: ResourcePerformance;
  } = {};

  private constructor() {
  }

  public static getInstance() {
    if (!ResourcePerformanceManager._instance) {
      ResourcePerformanceManager._instance = new ResourcePerformanceManager();
    }
    return ResourcePerformanceManager._instance;
  }

  public async initialize(resources: Resource[]) {
    if (ResourcePerformanceManager._initialized) {
      return;
    }
    if (ResourcePerformanceManager._initializing) {
      return;
    }
    console.time('ResourcePerformanceManager.initialize');
    ResourcePerformanceManager._initializing = true;
    this.resources = resources;
    for (const resource of this.resources) {
      this.resourcePerformances[resource.slug] = new ResourcePerformance(resource);
      console.log(`Backfilling resource ${resource.name}`);
      await this.resourcePerformances[resource.slug].backfillResourcePrices();
      console.log(`Resource ${resource.slug} done`);
    }
    ResourcePerformanceManager._initialized = true;
    ResourcePerformanceManager._initializing = false;
    console.timeEnd('ResourcePerformanceManager.initialize');
  }

  public getResourcePerformance(resourceSlug: string) {
    if (!this.resourcePerformances[resourceSlug] && !ResourcePerformanceManager._initialized) {
      throw new Error(`Resource performance not initialized for ${resourceSlug}`);
    }
    return this.resourcePerformances[resourceSlug];
  }

  public getResourcePerformances() {
    if (!ResourcePerformanceManager._initialized) {
      throw new Error('Resource performance not initialized');
    }
    return this.resourcePerformances;
  }
}

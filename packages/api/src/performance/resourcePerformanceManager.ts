import { ResourcePerformance } from './resourcePerformance';
import { Resource } from 'src/models/Resource';
import { clearStorageFiles } from './persistenceHelper';

export class ResourcePerformanceManager {
  private static _instance: ResourcePerformanceManager;
  private static _initialized: boolean = false;
  private static _initializing: boolean = false;

  private actionIdx: number = 0;

  private resources: Resource[] = [];
  private resourcePerformances: {
    [resourceSlug: string]: ResourcePerformance;
  } = {};

  private constructor() {}

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
    console.time(
      `ResourcePerformanceManager.initialize - op# ${this.actionIdx}`
    );
    ResourcePerformanceManager._initializing = true;
    await this.initializeResources(resources, false);
    ResourcePerformanceManager._initialized = true;
    ResourcePerformanceManager._initializing = false;
    console.timeEnd(
      `ResourcePerformanceManager.initialize - op# ${this.actionIdx}`
    );
    this.actionIdx++;
  }

  public async hardRefreshResource(resourceSlug: string) {
    console.log(
      `ResourcePerformanceManager Hard Refresh Resource ${resourceSlug} - op# ${this.actionIdx}`
    );
    const resource = this.resources.find((r) => r.slug === resourceSlug);
    if (!resource) {
      throw new Error(`Resource ${resourceSlug} not found`);
    }
    await this.updateResourceCache(resource, true, 'refresh');
    console.log(
      `ResourcePerformanceManager Hard Refresh Resource ${resourceSlug} done - op# ${this.actionIdx}`
    );
    this.actionIdx++;
  }

  public async softRefreshResource(resourceSlug: string) {
    console.log(
      `ResourcePerformanceManager Soft Refresh Resource ${resourceSlug} - op# ${this.actionIdx}`
    );
    const resource = this.resources.find((r) => r.slug === resourceSlug);
    if (!resource) {
      throw new Error(`Resource ${resourceSlug} not found`);
    }
    await this.updateResourceCache(resource, false, 'refresh');
    console.log(
      `ResourcePerformanceManager Soft Refresh Resource ${resourceSlug} done - op# ${this.actionIdx}`
    );
    this.actionIdx++;
  }

  public async hardRefreshAllResources(resources: Resource[]) {
    console.log(
      `ResourcePerformanceManager Hard Refresh All Resources - op# ${this.actionIdx}`
    );
    await this.initializeResources(resources, true);
    console.log(
      `ResourcePerformanceManager Hard Refresh All Resources done - op# ${this.actionIdx}`
    );
    this.actionIdx++;
  }

  public async softRefreshAllResources(resources: Resource[]) {
    console.log(
      `ResourcePerformanceManager Soft Refresh All Resources - op# ${this.actionIdx}`
    );
    await this.initializeResources(resources, false);
    console.log(
      `ResourcePerformanceManager Soft Refresh All Resources done - op# ${this.actionIdx}`
    );
    this.actionIdx++;
  }

  public getResourcePerformance(resourceSlug: string) {
    if (
      !this.resourcePerformances[resourceSlug] &&
      !ResourcePerformanceManager._initialized
    ) {
      throw new Error(
        `Resource performance not initialized for ${resourceSlug}`
      );
    }
    return this.resourcePerformances[resourceSlug];
  }

  public getResourcePerformanceFromChainAndAddress(
    chainId: number,
    address: string
  ) {
    for (const resource of this.resources) {
      const slug = resource.slug;
      const rp = this.resourcePerformances[slug];
      if (rp.getMarketFromChainAndAddress(chainId, address)) {
        return rp;
      }
    }

    throw new Error(
      `Resource performance not initialized for ${chainId}-${address}`
    );
  }

  public getResourcePerformances() {
    if (!ResourcePerformanceManager._initialized) {
      throw new Error('Resource performance not initialized');
    }
    return this.resourcePerformances;
  }

  private async initializeResources(
    resources: Resource[],
    hardInitialize: boolean
  ) {
    console.log(
      `Checking CACHE_DISABLED in initializeResources. Value: [${process.env.CACHE_DISABLED}]`
    );
    if (process.env.CACHE_DISABLED === 'true') {
      console.log(
        'CACHE_DISABLED is true, skipping resource initialization.'
      );
      return;
    }

    // Clean up existing resource performances
    // await Promise.all(
    //   Object.values(this.resourcePerformances).map(async (rp) => {
    //     await rp.cleanup(); // TODO implement this method in ResourcePerformance class. It should stop (using AbortController) any running process (db or fs)
    //   })
    // );

    // Remove files from disk (hard init will recreate them)
    if (hardInitialize) {
      await clearStorageFiles();
    }

    // Get rid of existing resource performances and start fresh
    this.resourcePerformances = {};

    this.resources = resources;
    // Create all instances of ResourcePerformance
    for (const resource of this.resources) {
      this.resourcePerformances[resource.slug] = new ResourcePerformance(
        resource
      );
      console.log(
        `ResourcePerformanceManager Create Resource ${resource.slug} done - op# ${this.actionIdx}`
      );
    }

    // Initialize all instances of ResourcePerformance
    for (const resource of this.resources) {
      await this.updateResourceCache(resource, hardInitialize, 'initialize');
      console.log(
        `ResourcePerformanceManager Initialize Resource ${resource.slug} done - op# ${this.actionIdx}`
      );
    }
  }

  private async updateResourceCache(
    resource: Resource,
    hardInitialize: boolean,
    logMode: 'initialize' | 'refresh'
  ) {
    console.log(
      `Checking CACHE_DISABLED in updateResourceCache for ${resource.slug}. Value: [${process.env.CACHE_DISABLED}]`
    );
    if (process.env.CACHE_DISABLED === 'true') {
      console.log(
        `CACHE_DISABLED is true, skipping cache update for resource ${resource.slug}.`
      );
      return;
    }

    if (hardInitialize) {
      console.log(
        `ResourcePerformanceManager Hard ${logMode} resource ${resource.slug}`
      );
      await this.resourcePerformances[resource.slug].hardInitialize();
    } else {
      console.log(
        `ResourcePerformanceManager Soft ${logMode} resource ${resource.slug}`
      );
      await this.resourcePerformances[resource.slug].softInitialize();
    }
  }
}

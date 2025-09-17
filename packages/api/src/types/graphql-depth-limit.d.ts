declare module 'graphql-depth-limit' {
  import { ValidationRule } from 'graphql';

  interface DepthLimitOptions {
    ignore?: Array<string | RegExp>;
    callback?: (depth: number) => void;
  }

  function depthLimit(
    maxDepth: number,
    options?: DepthLimitOptions
  ): ValidationRule;

  export default depthLimit;
}

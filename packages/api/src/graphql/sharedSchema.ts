import { GraphQLSchema } from 'graphql';

export class SharedSchema {
  private static instance: SharedSchema;
  private _schema: GraphQLSchema | null = null;

  private constructor() {}

  public static getInstance(): SharedSchema {
    if (!SharedSchema.instance) {
      SharedSchema.instance = new SharedSchema();
    }
    return SharedSchema.instance;
  }

  public get schema(): GraphQLSchema | null {
    return this._schema;
  }

  public setSchema(schema: GraphQLSchema): void {
    this._schema = schema;
  }
}

/**
 * Convert a GraphQL selection set into a Prisma `include` tree.
 *
 * Replaces what `@pothos/plugin-prisma` does automatically — threading
 * the fields a client actually asked for into Prisma's query so we
 * fetch in one round-trip instead of 1+N per relation.
 *
 * Usage inside a resolver:
 *
 *   resolve: (_parent, args, _ctx, info) =>
 *     prisma.category.findMany({
 *       where: args.where,
 *       ...buildPrismaInclude(info, 'Category'),
 *     })
 *
 * The second arg is the Prisma model name (must match a key on
 * `Prisma.dmmf.datamodel.models`). We use it to distinguish scalar
 * fields (Prisma returns them by default) from relation fields (which
 * need `include`).
 *
 * Returns:
 *   - `{}` — client asked only for scalars; Prisma default is fine.
 *   - `{ include: { relationName: true | { include: ... } } }` —
 *     client asked for relations; emit a matching Prisma include tree.
 *
 * Walks `info.fieldNodes` directly (rather than using a helper lib) so
 * we don't depend on a package that bundles its own graphql instance.
 */

import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLResolveInfo,
  InlineFragmentNode,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';
import { Prisma } from '../../../generated/prisma';

type PrismaInclude = {
  [relation: string]: true | { include: PrismaInclude };
};

export interface BuildPrismaIncludeResult {
  include?: PrismaInclude;
}

/** `{ modelName: { fieldName: targetModelName } }` for relation fields only. */
let relationMapCache: Map<string, Map<string, string>> | undefined;

const getRelationMap = (): Map<string, Map<string, string>> => {
  if (relationMapCache) return relationMapCache;
  const map = new Map<string, Map<string, string>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const relations = new Map<string, string>();
    for (const field of model.fields) {
      if (field.kind === 'object') relations.set(field.name, field.type);
    }
    map.set(model.name, relations);
  }
  relationMapCache = map;
  return map;
};

/**
 * Resolve a SelectionNode down to zero or more FieldNodes, expanding
 * fragment spreads and inline fragments along the way.
 */
const flattenSelections = (
  selections: ReadonlyArray<SelectionNode>,
  fragments: { [name: string]: FragmentDefinitionNode }
): FieldNode[] => {
  const out: FieldNode[] = [];
  for (const sel of selections) {
    if (sel.kind === 'Field') {
      out.push(sel);
    } else if (sel.kind === 'InlineFragment') {
      out.push(
        ...flattenSelections(
          (sel as InlineFragmentNode).selectionSet.selections,
          fragments
        )
      );
    } else if (sel.kind === 'FragmentSpread') {
      const frag = fragments[sel.name.value];
      if (frag)
        out.push(...flattenSelections(frag.selectionSet.selections, fragments));
    }
  }
  return out;
};

const walk = (
  selectionSet: SelectionSetNode | undefined,
  modelName: string,
  relationsByModel: Map<string, Map<string, string>>,
  fragments: { [name: string]: FragmentDefinitionNode }
): PrismaInclude | undefined => {
  if (!selectionSet) return undefined;
  const modelRelations = relationsByModel.get(modelName);
  if (!modelRelations) return undefined;
  const include: PrismaInclude = {};
  for (const field of flattenSelections(selectionSet.selections, fragments)) {
    const name = field.name.value;
    const childModel = modelRelations.get(name);
    if (!childModel) continue;
    const nested = walk(
      field.selectionSet,
      childModel,
      relationsByModel,
      fragments
    );
    include[name] = nested ? { include: nested } : true;
  }
  return Object.keys(include).length > 0 ? include : undefined;
};

export const buildPrismaInclude = (
  info: GraphQLResolveInfo,
  modelName: string
): BuildPrismaIncludeResult => {
  const root = info.fieldNodes[0];
  const include = walk(
    root.selectionSet,
    modelName,
    getRelationMap(),
    info.fragments
  );
  return include ? { include } : {};
};

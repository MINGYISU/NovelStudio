import { computeDisplayTitles, UNTITLED, type NumberableNode } from './numbering.ts';
import type { MapData, MapLink } from './schemas/map.ts';
import type { StructureSettings } from './schemas/structure.ts';

export interface LinkTarget {
  title: string;
  trashed: boolean;
}

export interface ResolvedLink {
  label: string;
  state: 'ok' | 'trashed' | 'missing';
}

/** Current display title of every section, trashed ones included (they show their plain title). */
export function sectionTargets(
  nodes: readonly (NumberableNode & { deletedAt: string | null })[],
  structure?: StructureSettings,
): Map<string, LinkTarget> {
  const titles = computeDisplayTitles(
    nodes.filter((n) => n.deletedAt === null),
    structure,
  );
  return new Map(
    nodes.map((n) => [
      n.id,
      { title: titles.get(n.id) ?? (n.title || UNTITLED), trashed: n.deletedAt !== null },
    ]),
  );
}

/** MAP-07: a link always shows the target's current title, never a copy stored in the map. */
export function resolveMapLink(
  link: MapLink,
  sections: ReadonlyMap<string, LinkTarget>,
  entryTitles: ReadonlyMap<string, string>,
): ResolvedLink {
  if (link.type === 'node') {
    const section = sections.get(link.id);
    if (!section) return { label: '(missing)', state: 'missing' };
    if (section.trashed) return { label: `${section.title} (in trash)`, state: 'trashed' };
    return { label: section.title, state: 'ok' };
  }
  const title = entryTitles.get(link.id);
  return title === undefined
    ? { label: '(missing)', state: 'missing' }
    : { label: title || UNTITLED, state: 'ok' };
}

/** Rewrites link ids (restore with new ids); ids the lookup does not know are kept as they are. */
export function remapMapLinks(data: MapData, lookup: (id: string) => string | undefined): MapData {
  return {
    ...data,
    nodes: data.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        links: node.data.links.map((link) => ({ ...link, id: lookup(link.id) ?? link.id })),
      },
    })),
  };
}

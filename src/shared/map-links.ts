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

/** The words a resolved link can contain; the client passes the interface language (PRD I18N-07). */
export interface LinkTexts {
  untitled: string;
  missing: string;
  inTrash: (title: string) => string;
}

export const ENGLISH_LINK_TEXTS: LinkTexts = {
  untitled: UNTITLED,
  missing: '(missing)',
  inTrash: (title) => `${title} (in trash)`,
};

/** Current display title of every section, trashed ones included (they show their plain title). */
export function sectionTargets(
  nodes: readonly (NumberableNode & { deletedAt: string | null })[],
  structure?: StructureSettings,
  untitled: string = UNTITLED,
): Map<string, LinkTarget> {
  const titles = computeDisplayTitles(
    nodes.filter((n) => n.deletedAt === null),
    structure,
    untitled,
  );
  return new Map(
    nodes.map((n) => [
      n.id,
      { title: titles.get(n.id) ?? (n.title || untitled), trashed: n.deletedAt !== null },
    ]),
  );
}

/** MAP-07: a link always shows the target's current title, never a copy stored in the map. */
export function resolveMapLink(
  link: MapLink,
  sections: ReadonlyMap<string, LinkTarget>,
  entryTitles: ReadonlyMap<string, string>,
  texts: LinkTexts = ENGLISH_LINK_TEXTS,
): ResolvedLink {
  if (link.type === 'node') {
    const section = sections.get(link.id);
    if (!section) return { label: texts.missing, state: 'missing' };
    if (section.trashed) return { label: texts.inTrash(section.title), state: 'trashed' };
    return { label: section.title, state: 'ok' };
  }
  const title = entryTitles.get(link.id);
  return title === undefined
    ? { label: texts.missing, state: 'missing' }
    : { label: title || texts.untitled, state: 'ok' };
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

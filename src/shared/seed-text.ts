import type { Locale } from './schemas/locale.ts';
import type { CodexFieldDef } from './schemas/codex.ts';
import type { MapTemplate } from './schemas/map.ts';

/**
 * Text the app creates for the user (PRD I18N-06), in the interface language of that moment.
 * It is stored as ordinary book data and never rewritten when the language changes. Field keys
 * are language-neutral: only labels and names differ.
 */

type FieldKind = CodexFieldDef['type'];

interface FieldSeed {
  key: string;
  type: FieldKind;
  label: Record<Locale, string>;
}

const field = (key: string, type: FieldKind, en: string, zh: string): FieldSeed => ({
  key,
  type,
  label: { en, 'zh-CN': zh },
});

const CHARACTER_FIELD_SEEDS: readonly FieldSeed[] = [
  field('name', 'text', 'Name', '姓名'),
  field('aliases', 'text', 'Aliases', '别名'),
  field('role', 'text', 'Role', '身份'),
  field('age', 'text', 'Age', '年龄'),
  field('appearance', 'longtext', 'Appearance', '外貌'),
  field('background', 'longtext', 'Background', '背景'),
  field('personality', 'longtext', 'Personality', '性格'),
  field('goals', 'longtext', 'Goals & Motivation', '目标与动机'),
  field('relationships', 'longtext', 'Relationships', '人物关系'),
  field('arc_notes', 'longtext', 'Arc notes', '人物弧光'),
  field('notes', 'longtext', 'Notes', '备注'),
];

const GENERIC_FIELD_SEEDS: readonly FieldSeed[] = [
  field('description', 'longtext', 'Description', '描述'),
  field('notes', 'longtext', 'Notes', '备注'),
];

const CATEGORY_SEEDS: readonly {
  name: Record<Locale, string>;
  fields: readonly FieldSeed[];
}[] = [
  { name: { en: 'Characters', 'zh-CN': '人物' }, fields: CHARACTER_FIELD_SEEDS },
  { name: { en: 'Locations', 'zh-CN': '地点' }, fields: GENERIC_FIELD_SEEDS },
  { name: { en: 'Era & Timeline', 'zh-CN': '时代与年表' }, fields: GENERIC_FIELD_SEEDS },
  { name: { en: 'Culture & Traditions', 'zh-CN': '文化与习俗' }, fields: GENERIC_FIELD_SEEDS },
  { name: { en: 'Organizations', 'zh-CN': '组织与势力' }, fields: GENERIC_FIELD_SEEDS },
  { name: { en: 'Creatures & Species', 'zh-CN': '生物与种族' }, fields: GENERIC_FIELD_SEEDS },
  { name: { en: 'Rules & Concepts', 'zh-CN': '规则与概念' }, fields: GENERIC_FIELD_SEEDS },
  { name: { en: 'Other', 'zh-CN': '其他' }, fields: GENERIC_FIELD_SEEDS },
];

const toDefs = (seeds: readonly FieldSeed[], locale: Locale): CodexFieldDef[] =>
  seeds.map((f) => ({ key: f.key, label: f.label[locale], type: f.type }));

/** CDX-01: the default categories for a new book, in order. */
export function defaultCategories(
  locale: Locale,
): { name: string; fieldTemplate: CodexFieldDef[] }[] {
  return CATEGORY_SEEDS.map((c) => ({
    name: c.name[locale],
    fieldTemplate: toDefs(c.fields, locale),
  }));
}

/** Field keys per default category, for tests: the keys must be identical in every language. */
export function defaultCategoryFieldKeys(): string[][] {
  return CATEGORY_SEEDS.map((c) => c.fields.map((f) => f.key));
}

interface MapNodeSeed {
  title: Record<Locale, string>;
  description?: Record<Locale, string>;
}

const mapNode = (en: string, zh: string): MapNodeSeed => ({ title: { en, 'zh-CN': zh } });

/** Node titles and descriptions of each map template, by the template's node key. */
const MAP_NODE_SEEDS: Record<Exclude<MapTemplate, 'blank'>, Record<string, MapNodeSeed>> = {
  timeline: {
    a: mapNode('Opening', '开端'),
    b: mapNode('Development', '发展'),
    c: mapNode('Turning point', '转折点'),
    d: mapNode('Ending', '结局'),
  },
  'plot-tree': {
    premise: mapNode('Premise', '前提'),
    setup: mapNode('Setup', '铺垫'),
    incident: mapNode('Inciting incident', '触发事件'),
    confrontation: mapNode('Confrontation', '对抗'),
    midpoint: mapNode('Midpoint', '中点'),
    crisis: mapNode('Crisis', '危机'),
    resolution: mapNode('Resolution', '收尾'),
    climax: mapNode('Climax', '高潮'),
  },
  'character-arc': {
    start: {
      title: { en: 'Start state', 'zh-CN': '起始状态' },
      description: { en: 'Who they are at the beginning.', 'zh-CN': '故事开始时的样子。' },
    },
    first: mapNode('First change', '第一次转变'),
    second: mapNode('Second change', '第二次转变'),
    end: {
      title: { en: 'End state', 'zh-CN': '最终状态' },
      description: { en: 'Who they have become.', 'zh-CN': '最终成为的样子。' },
    },
  },
};

export function mapNodeText(
  template: Exclude<MapTemplate, 'blank'>,
  key: string,
  locale: Locale,
): { title: string; description: string } {
  const seed = MAP_NODE_SEEDS[template][key];
  return { title: seed?.title[locale] ?? key, description: seed?.description?.[locale] ?? '' };
}

export function mapNodeKeys(template: Exclude<MapTemplate, 'blank'>): string[] {
  return Object.keys(MAP_NODE_SEEDS[template]);
}

const MAP_TITLES: Record<MapTemplate, Record<Locale, string>> = {
  blank: { en: 'Untitled map', 'zh-CN': '未命名故事图' },
  timeline: { en: 'Timeline', 'zh-CN': '时间线' },
  'plot-tree': { en: 'Plot tree', 'zh-CN': '情节树' },
  'character-arc': { en: 'Character arc', 'zh-CN': '人物弧光' },
};

/** The title of a new map when the user does not type one. */
export function defaultMapTitle(template: MapTemplate, locale: Locale): string {
  return MAP_TITLES[template][locale];
}

const COPY_SUFFIX: Record<Locale, string> = { en: ' (copy)', 'zh-CN': '（副本）' };

/** The title of a duplicated section or map; the caller cuts it to the field's length limit. */
export function copyTitle(title: string, locale: Locale): string {
  return `${title}${COPY_SUFFIX[locale]}`;
}

const FRONT_MATTER: Record<Locale, string> = { en: 'Front matter', 'zh-CN': '前言' };

export function frontMatterTitle(locale: Locale): string {
  return FRONT_MATTER[locale];
}

/** Appended to the title of a restored book whose title is already taken; `date` is `YYYY-MM-DD`. */
export function restoredSuffix(date: string, locale: Locale): string {
  return locale === 'zh-CN' ? `（恢复于 ${date}）` : ` (restored ${date})`;
}

const UNTITLED: Record<Locale, string> = { en: '(untitled)', 'zh-CN': '（无标题）' };

/** The placeholder for a section without a title, in exports. The interface has its own message. */
export function untitledLabel(locale: Locale): string {
  return UNTITLED[locale];
}

import { describe, expect, it } from 'vitest';
import { buildTemplate } from './map-templates.ts';
import { MAP_TEMPLATES } from './schemas/map.ts';
import {
  copyTitle,
  defaultCategories,
  defaultCategoryFieldKeys,
  defaultMapTitle,
  frontMatterTitle,
  mapNodeKeys,
  mapNodeText,
  restoredSuffix,
  untitledLabel,
} from './seed-text.ts';

describe('seed-text (I18N-06)', () => {
  it('has the same Codex field keys, types and order in both locales', () => {
    const en = defaultCategories('en');
    const zh = defaultCategories('zh-CN');
    expect(zh).toHaveLength(en.length);
    expect(en.map((c) => c.fieldTemplate.map((f) => f.key))).toEqual(defaultCategoryFieldKeys());
    expect(zh.map((c) => c.fieldTemplate.map((f) => f.key))).toEqual(defaultCategoryFieldKeys());
    expect(zh.map((c) => c.fieldTemplate.map((f) => f.type))).toEqual(
      en.map((c) => c.fieldTemplate.map((f) => f.type)),
    );
  });

  it('has non-empty names and labels, and the Chinese ones from the glossary', () => {
    const zh = defaultCategories('zh-CN');
    expect(zh.map((c) => c.name)).toEqual([
      '人物',
      '地点',
      '时代与年表',
      '文化与习俗',
      '组织与势力',
      '生物与种族',
      '规则与概念',
      '其他',
    ]);
    expect(zh[0]!.fieldTemplate.map((f) => f.label)).toEqual([
      '姓名',
      '别名',
      '身份',
      '年龄',
      '外貌',
      '背景',
      '性格',
      '目标与动机',
      '人物关系',
      '人物弧光',
      '备注',
    ]);
    expect(zh[1]!.fieldTemplate.map((f) => f.label)).toEqual(['描述', '备注']);
    for (const locale of ['en', 'zh-CN'] as const) {
      for (const category of defaultCategories(locale)) {
        expect(category.name.trim()).not.toBe('');
        for (const field of category.fieldTemplate) expect(field.label.trim()).not.toBe('');
      }
    }
  });

  it('returns fresh objects, so a caller cannot change the defaults', () => {
    const first = defaultCategories('en');
    first[0]!.fieldTemplate[0]!.label = 'Changed';
    expect(defaultCategories('en')[0]!.fieldTemplate[0]!.label).toBe('Name');
  });

  it('has a title for every map template and a text for every template node, in both locales', () => {
    for (const template of MAP_TEMPLATES) {
      for (const locale of ['en', 'zh-CN'] as const) {
        expect(defaultMapTitle(template, locale).trim()).not.toBe('');
        if (template === 'blank') continue;
        const data = buildTemplate(
          template,
          (() => {
            let n = 0;
            return () => `id${n++}`;
          })(),
          locale,
        );
        expect(data.nodes).toHaveLength(mapNodeKeys(template).length);
        for (const key of mapNodeKeys(template)) {
          expect(mapNodeText(template, key, locale).title.trim()).not.toBe('');
        }
        expect(data.nodes.every((node) => node.data.title.trim() !== '')).toBe(true);
      }
    }
  });

  it('builds the copy, front matter, restored and untitled texts', () => {
    expect(copyTitle('Rain', 'en')).toBe('Rain (copy)');
    expect(copyTitle('雨', 'zh-CN')).toBe('雨（副本）');
    expect(frontMatterTitle('en')).toBe('Front matter');
    expect(frontMatterTitle('zh-CN')).toBe('前言');
    expect(restoredSuffix('2026-11-02', 'en')).toBe(' (restored 2026-11-02)');
    expect(restoredSuffix('2026-11-02', 'zh-CN')).toBe('（恢复于 2026-11-02）');
    expect(untitledLabel('en')).toBe('(untitled)');
    expect(untitledLabel('zh-CN')).toBe('（无标题）');
  });
});

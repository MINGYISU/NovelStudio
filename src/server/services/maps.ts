import crypto from 'node:crypto';
import { buildTemplate } from '../../shared/map-templates.ts';
import type {
  CreateMapBody,
  MapData,
  MapTemplate,
  PatchMapBody,
  StoryMap,
} from '../../shared/schemas/map.ts';
import type { Db } from '../db/connection.ts';
import { ApiError } from '../errors.ts';
import {
  deleteMapRow,
  getMap,
  getMapRawData,
  insertMap,
  listMaps,
  setMapPositions,
  updateMapData,
  updateMapTitle,
} from '../repos/maps.ts';
import { touchBook } from '../repos/nodes.ts';
import type { LibraryService } from './library.ts';

const TEMPLATE_TITLES: Record<MapTemplate, string> = {
  blank: 'Untitled map',
  timeline: 'Timeline',
  'plot-tree': 'Plot tree',
  'character-arc': 'Character arc',
};

export class MapService {
  constructor(
    private readonly db: Db,
    private readonly library: LibraryService,
  ) {}

  list(bookId: string): { maps: StoryMap[] } {
    this.library.requireBook(bookId);
    return { maps: listMaps(this.db, bookId) };
  }

  create(bookId: string, body: CreateMapBody): { map: StoryMap } {
    return this.db.transaction(() => {
      this.library.requireLiveBook(bookId);
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      insertMap(this.db, {
        id,
        bookId,
        title: body.title ?? TEMPLATE_TITLES[body.template],
        template: body.template,
        data: JSON.stringify(buildTemplate(body.template, () => crypto.randomUUID())),
        position: listMaps(this.db, bookId).length,
        createdAt: now,
        updatedAt: now,
      });
      touchBook(this.db, bookId, now);
      return { map: this.require(id) };
    })();
  }

  rename(id: string, patch: PatchMapBody): { map: StoryMap } {
    return this.db.transaction(() => {
      const map = this.require(id);
      this.library.requireLiveBook(map.bookId);
      const now = new Date().toISOString();
      updateMapTitle(this.db, id, patch.title, now);
      touchBook(this.db, map.bookId, now);
      return { map: this.require(id) };
    })();
  }

  /** MAP-08: the whole map is stored per save. A map with unreadable parts is never overwritten. */
  saveData(id: string, data: MapData): { updatedAt: string } {
    return this.db.transaction(() => {
      const map = this.require(id);
      this.library.requireLiveBook(map.bookId);
      if (map.damaged) {
        throw new ApiError(
          409,
          'MAP_DAMAGED',
          'Part of this map could not be read, so it is kept read-only to avoid losing it.',
        );
      }
      const now = new Date().toISOString();
      updateMapData(this.db, id, data, now);
      touchBook(this.db, map.bookId, now);
      return { updatedAt: now };
    })();
  }

  /** The copy goes right after the original and gets the stored data as it is, under new ids for the map only. */
  duplicate(id: string): { map: StoryMap } {
    return this.db.transaction(() => {
      const original = this.require(id);
      this.library.requireLiveBook(original.bookId);
      const now = new Date().toISOString();
      const copyId = crypto.randomUUID();
      insertMap(this.db, {
        id: copyId,
        bookId: original.bookId,
        title: `${original.title} (copy)`.slice(0, 200),
        template: original.template,
        data: getMapRawData(this.db, id) ?? JSON.stringify(original.data),
        position: original.position + 1,
        createdAt: now,
        updatedAt: now,
      });
      const ordered = listMaps(this.db, original.bookId)
        .map((m) => m.id)
        .filter((x) => x !== copyId);
      ordered.splice(ordered.indexOf(id) + 1, 0, copyId);
      setMapPositions(this.db, ordered);
      touchBook(this.db, original.bookId, now);
      return { map: this.require(copyId) };
    })();
  }

  delete(id: string): { maps: StoryMap[] } {
    return this.db.transaction(() => {
      const map = this.require(id);
      this.library.requireLiveBook(map.bookId);
      deleteMapRow(this.db, id);
      setMapPositions(
        this.db,
        listMaps(this.db, map.bookId).map((m) => m.id),
      );
      touchBook(this.db, map.bookId, new Date().toISOString());
      return { maps: listMaps(this.db, map.bookId) };
    })();
  }

  private require(id: string): StoryMap {
    const map = getMap(this.db, id);
    if (!map) throw new ApiError(404, 'NOT_FOUND', 'Map not found.');
    return map;
  }
}

import { getDatabase } from './database';
import type {
  Topic, CreateTopic, UpdateTopic,
  Recording, CreateRecording, UpdateRecording,
  Image, CreateImage,
  Video, CreateVideo
} from '../../src/types';

// Helper to parse tags from JSON string
function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    return JSON.parse(tagsJson);
  } catch {
    return [];
  }
}

// Helper to convert row to Topic
function rowToTopic(row: Record<string, unknown>): Topic {
  return {
    ...row,
    tags: parseTags(row.tags as string),
  } as Topic;
}

// Topics Operations
export const TopicsOperations = {
  getAll(): Topic[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM topic_stats
      ORDER BY updated_at DESC
    `).all() as Record<string, unknown>[];

    return rows.map(rowToTopic);
  },

  getById(id: number): Topic | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM topic_stats WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;

    return row ? rowToTopic(row) : null;
  },

  create(topic: CreateTopic): Topic {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO topics (name, tags, importance_level)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(
      topic.name,
      JSON.stringify(topic.tags || []),
      topic.importance_level ?? 5
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, updates: UpdateTopic): Topic {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.importance_level !== undefined) {
      fields.push('importance_level = ?');
      values.push(updates.importance_level);
    }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      db.prepare(`
        UPDATE topics SET ${fields.join(', ')} WHERE id = ?
      `).run(...values);
    }

    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM topics WHERE id = ?').run(id);
  },
};

// Recordings Operations
export const RecordingsOperations = {
  getByTopic(topicId: number): Recording[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM recordings
      WHERE topic_id = ?
      ORDER BY created_at DESC
    `).all(topicId) as Recording[];

    // Load images and videos for each recording
    return rows.map(recording => ({
      ...recording,
      images: ImagesOperations.getByRecording(recording.id),
      videos: VideosOperations.getByRecording(recording.id),
    }));
  },

  getById(id: number): Recording | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM recordings WHERE id = ?
    `).get(id) as Recording | undefined;

    if (!row) return null;

    return {
      ...row,
      images: ImagesOperations.getByRecording(id),
      videos: VideosOperations.getByRecording(id),
    };
  },

  create(recording: CreateRecording): Recording {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO recordings (topic_id, audio_path, audio_duration, notes_content)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      recording.topic_id,
      recording.audio_path,
      recording.audio_duration,
      recording.notes_content
    );

    // Update topic's updated_at
    db.prepare(`
      UPDATE topics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(recording.topic_id);

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, updates: UpdateRecording): Recording {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.audio_path !== undefined) {
      fields.push('audio_path = ?');
      values.push(updates.audio_path);
    }
    if (updates.audio_duration !== undefined) {
      fields.push('audio_duration = ?');
      values.push(updates.audio_duration);
    }
    if (updates.notes_content !== undefined) {
      fields.push('notes_content = ?');
      values.push(updates.notes_content);
    }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      db.prepare(`
        UPDATE recordings SET ${fields.join(', ')} WHERE id = ?
      `).run(...values);

      // Update parent topic's updated_at
      const recording = this.getById(id);
      if (recording) {
        db.prepare(`
          UPDATE topics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(recording.topic_id);
      }
    }

    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    const recording = this.getById(id);

    db.prepare('DELETE FROM recordings WHERE id = ?').run(id);

    // Update parent topic's updated_at
    if (recording) {
      db.prepare(`
        UPDATE topics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(recording.topic_id);
    }
  },
};

// Images Operations
export const ImagesOperations = {
  getByRecording(recordingId: number): Image[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM images
      WHERE recording_id = ?
      ORDER BY sort_order, created_at
    `).all(recordingId) as Image[];
  },

  getById(id: number): Image | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM images WHERE id = ?').get(id) as Image | undefined ?? null;
  },

  create(image: CreateImage): Image {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO images (recording_id, file_path, thumbnail_path, sort_order)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      image.recording_id,
      image.file_path,
      image.thumbnail_path,
      image.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM images WHERE id = ?').run(id);
  },
};

// Videos Operations
export const VideosOperations = {
  getByRecording(recordingId: number): Video[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM videos
      WHERE recording_id = ?
      ORDER BY sort_order, created_at
    `).all(recordingId) as Video[];
  },

  getById(id: number): Video | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Video | undefined ?? null;
  },

  create(video: CreateVideo): Video {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO videos (recording_id, file_path, thumbnail_path, duration, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      video.recording_id,
      video.file_path,
      video.thumbnail_path,
      video.duration,
      video.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM videos WHERE id = ?').run(id);
  },
};

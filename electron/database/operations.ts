import { getDatabase } from './database';
import type {
  Topic, CreateTopic, UpdateTopic,
  Recording, CreateRecording, UpdateRecording,
  Image, CreateImage,
  Video, CreateVideo,
  Audio, CreateAudio,
  Duration, CreateDuration, UpdateDuration,
  DurationImage, CreateDurationImage,
  DurationVideo, CreateDurationVideo,
  DurationAudio, CreateDurationAudio,
  DurationImageAudio,
  CodeSnippet, CreateCodeSnippet, UpdateCodeSnippet,
  DurationCodeSnippet, CreateDurationCodeSnippet, UpdateDurationCodeSnippet,
  DurationGroupColor,
  DurationColor,
  AudioMarker
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
      INSERT INTO topics (name, tags, importance_level, color)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      topic.name,
      JSON.stringify(topic.tags || []),
      topic.importance_level ?? 5,
      topic.color ?? null
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
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
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
      INSERT INTO recordings (
        topic_id, name, audio_path, audio_duration, video_path, video_duration,
        video_resolution, video_fps, video_size, notes_content, main_notes_content,
        importance_color, recording_type, pdf_path, page_offset,
        book_data_path, reading_progress, character_offset, total_pages, total_words
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      recording.topic_id,
      recording.name ?? null,
      recording.audio_path,
      recording.audio_duration,
      recording.video_path ?? null,
      recording.video_duration ?? null,
      recording.video_resolution ?? null,
      recording.video_fps ?? null,
      recording.video_size ?? null,
      recording.notes_content,
      recording.main_notes_content ?? null,
      recording.importance_color ?? null,
      recording.recording_type ?? 'audio',
      recording.pdf_path ?? null,
      recording.page_offset ?? 0,
      recording.book_data_path ?? null,
      recording.reading_progress ?? 0.0,
      recording.character_offset ?? 0,
      recording.total_pages ?? null,
      recording.total_words ?? null
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

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.audio_path !== undefined) {
      fields.push('audio_path = ?');
      values.push(updates.audio_path);
    }
    if (updates.audio_duration !== undefined) {
      fields.push('audio_duration = ?');
      values.push(updates.audio_duration);
    }
    if (updates.audio_size !== undefined) {
      fields.push('audio_size = ?');
      values.push(updates.audio_size);
    }
    if (updates.video_path !== undefined) {
      fields.push('video_path = ?');
      values.push(updates.video_path);
    }
    if (updates.video_duration !== undefined) {
      fields.push('video_duration = ?');
      values.push(updates.video_duration);
    }
    if (updates.video_resolution !== undefined) {
      fields.push('video_resolution = ?');
      values.push(updates.video_resolution);
    }
    if (updates.video_fps !== undefined) {
      fields.push('video_fps = ?');
      values.push(updates.video_fps);
    }
    if (updates.video_size !== undefined) {
      fields.push('video_size = ?');
      values.push(updates.video_size);
    }
    if (updates.notes_content !== undefined) {
      fields.push('notes_content = ?');
      values.push(updates.notes_content);
    }
    if (updates.main_notes_content !== undefined) {
      fields.push('main_notes_content = ?');
      values.push(updates.main_notes_content);
    }
    if (updates.importance_color !== undefined) {
      fields.push('importance_color = ?');
      values.push(updates.importance_color);
    }
    if (updates.pdf_path !== undefined) {
      fields.push('pdf_path = ?');
      values.push(updates.pdf_path);
    }
    if (updates.page_offset !== undefined) {
      fields.push('page_offset = ?');
      values.push(updates.page_offset);
    }
    if (updates.book_data_path !== undefined) {
      fields.push('book_data_path = ?');
      values.push(updates.book_data_path);
    }
    if (updates.reading_progress !== undefined) {
      fields.push('reading_progress = ?');
      values.push(updates.reading_progress);
    }
    if (updates.character_offset !== undefined) {
      fields.push('character_offset = ?');
      values.push(updates.character_offset);
    }
    if (updates.total_pages !== undefined) {
      fields.push('total_pages = ?');
      values.push(updates.total_pages);
    }
    if (updates.total_words !== undefined) {
      fields.push('total_words = ?');
      values.push(updates.total_words);
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

  updateGroupColorState(
    id: number,
    lastGroupColor: DurationGroupColor,
    toggleActive: boolean
  ): Recording {
    const db = getDatabase();
    db.prepare(`
      UPDATE recordings
      SET last_group_color = ?, group_toggle_active = ?
      WHERE id = ?
    `).run(lastGroupColor, toggleActive ? 1 : 0, id);

    return this.getById(id)!;
  },

  getGroupColorState(id: number): {
    lastGroupColor: DurationGroupColor;
    toggleActive: boolean;
  } {
    const recording = this.getById(id);
    if (!recording) {
      throw new Error(`Recording ${id} not found`);
    }
    return {
      lastGroupColor: recording.last_group_color,
      toggleActive: Boolean(recording.group_toggle_active),
    };
  },

  getCanvasFilePath(id: number): string | null {
    const db = getDatabase();
    const row = db.prepare('SELECT canvas_file_path FROM recordings WHERE id = ?').get(id) as { canvas_file_path: string | null } | undefined;
    return row?.canvas_file_path ?? null;
  },

  setCanvasFilePath(id: number, filePath: string): void {
    const db = getDatabase();
    db.prepare('UPDATE recordings SET canvas_file_path = ? WHERE id = ?').run(filePath, id);
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

  getMaxSortOrder(recordingId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM images WHERE recording_id = ?
    `).get(recordingId) as { max_order: number };
    return result.max_order;
  },

  create(image: CreateImage): Image {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO images (recording_id, file_path, thumbnail_path, caption, color, group_color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      image.recording_id,
      image.file_path,
      image.thumbnail_path,
      image.caption ?? null,
      image.color ?? null,
      image.group_color ?? null,
      image.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM images WHERE id = ?').run(id);
  },

  updateFilePaths(id: number, filePath: string, thumbnailPath: string | null): Image {
    const db = getDatabase();
    db.prepare('UPDATE images SET file_path = ?, thumbnail_path = ? WHERE id = ?').run(filePath, thumbnailPath, id);
    return this.getById(id)!;
  },

  updateCaption(id: number, caption: string | null): Image {
    const db = getDatabase();
    db.prepare('UPDATE images SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateCaption2(id: number, caption2: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE images SET caption2 = ? WHERE id = ?').run(caption2, id);
  },

  updateColor(id: number, color: DurationColor): Image {
    const db = getDatabase();
    db.prepare('UPDATE images SET color = ? WHERE id = ?').run(color, id);
    return this.getById(id)!;
  },

  updateGroupColor(id: number, groupColor: DurationGroupColor): Image {
    const db = getDatabase();
    db.prepare('UPDATE images SET group_color = ? WHERE id = ?').run(groupColor, id);
    return this.getById(id)!;
  },

  reorder(recordingId: number, orderedIds: number[]): Image[] {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE images SET sort_order = ? WHERE id = ? AND recording_id = ?');

    const updateMany = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        stmt.run(index, id, recordingId);
      });
    });

    updateMany(orderedIds);
    return this.getByRecording(recordingId);
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

  getMaxSortOrder(recordingId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM videos WHERE recording_id = ?
    `).get(recordingId) as { max_order: number };
    return result.max_order;
  },

  create(video: CreateVideo): Video {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO videos (recording_id, file_path, thumbnail_path, caption, color, group_color, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      video.recording_id,
      video.file_path,
      video.thumbnail_path,
      video.caption ?? null,
      video.color ?? null,
      video.group_color ?? null,
      video.duration,
      video.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM videos WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null): Video {
    const db = getDatabase();
    db.prepare('UPDATE videos SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateColor(id: number, color: DurationColor): Video {
    const db = getDatabase();
    db.prepare('UPDATE videos SET color = ? WHERE id = ?').run(color, id);
    return this.getById(id)!;
  },

  updateGroupColor(id: number, groupColor: DurationGroupColor): Video {
    const db = getDatabase();
    db.prepare('UPDATE videos SET group_color = ? WHERE id = ?').run(groupColor, id);
    return this.getById(id)!;
  },
};

// Durations Operations (marked time segments within recordings)
export const DurationsOperations = {
  getByRecording(recordingId: number): Duration[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM durations
      WHERE recording_id = ?
      ORDER BY sort_order, start_time
    `).all(recordingId) as Duration[];
  },

  getWithAudio(): Duration[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT d.*, r.name as recording_name, r.recording_type, t.name as topic_name, t.id as topic_id
      FROM durations d
      INNER JOIN duration_audios da ON da.duration_id = d.id
      INNER JOIN recordings r ON r.id = d.recording_id
      INNER JOIN topics t ON t.id = r.topic_id
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `).all() as Duration[];
  },

  getById(id: number): Duration | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM durations WHERE id = ?').get(id) as Duration | undefined ?? null;
  },

  create(duration: CreateDuration): Duration {
    const db = getDatabase();

    // Get max sort_order for this recording
    const maxOrder = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM durations WHERE recording_id = ?
    `).get(duration.recording_id) as { max_order: number };

    const stmt = db.prepare(`
      INSERT INTO durations (recording_id, start_time, end_time, note, group_color, sort_order, page_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      duration.recording_id,
      duration.start_time,
      duration.end_time,
      duration.note ?? null,
      duration.group_color ?? null,
      maxOrder.max_order + 1,
      duration.page_number ?? null
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, updates: UpdateDuration): Duration {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.note !== undefined) {
      fields.push('note = ?');
      values.push(updates.note);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    if (updates.group_color !== undefined) {
      fields.push('group_color = ?');
      values.push(updates.group_color);
    }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(`
        UPDATE durations SET ${fields.join(', ')} WHERE id = ?
      `).run(...values);
    }

    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM durations WHERE id = ?').run(id);
  },

  getCanvasFilePath(id: number): string | null {
    const db = getDatabase();
    const row = db.prepare('SELECT canvas_file_path FROM durations WHERE id = ?').get(id) as { canvas_file_path: string | null } | undefined;
    return row?.canvas_file_path ?? null;
  },

  setCanvasFilePath(id: number, filePath: string): void {
    const db = getDatabase();
    db.prepare('UPDATE durations SET canvas_file_path = ? WHERE id = ?').run(filePath, id);
  },

  reorder(recordingId: number, orderedIds: number[]): Duration[] {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE durations SET sort_order = ? WHERE id = ? AND recording_id = ?');

    const updateMany = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        stmt.run(index, id, recordingId);
      });
    });

    updateMany(orderedIds);
    return this.getByRecording(recordingId);
  },
};

// Duration Images Operations (images attached to duration marks)
export const DurationImagesOperations = {
  getByDuration(durationId: number): DurationImage[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_images
      WHERE duration_id = ?
      ORDER BY sort_order, created_at
    `).all(durationId) as DurationImage[];
  },

  getById(id: number): DurationImage | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_images WHERE id = ?').get(id) as DurationImage | undefined ?? null;
  },

  getMaxSortOrder(durationId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM duration_images WHERE duration_id = ?
    `).get(durationId) as { max_order: number };
    return result.max_order;
  },

  create(image: CreateDurationImage): DurationImage {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_images (
        duration_id, file_path, thumbnail_path, caption, color, group_color,
        sort_order, page_number, rect_x, rect_y, rect_w, rect_h
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      image.duration_id,
      image.file_path,
      image.thumbnail_path ?? null,
      image.caption ?? null,
      image.color ?? null,
      image.group_color ?? null,
      image.sort_order ?? 0,
      image.page_number ?? null,
      image.rect_x ?? null,
      image.rect_y ?? null,
      image.rect_w ?? null,
      image.rect_h ?? null
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_images WHERE id = ?').run(id);
  },

  deleteByDuration(durationId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_images WHERE duration_id = ?').run(durationId);
  },

  updateFilePaths(id: number, filePath: string, thumbnailPath: string | null): DurationImage {
    const db = getDatabase();
    db.prepare('UPDATE duration_images SET file_path = ?, thumbnail_path = ? WHERE id = ?').run(filePath, thumbnailPath, id);
    return this.getById(id)!;
  },

  updateCaption(id: number, caption: string | null): DurationImage {
    const db = getDatabase();
    db.prepare('UPDATE duration_images SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateCaption2(id: number, caption2: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE duration_images SET caption2 = ? WHERE id = ?').run(caption2, id);
  },

  updateColor(id: number, color: DurationColor): DurationImage {
    const db = getDatabase();
    db.prepare('UPDATE duration_images SET color = ? WHERE id = ?').run(color, id);
    return this.getById(id)!;
  },

  updateGroupColor(id: number, groupColor: DurationGroupColor): DurationImage {
    const db = getDatabase();
    db.prepare('UPDATE duration_images SET group_color = ? WHERE id = ?').run(groupColor, id);
    return this.getById(id)!;
  },

  reorder(durationId: number, orderedIds: number[]): DurationImage[] {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE duration_images SET sort_order = ? WHERE id = ? AND duration_id = ?');

    const updateMany = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        stmt.run(index, id, durationId);
      });
    });

    updateMany(orderedIds);
    return this.getByDuration(durationId);
  },
};

// Duration Videos Operations (videos attached to duration marks)
export const DurationVideosOperations = {
  getByDuration(durationId: number): DurationVideo[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_videos
      WHERE duration_id = ?
      ORDER BY sort_order, created_at
    `).all(durationId) as DurationVideo[];
  },

  getById(id: number): DurationVideo | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_videos WHERE id = ?').get(id) as DurationVideo | undefined ?? null;
  },

  getMaxSortOrder(durationId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM duration_videos WHERE duration_id = ?
    `).get(durationId) as { max_order: number };
    return result.max_order;
  },

  create(video: CreateDurationVideo): DurationVideo {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_videos (duration_id, file_path, thumbnail_path, caption, color, group_color, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      video.duration_id,
      video.file_path,
      video.thumbnail_path ?? null,
      video.caption ?? null,
      video.color ?? null,
      video.group_color ?? null,
      video.duration ?? null,
      video.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_videos WHERE id = ?').run(id);
  },

  deleteByDuration(durationId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_videos WHERE duration_id = ?').run(durationId);
  },

  updateCaption(id: number, caption: string | null): DurationVideo {
    const db = getDatabase();
    db.prepare('UPDATE duration_videos SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateColor(id: number, color: DurationColor): DurationVideo {
    const db = getDatabase();
    db.prepare('UPDATE duration_videos SET color = ? WHERE id = ?').run(color, id);
    return this.getById(id)!;
  },

  updateGroupColor(id: number, groupColor: DurationGroupColor): DurationVideo {
    const db = getDatabase();
    db.prepare('UPDATE duration_videos SET group_color = ? WHERE id = ?').run(groupColor, id);
    return this.getById(id)!;
  },
};

// Audios Operations (audio clips attached to recordings)
export const AudiosOperations = {
  getByRecording(recordingId: number): Audio[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM audios
      WHERE recording_id = ?
      ORDER BY sort_order, created_at
    `).all(recordingId) as Audio[];
  },

  getById(id: number): Audio | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM audios WHERE id = ?').get(id) as Audio | undefined ?? null;
  },

  create(audio: CreateAudio): Audio {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO audios (recording_id, file_path, caption, group_color, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      audio.recording_id,
      audio.file_path,
      audio.caption ?? null,
      audio.group_color ?? null,
      audio.duration ?? null,
      audio.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM audios WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null): Audio {
    const db = getDatabase();
    db.prepare('UPDATE audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateGroupColor(id: number, groupColor: DurationGroupColor): Audio {
    const db = getDatabase();
    db.prepare('UPDATE audios SET group_color = ? WHERE id = ?').run(groupColor, id);
    return this.getById(id)!;
  },
};

// Duration Audios Operations (audio clips attached to duration marks)
export const DurationAudiosOperations = {
  getByDuration(durationId: number): DurationAudio[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_audios
      WHERE duration_id = ?
      ORDER BY sort_order, created_at
    `).all(durationId) as DurationAudio[];
  },

  getById(id: number): DurationAudio | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_audios WHERE id = ?').get(id) as DurationAudio | undefined ?? null;
  },

  create(audio: CreateDurationAudio): DurationAudio {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_audios (duration_id, file_path, caption, group_color, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      audio.duration_id,
      audio.file_path,
      audio.caption ?? null,
      audio.group_color ?? null,
      audio.duration ?? null,
      audio.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_audios WHERE id = ?').run(id);
  },

  deleteByDuration(durationId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_audios WHERE duration_id = ?').run(durationId);
  },

  updateCaption(id: number, caption: string | null): DurationAudio {
    const db = getDatabase();
    db.prepare('UPDATE duration_audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateGroupColor(id: number, groupColor: DurationGroupColor): DurationAudio {
    const db = getDatabase();
    db.prepare('UPDATE duration_audios SET group_color = ? WHERE id = ?').run(groupColor, id);
    return this.getById(id)!;
  },
};

// Code Snippets Operations (code snippets attached to recordings)
export const CodeSnippetsOperations = {
  getByRecording(recordingId: number): CodeSnippet[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM code_snippets
      WHERE recording_id = ?
      ORDER BY sort_order, created_at
    `).all(recordingId) as CodeSnippet[];
  },

  getById(id: number): CodeSnippet | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM code_snippets WHERE id = ?').get(id) as CodeSnippet | undefined ?? null;
  },

  create(snippet: CreateCodeSnippet): CodeSnippet {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO code_snippets (recording_id, title, language, code, caption, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      snippet.recording_id,
      snippet.title ?? null,
      snippet.language,
      snippet.code,
      snippet.caption ?? null,
      snippet.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, updates: UpdateCodeSnippet): CodeSnippet {
    const db = getDatabase();
    const updateFields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      updateFields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.language !== undefined) {
      updateFields.push('language = ?');
      values.push(updates.language);
    }
    if (updates.code !== undefined) {
      updateFields.push('code = ?');
      values.push(updates.code);
    }
    if (updates.caption !== undefined) {
      updateFields.push('caption = ?');
      values.push(updates.caption);
    }

    if (updateFields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE code_snippets SET ${updateFields.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM code_snippets WHERE id = ?').run(id);
  },
};

// Duration Code Snippets Operations (code snippets attached to duration marks)
export const DurationCodeSnippetsOperations = {
  getByDuration(durationId: number): DurationCodeSnippet[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_code_snippets
      WHERE duration_id = ?
      ORDER BY sort_order, created_at
    `).all(durationId) as DurationCodeSnippet[];
  },

  getById(id: number): DurationCodeSnippet | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_code_snippets WHERE id = ?').get(id) as DurationCodeSnippet | undefined ?? null;
  },

  create(snippet: CreateDurationCodeSnippet): DurationCodeSnippet {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_code_snippets (duration_id, title, language, code, caption, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      snippet.duration_id,
      snippet.title ?? null,
      snippet.language,
      snippet.code,
      snippet.caption ?? null,
      snippet.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, updates: UpdateDurationCodeSnippet): DurationCodeSnippet {
    const db = getDatabase();
    const updateFields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      updateFields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.language !== undefined) {
      updateFields.push('language = ?');
      values.push(updates.language);
    }
    if (updates.code !== undefined) {
      updateFields.push('code = ?');
      values.push(updates.code);
    }
    if (updates.caption !== undefined) {
      updateFields.push('caption = ?');
      values.push(updates.caption);
    }

    if (updateFields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE duration_code_snippets SET ${updateFields.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_code_snippets WHERE id = ?').run(id);
  },

  deleteByDuration(durationId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_code_snippets WHERE duration_id = ?').run(durationId);
  },
};

// Duration Image Audios Operations (audio clips attached to individual duration images)
export const DurationImageAudiosOperations = {
  getByDurationImage(durationImageId: number): DurationImageAudio[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_image_audios
      WHERE duration_image_id = ?
      ORDER BY sort_order, created_at
    `).all(durationImageId) as DurationImageAudio[];
  },

  getByDuration(durationId: number): DurationImageAudio[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_image_audios
      WHERE duration_id = ?
      ORDER BY sort_order, created_at
    `).all(durationId) as DurationImageAudio[];
  },

  getById(id: number): DurationImageAudio | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_image_audios WHERE id = ?').get(id) as DurationImageAudio | undefined ?? null;
  },

  create(data: { duration_image_id: number; duration_id: number; file_path: string; caption?: string | null; duration?: number | null; sort_order?: number }): DurationImageAudio {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_image_audios (duration_image_id, duration_id, file_path, caption, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.duration_image_id,
      data.duration_id,
      data.file_path,
      data.caption ?? null,
      data.duration ?? null,
      data.sort_order ?? 0
    );
    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_image_audios WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null): DurationImageAudio {
    const db = getDatabase();
    db.prepare('UPDATE duration_image_audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  getMaxSortOrder(durationImageId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM duration_image_audios WHERE duration_image_id = ?
    `).get(durationImageId) as { max_order: number };
    return result.max_order;
  },
};

// Settings Operations
export const SettingsOperations = {
  get(key: string): string | null {
    const db = getDatabase();
    const result = db.prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return result?.value || null;
  },

  set(key: string, value: string): void {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  },

  getAll(): Record<string, string> {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as
      { key: string; value: string }[];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },
};

// Audio Markers Operations
export const AudioMarkersOperations = {
  getByAudio(audioId: number, audioType: 'duration' | 'duration_image'): AudioMarker[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM audio_markers
      WHERE audio_id = ? AND audio_type = ?
      ORDER BY start_time ASC
    `).all(audioId, audioType) as AudioMarker[];
  },

  addBatch(markers: Omit<AudioMarker, 'id' | 'created_at'>[]): AudioMarker[] {
    const db = getDatabase();
    const insert = db.prepare(`
      INSERT INTO audio_markers (audio_id, audio_type, marker_type, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `);
    const ids: number[] = [];
    const txn = db.transaction(() => {
      for (const m of markers) {
        const result = insert.run(m.audio_id, m.audio_type, m.marker_type, m.start_time, m.end_time ?? null);
        ids.push(result.lastInsertRowid as number);
      }
    });
    txn();
    return ids.map(id => db.prepare('SELECT * FROM audio_markers WHERE id = ?').get(id) as AudioMarker);
  },

  deleteByAudio(audioId: number, audioType: 'duration' | 'duration_image'): void {
    const db = getDatabase();
    db.prepare('DELETE FROM audio_markers WHERE audio_id = ? AND audio_type = ?').run(audioId, audioType);
  },
};

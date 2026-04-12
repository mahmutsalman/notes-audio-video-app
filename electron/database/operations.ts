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
  AudioMarker,
  Tag,
  MediaTagType,
  ImageAnnotation,
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

  updateFilePath(id: number, filePath: string): Video {
    const db = getDatabase();
    db.prepare('UPDATE videos SET file_path = ? WHERE id = ?').run(filePath, id);
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
        AND (is_video_mark IS NULL OR is_video_mark != 1)
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
    `;
    const params: number[] = [];
    if (topicIds && topicIds.length > 0) {
      query += ` WHERE t.id IN (${topicIds.map(() => '?').join(',')}) AND (d.is_video_mark IS NULL OR d.is_video_mark != 1)`;
      params.push(...topicIds);
    } else {
      query += ` WHERE (d.is_video_mark IS NULL OR d.is_video_mark != 1)`;
    }
    query += ` GROUP BY d.id ORDER BY d.created_at DESC`;
    return db.prepare(query).all(...params) as Duration[];
  },

  getById(id: number): Duration | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM durations WHERE id = ?').get(id) as Duration | undefined ?? null;
  },

  getByRecordingAndVideo(recordingId: number, videoId: number): Duration[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM durations
      WHERE recording_id = ? AND source_video_id = ?
      ORDER BY start_time
    `).all(recordingId, videoId) as Duration[];
  },

  getByRecordingAndDurationVideo(recordingId: number, durationVideoId: number): Duration[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM durations
      WHERE recording_id = ? AND source_duration_video_id = ?
      ORDER BY start_time
    `).all(recordingId, durationVideoId) as Duration[];
  },

  create(duration: CreateDuration): Duration {
    const db = getDatabase();

    // Get max sort_order for this recording
    const maxOrder = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM durations WHERE recording_id = ?
    `).get(duration.recording_id) as { max_order: number };

    const stmt = db.prepare(`
      INSERT INTO durations (recording_id, start_time, end_time, note, group_color, sort_order, page_number, source_video_id, source_duration_video_id, is_video_mark, is_ghost_mark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      duration.recording_id,
      duration.start_time,
      duration.end_time,
      duration.note ?? null,
      duration.group_color ?? null,
      maxOrder.max_order + 1,
      duration.page_number ?? null,
      duration.source_video_id ?? null,
      (duration as any).source_duration_video_id ?? null,
      (duration as any).is_video_mark ?? 0,
      (duration as any).is_ghost_mark ?? 0
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

  updateFilePath(id: number, filePath: string): DurationVideo {
    const db = getDatabase();
    db.prepare('UPDATE duration_videos SET file_path = ? WHERE id = ?').run(filePath, id);
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

// Image Audio Operations (audio clips attached to recording-level images)
export const ImageAudiosOperations = {
  getByImage(imageId: number) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM image_audios
      WHERE image_id = ?
      ORDER BY sort_order, created_at
    `).all(imageId);
  },

  getById(id: number) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM image_audios WHERE id = ?').get(id) ?? null;
  },

  create(data: { image_id: number; file_path: string; caption?: string | null; duration?: number | null; sort_order?: number }) {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO image_audios (image_id, file_path, caption, duration, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.image_id,
      data.file_path,
      data.caption ?? null,
      data.duration ?? null,
      data.sort_order ?? 0
    );
    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM image_audios WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null) {
    const db = getDatabase();
    db.prepare('UPDATE image_audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  getMaxSortOrder(imageId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM image_audios WHERE image_id = ?
    `).get(imageId) as { max_order: number };
    return result.max_order;
  },
};

// Capture Image Audio Operations (audio clips attached to quick_capture_images)
export const CaptureImageAudiosOperations = {
  getByImage(captureImageId: number) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM quick_capture_image_audios
      WHERE capture_image_id = ?
      ORDER BY sort_order, created_at
    `).all(captureImageId);
  },

  getById(id: number) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM quick_capture_image_audios WHERE id = ?').get(id) ?? null;
  },

  create(data: { capture_image_id: number; file_path: string; caption?: string | null; duration?: number | null; sort_order?: number }) {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO quick_capture_image_audios (capture_image_id, file_path, caption, duration, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.capture_image_id,
      data.file_path,
      data.caption ?? null,
      data.duration ?? null,
      data.sort_order ?? 0
    );
    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM quick_capture_image_audios WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null) {
    const db = getDatabase();
    db.prepare('UPDATE quick_capture_image_audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  getMaxSortOrder(captureImageId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM quick_capture_image_audios WHERE capture_image_id = ?
    `).get(captureImageId) as { max_order: number };
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
  getByAudio(audioId: number, audioType: 'duration' | 'duration_image' | 'recording' | 'recording_image' | 'quick_capture_audio'): AudioMarker[] {
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
      INSERT INTO audio_markers (audio_id, audio_type, marker_type, start_time, end_time, caption)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const ids: number[] = [];
    const txn = db.transaction(() => {
      for (const m of markers) {
        const result = insert.run(m.audio_id, m.audio_type, m.marker_type, m.start_time, m.end_time ?? null, (m as any).caption ?? null);
        ids.push(result.lastInsertRowid as number);
      }
    });
    txn();
    return ids.map(id => db.prepare('SELECT * FROM audio_markers WHERE id = ?').get(id) as AudioMarker);
  },

  deleteByAudio(audioId: number, audioType: 'duration' | 'duration_image' | 'recording' | 'recording_image' | 'quick_capture_audio'): void {
    const db = getDatabase();
    db.prepare('DELETE FROM audio_markers WHERE audio_id = ? AND audio_type = ?').run(audioId, audioType);
  },

  updateCaption(markerId: number, caption: string | null): AudioMarker {
    const db = getDatabase();
    db.prepare('UPDATE audio_markers SET caption = ? WHERE id = ?').run(caption, markerId);
    return db.prepare('SELECT * FROM audio_markers WHERE id = ?').get(markerId) as AudioMarker;
  },
};

// ============ Search ============

export interface GlobalSearchResult {
  content_type: string;
  source_id: number;
  parent_id: number;
  snippet: string;
  rank: number;
  topic_id: number | null;
  topic_name: string | null;
  recording_id: number | null;
  recording_name: string | null;
  file_path: string | null;
  thumbnail_path: string | null;
  marker_type: string | null;
  language: string | null;
  code: string | null;
}

function sanitizeFtsQuery(raw: string): string {
  const cleaned = raw.replace(/['"()*:^!@#$%&]/g, ' ').trim();
  if (!cleaned) return '';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map(w => `"${w}"*`).join(' ');
}

export const SearchOperations = {
  search(query: string, limit = 50): GlobalSearchResult[] {
    const ftsQuery = sanitizeFtsQuery(query);
    if (!ftsQuery) return [];

    const db = getDatabase();

    // Step 1: FTS5 search — get matched items with snippets
    const matches = db.prepare(`
      SELECT content_type,
             CAST(source_id AS INTEGER) as source_id,
             CAST(parent_id AS INTEGER) as parent_id,
             snippet(search_index, 3, '<mark>', '</mark>', '...', 48) as snippet,
             rank
      FROM search_index
      WHERE searchable_text MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as Array<{
      content_type: string;
      source_id: number;
      parent_id: number;
      snippet: string;
      rank: number;
    }>;

    if (matches.length === 0) return [];

    // Step 2: Collect unique IDs for batch context fetch
    const recordingIds = new Set<number>();
    const topicSourceIds = new Set<number>();

    for (const m of matches) {
      if (m.content_type === 'topic') {
        topicSourceIds.add(m.source_id);
      } else if (m.parent_id > 0) {
        recordingIds.add(m.parent_id);
      }
    }

    // Step 3: Batch fetch recording + topic context
    const recordingContextMap = new Map<number, { recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }>();
    if (recordingIds.size > 0) {
      const ids = Array.from(recordingIds);
      const ph = ids.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT r.id as recording_id, r.name as recording_name, t.id as topic_id, t.name as topic_name
        FROM recordings r JOIN topics t ON t.id = r.topic_id
        WHERE r.id IN (${ph})
      `).all(...ids) as any[];
      for (const row of rows) recordingContextMap.set(row.recording_id, row);
    }

    const topicContextMap = new Map<number, { topic_id: number; topic_name: string }>();
    if (topicSourceIds.size > 0) {
      const ids = Array.from(topicSourceIds);
      const ph = ids.map(() => '?').join(',');
      const rows = db.prepare(`SELECT id as topic_id, name as topic_name FROM topics WHERE id IN (${ph})`).all(...ids) as any[];
      for (const row of rows) topicContextMap.set(row.topic_id, row);
    }

    // Step 4: Batch fetch type-specific extra fields (file paths, thumbnails, code, marker_type)
    const extraByType = new Map<string, Map<number, any>>();
    const typeToIds = new Map<string, number[]>();
    const typesNeedingExtra = new Set(['image', 'video', 'audio', 'duration_image', 'duration_video', 'duration_audio', 'code_snippet', 'duration_code_snippet', 'audio_marker', 'duration_image_audio', 'image_audio', 'quick_capture_image', 'image_ocr', 'duration_image_ocr', 'quick_capture_image_ocr', 'image_child_ocr']);
    for (const m of matches) {
      if (typesNeedingExtra.has(m.content_type)) {
        if (!typeToIds.has(m.content_type)) typeToIds.set(m.content_type, []);
        typeToIds.get(m.content_type)!.push(m.source_id);
      }
    }

    const extraQueries: Record<string, string> = {
      image: 'SELECT id, file_path, thumbnail_path, NULL as duration_id FROM images WHERE id IN',
      video: 'SELECT id, file_path, thumbnail_path, NULL as duration_id FROM videos WHERE id IN',
      audio: 'SELECT id, file_path, NULL as thumbnail_path, NULL as duration_id FROM audios WHERE id IN',
      duration_image: 'SELECT id, file_path, thumbnail_path, duration_id FROM duration_images WHERE id IN',
      duration_video: 'SELECT id, file_path, thumbnail_path, duration_id FROM duration_videos WHERE id IN',
      duration_audio: 'SELECT id, file_path, NULL as thumbnail_path, duration_id FROM duration_audios WHERE id IN',
      code_snippet: 'SELECT id, language, code, NULL as file_path, NULL as thumbnail_path, NULL as duration_id FROM code_snippets WHERE id IN',
      duration_code_snippet: 'SELECT id, language, code, NULL as file_path, NULL as thumbnail_path, duration_id FROM duration_code_snippets WHERE id IN',
      audio_marker: 'SELECT id, marker_type, NULL as file_path, NULL as thumbnail_path, NULL as duration_id FROM audio_markers WHERE id IN',
      duration_image_audio: 'SELECT dia.id, dia.file_path, NULL as thumbnail_path, di.duration_id FROM duration_image_audios dia JOIN duration_images di ON di.id = dia.duration_image_id WHERE dia.id IN',
      image_audio: 'SELECT id, file_path, NULL as thumbnail_path, NULL as duration_id FROM image_audios WHERE id IN',
      quick_capture_image: 'SELECT id, file_path, thumbnail_path, NULL as duration_id FROM quick_capture_images WHERE id IN',
      image_ocr:               'SELECT id, file_path, thumbnail_path, NULL as duration_id FROM images WHERE id IN',
      duration_image_ocr:      'SELECT id, file_path, thumbnail_path, duration_id FROM duration_images WHERE id IN',
      quick_capture_image_ocr: 'SELECT id, file_path, thumbnail_path, NULL as duration_id FROM quick_capture_images WHERE id IN',
      image_child_ocr:         'SELECT id, file_path, thumbnail_path, NULL as duration_id FROM image_children WHERE id IN',
    };

    for (const [type, ids] of typeToIds) {
      const baseQuery = extraQueries[type];
      if (!baseQuery) continue;
      const ph = ids.map(() => '?').join(',');
      const rows = db.prepare(`${baseQuery} (${ph})`).all(...ids) as any[];
      const map = new Map<number, any>();
      for (const row of rows) map.set(row.id, row);
      extraByType.set(type, map);
    }

    // Step 5: Assemble final results
    return matches.map(m => {
      let topic_id: number | null = null;
      let topic_name: string | null = null;
      let recording_id: number | null = null;
      let recording_name: string | null = null;

      if (m.content_type === 'topic') {
        const ctx = topicContextMap.get(m.source_id);
        topic_id = ctx?.topic_id ?? null;
        topic_name = ctx?.topic_name ?? null;
      } else if (m.parent_id > 0) {
        const ctx = recordingContextMap.get(m.parent_id);
        topic_id = ctx?.topic_id ?? null;
        topic_name = ctx?.topic_name ?? null;
        recording_id = m.parent_id;
        recording_name = ctx?.recording_name ?? null;
      }

      const extra = extraByType.get(m.content_type)?.get(m.source_id);

      return {
        content_type: m.content_type,
        source_id: m.source_id,
        parent_id: m.parent_id,
        snippet: m.snippet,
        rank: m.rank,
        topic_id,
        topic_name,
        recording_id,
        recording_name,
        duration_id: extra?.duration_id ?? null,
        file_path: extra?.file_path ?? null,
        thumbnail_path: extra?.thumbnail_path ?? null,
        marker_type: extra?.marker_type ?? null,
        language: extra?.language ?? null,
        code: extra?.code ?? null,
      } as GlobalSearchResult;
    });
  },
};

// Queries to get recording_id (parent_id) directly from source tables.
// This bypasses search_index so items without captions are still found.
const PARENT_ID_QUERIES: Record<string, string> = {
  image:                  'SELECT id as source_id, recording_id as parent_id, file_path, thumbnail_path, NULL as duration_id, caption, NULL as language, NULL as code, NULL as marker_type FROM images WHERE id IN',
  video:                  'SELECT id as source_id, recording_id as parent_id, file_path, thumbnail_path, NULL as duration_id, NULL as caption, NULL as language, NULL as code, NULL as marker_type FROM videos WHERE id IN',
  audio:                  'SELECT id as source_id, recording_id as parent_id, file_path, NULL as thumbnail_path, NULL as duration_id, NULL as caption, NULL as language, NULL as code, NULL as marker_type FROM audios WHERE id IN',
  duration_image:         'SELECT di.id as source_id, d.recording_id as parent_id, di.file_path, di.thumbnail_path, di.duration_id, di.caption, NULL as language, NULL as code, NULL as marker_type FROM duration_images di JOIN durations d ON d.id = di.duration_id WHERE di.id IN',
  duration_video:         'SELECT dv.id as source_id, d.recording_id as parent_id, dv.file_path, dv.thumbnail_path, dv.duration_id, NULL as caption, NULL as language, NULL as code, NULL as marker_type FROM duration_videos dv JOIN durations d ON d.id = dv.duration_id WHERE dv.id IN',
  duration_audio:         'SELECT da.id as source_id, d.recording_id as parent_id, da.file_path, NULL as thumbnail_path, da.duration_id, NULL as caption, NULL as language, NULL as code, NULL as marker_type FROM duration_audios da JOIN durations d ON d.id = da.duration_id WHERE da.id IN',
  duration:               'SELECT id as source_id, recording_id as parent_id, NULL as file_path, NULL as thumbnail_path, NULL as duration_id, NULL as caption, NULL as language, NULL as code, NULL as marker_type FROM durations WHERE id IN',
  recording:              'SELECT id as source_id, id as parent_id, NULL as file_path, NULL as thumbnail_path, NULL as duration_id, NULL as caption, NULL as language, NULL as code, NULL as marker_type FROM recordings WHERE id IN',
  topic:                  'SELECT id as source_id, 0 as parent_id, NULL as file_path, NULL as thumbnail_path, NULL as duration_id, NULL as caption, NULL as language, NULL as code, NULL as marker_type FROM topics WHERE id IN',
  code_snippet:           'SELECT id as source_id, recording_id as parent_id, NULL as file_path, NULL as thumbnail_path, NULL as duration_id, NULL as caption, language, code, NULL as marker_type FROM code_snippets WHERE id IN',
  duration_code_snippet:  'SELECT dcs.id as source_id, d.recording_id as parent_id, NULL as file_path, NULL as thumbnail_path, dcs.duration_id, NULL as caption, dcs.language, dcs.code, NULL as marker_type FROM duration_code_snippets dcs JOIN durations d ON d.id = dcs.duration_id WHERE dcs.id IN',
  audio_marker:           'SELECT am.id as source_id, a.recording_id as parent_id, NULL as file_path, NULL as thumbnail_path, NULL as duration_id, NULL as caption, NULL as language, NULL as code, am.marker_type FROM audio_markers am JOIN audios a ON a.id = am.audio_id WHERE am.id IN',
  duration_image_audio:   'SELECT dia.id as source_id, d.recording_id as parent_id, dia.file_path, NULL as thumbnail_path, di.duration_id, NULL as caption, NULL as language, NULL as code, NULL as marker_type FROM duration_image_audios dia JOIN duration_images di ON di.id = dia.duration_image_id JOIN durations d ON d.id = di.duration_id WHERE dia.id IN',
  image_audio:            'SELECT ia.id as source_id, i.recording_id as parent_id, ia.file_path, NULL as thumbnail_path, NULL as duration_id, NULL as caption, NULL as language, NULL as code, NULL as marker_type FROM image_audios ia JOIN images i ON i.id = ia.image_id WHERE ia.id IN',
  quick_capture_image:    'SELECT id as source_id, NULL as parent_id, file_path, thumbnail_path, NULL as duration_id, caption, NULL as language, NULL as code, NULL as marker_type FROM quick_capture_images WHERE id IN',
  image_child:            'SELECT id as source_id, NULL as parent_id, file_path, thumbnail_path, NULL as duration_id, caption, NULL as language, NULL as code, NULL as marker_type FROM image_children WHERE id IN',
  image_ocr:              'SELECT id as source_id, recording_id as parent_id, file_path, thumbnail_path, NULL as duration_id, caption, NULL as language, NULL as code, NULL as marker_type FROM images WHERE id IN',
  duration_image_ocr:     'SELECT di.id as source_id, d.recording_id as parent_id, di.file_path, di.thumbnail_path, di.duration_id, di.caption, NULL as language, NULL as code, NULL as marker_type FROM duration_images di JOIN durations d ON d.id = di.duration_id WHERE di.id IN',
  quick_capture_image_ocr:'SELECT id as source_id, NULL as parent_id, file_path, thumbnail_path, NULL as duration_id, caption, NULL as language, NULL as code, NULL as marker_type FROM quick_capture_images WHERE id IN',
  image_child_ocr:        'SELECT id as source_id, NULL as parent_id, file_path, thumbnail_path, NULL as duration_id, caption, NULL as language, NULL as code, NULL as marker_type FROM image_children WHERE id IN',
};

export const FilteredSearchOperations = {
  search(params: { conditions: { id: string; type: 'text' | 'tag' | 'color'; value: string }[]; op: 'AND' | 'OR'; limit?: number }): GlobalSearchResult[] {
    const { conditions, op, limit = 200 } = params;
    if (!conditions.length) return [];

    const db = getDatabase();

    // Build a Set<"content_type:source_id"> per condition
    const perConditionSets: Set<string>[] = [];
    const textResultsMap = new Map<string, GlobalSearchResult>();

    for (const cond of conditions) {
      const s = new Set<string>();
      if (cond.type === 'text' && cond.value.trim()) {
        const rows = SearchOperations.search(cond.value, limit);
        for (const r of rows) {
          const k = `${r.content_type}:${r.source_id}`;
          s.add(k);
          if (!textResultsMap.has(k)) textResultsMap.set(k, r);
        }
      } else if (cond.type === 'tag' && cond.value.trim()) {
        const rows = db.prepare(
          `SELECT mt.media_type, mt.media_id FROM media_tags mt
           JOIN tags t ON t.id = mt.tag_id WHERE t.name = ?`
        ).all(cond.value) as { media_type: string; media_id: number }[];
        for (const r of rows) s.add(`${r.media_type}:${r.media_id}`);
      } else if (cond.type === 'color' && cond.value.trim()) {
        const rows = db.prepare(
          `SELECT media_type, media_id FROM media_color_assignments WHERE color_key = ?`
        ).all(cond.value) as { media_type: string; media_id: number }[];
        for (const r of rows) s.add(`${r.media_type}:${r.media_id}`);
      }
      if (s.size > 0) perConditionSets.push(s);
    }

    if (!perConditionSets.length) return [];

    // AND = intersection, OR = union
    let matchKeys: Set<string>;
    if (op === 'AND') {
      matchKeys = new Set(perConditionSets[0]);
      for (let i = 1; i < perConditionSets.length; i++) {
        for (const k of matchKeys) {
          if (!perConditionSets[i].has(k)) matchKeys.delete(k);
        }
      }
    } else {
      matchKeys = new Set<string>();
      for (const s of perConditionSets) for (const k of s) matchKeys.add(k);
    }

    if (!matchKeys.size) return [];

    // Partition: already enriched by text search vs needs direct table lookup
    const results: GlobalSearchResult[] = [];
    const byType = new Map<string, number[]>();

    for (const key of matchKeys) {
      if (textResultsMap.has(key)) {
        results.push(textResultsMap.get(key)!);
      } else {
        const [content_type, idStr] = key.split(':');
        if (!byType.has(content_type)) byType.set(content_type, []);
        byType.get(content_type)!.push(parseInt(idStr, 10));
      }
    }

    if (!byType.size) return results;

    // Query source tables directly — no reliance on search_index
    // so items without captions (not indexed) are still returned.
    const rawRows: Array<{ content_type: string; source_id: number; parent_id: number | null; file_path: string | null; thumbnail_path: string | null; duration_id: number | null; caption: string | null; language: string | null; code: string | null; marker_type: string | null }> = [];

    for (const [ct, ids] of byType) {
      const sql = PARENT_ID_QUERIES[ct];
      if (!sql) continue;
      const ph = ids.map(() => '?').join(',');
      const rows = db.prepare(`${sql} (${ph})`).all(...ids) as any[];
      for (const row of rows) rawRows.push({ content_type: ct, ...row });
    }

    if (!rawRows.length) return results;

    // Batch recording context
    const recIds = new Set<number>();
    const topicIds = new Set<number>();
    for (const r of rawRows) {
      if (r.content_type === 'topic') topicIds.add(r.source_id);
      else if (r.parent_id) recIds.add(r.parent_id);
    }

    const recCtxMap = new Map<number, { recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }>();
    if (recIds.size > 0) {
      const ids = Array.from(recIds);
      const ph = ids.map(() => '?').join(',');
      const rows = db.prepare(
        `SELECT r.id as recording_id, r.name as recording_name, t.id as topic_id, t.name as topic_name
         FROM recordings r JOIN topics t ON t.id = r.topic_id WHERE r.id IN (${ph})`
      ).all(...ids) as any[];
      for (const row of rows) recCtxMap.set(row.recording_id, row);
    }
    const topicCtxMap = new Map<number, { topic_id: number; topic_name: string }>();
    if (topicIds.size > 0) {
      const ids = Array.from(topicIds);
      const ph = ids.map(() => '?').join(',');
      const rows = db.prepare(`SELECT id as topic_id, name as topic_name FROM topics WHERE id IN (${ph})`).all(...ids) as any[];
      for (const row of rows) topicCtxMap.set(row.topic_id, row);
    }

    for (const row of rawRows) {
      let topic_id: number | null = null;
      let topic_name: string | null = null;
      let recording_id: number | null = null;
      let recording_name: string | null = null;

      if (row.content_type === 'topic') {
        const ctx = topicCtxMap.get(row.source_id);
        topic_id = ctx?.topic_id ?? null;
        topic_name = ctx?.topic_name ?? null;
      } else if (row.parent_id) {
        const ctx = recCtxMap.get(row.parent_id);
        topic_id = ctx?.topic_id ?? null;
        topic_name = ctx?.topic_name ?? null;
        recording_id = row.parent_id;
        recording_name = ctx?.recording_name ?? null;
      }

      results.push({
        content_type: row.content_type,
        source_id: row.source_id,
        parent_id: row.parent_id ?? 0,
        snippet: row.caption ?? '',
        rank: 0,
        topic_id,
        topic_name,
        recording_id,
        recording_name,
        duration_id: row.duration_id ?? null,
        file_path: row.file_path ?? null,
        thumbnail_path: row.thumbnail_path ?? null,
        marker_type: row.marker_type ?? null,
        language: row.language ?? null,
        code: row.code ?? null,
      } as GlobalSearchResult);
    }

    // Text results first (by rank), then tag/color results
    results.sort((a, b) => {
      const aIsText = textResultsMap.has(`${a.content_type}:${a.source_id}`);
      const bIsText = textResultsMap.has(`${b.content_type}:${b.source_id}`);
      if (aIsText && !bIsText) return -1;
      if (!aIsText && bIsText) return 1;
      if (aIsText && bIsText) return a.rank - b.rank;
      return 0;
    });

    return results;
  },
};

// ============ Tags Operations ============

export const TagOperations = {
  getAllWithCounts(): Tag[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT t.id, t.name, t.created_at, t.last_searched_at,
             COUNT(mt.id)       AS usage_count,
             MAX(mt.created_at) AS last_assigned_at
      FROM tags t
      LEFT JOIN media_tags mt ON mt.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.name
    `).all() as Tag[];
  },

  search(query: string): Tag[] {
    const db = getDatabase();
    if (!query) {
      return db.prepare(`
        SELECT t.id, t.name, t.created_at,
               COUNT(mt.id) as usage_count,
               MAX(mt.created_at) AS last_assigned_at
        FROM tags t
        LEFT JOIN media_tags mt ON mt.tag_id = t.id
        GROUP BY t.id
        ORDER BY usage_count DESC, last_assigned_at DESC
        LIMIT 50
      `).all() as Tag[];
    }
    return db.prepare(`
      SELECT t.id, t.name, t.created_at,
             COUNT(mt.id) as usage_count,
             MAX(mt.created_at) AS last_assigned_at
      FROM tags t
      LEFT JOIN media_tags mt ON mt.tag_id = t.id
      WHERE t.name LIKE ?
      GROUP BY t.id
      ORDER BY usage_count DESC, t.name
      LIMIT 15
    `).all(`%${query}%`) as Tag[];
  },

  getByMedia(mediaType: MediaTagType, mediaId: number): Tag[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT t.id, t.name, t.created_at, 0 as usage_count
      FROM tags t
      INNER JOIN media_tags mt ON mt.tag_id = t.id
      WHERE mt.media_type = ? AND mt.media_id = ?
      ORDER BY t.name
    `).all(mediaType, mediaId) as Tag[];
  },

  getMediaByTag(mediaType: MediaTagType, tagName: string): { media_id: number }[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT mt.media_id
      FROM media_tags mt
      INNER JOIN tags t ON t.id = mt.tag_id
      WHERE mt.media_type = ? AND t.name = ?
    `).all(mediaType, tagName) as { media_id: number }[];
  },

  setForMedia(mediaType: MediaTagType, mediaId: number, tagNames: string[]): void {
    const db = getDatabase();
    db.transaction(() => {
      // Delete existing associations for this item
      db.prepare(`DELETE FROM media_tags WHERE media_type = ? AND media_id = ?`)
        .run(mediaType, mediaId);

      for (const name of tagNames) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        // Insert tag if not exists
        db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(trimmed);
        const tag = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(trimmed) as { id: number };
        // Insert association
        db.prepare(`INSERT OR IGNORE INTO media_tags (tag_id, media_type, media_id) VALUES (?, ?, ?)`)
          .run(tag.id, mediaType, mediaId);
      }
    })();
  },

  rename(oldName: string, newName: string): void {
    const db = getDatabase();
    db.prepare(`UPDATE tags SET name = ? WHERE name = ?`).run(newName.trim(), oldName);
  },

  delete(tagId: number): void {
    const db = getDatabase();
    // media_tags cascade deletes automatically
    db.prepare(`DELETE FROM tags WHERE id = ?`).run(tagId);
  },

  recordSearch(tagId: number): void {
    const db = getDatabase();
    db.prepare(`UPDATE tags SET last_searched_at = CURRENT_TIMESTAMP WHERE id = ?`).run(tagId);
  },

  getItemsByTag(tagName: string): {
    images: { id: number; file_path: string; thumbnail_path: string | null; caption: string | null; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];
    duration_images: { id: number; file_path: string; thumbnail_path: string | null; caption: string | null; duration_id: number; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];
    audios: { id: number; file_path: string; caption: string | null; duration: number | null; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];
    duration_audios: { id: number; file_path: string; caption: string | null; duration: number | null; duration_id: number; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];
    image_children: { id: number; file_path: string; thumbnail_path: string | null; caption: string | null; parent_type: string; parent_id: number; recording_id: number | null; recording_name: string | null; topic_name: string | null }[];
  } {
    const db = getDatabase();

    const images = db.prepare(`
      SELECT i.id, i.file_path, i.thumbnail_path, i.caption, i.recording_id,
             r.name as recording_name, r.topic_id,
             t.name as topic_name
      FROM images i
      JOIN media_tags mt ON mt.media_type = 'image' AND mt.media_id = i.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      JOIN recordings r ON r.id = i.recording_id
      JOIN topics t ON t.id = r.topic_id
      ORDER BY t.name, r.name, i.sort_order
    `).all(tagName) as { id: number; file_path: string; thumbnail_path: string | null; caption: string | null; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];

    const duration_images = db.prepare(`
      SELECT di.id, di.file_path, di.thumbnail_path, di.caption, di.duration_id,
             d.recording_id,
             r.name as recording_name, r.topic_id,
             t.name as topic_name
      FROM duration_images di
      JOIN media_tags mt ON mt.media_type = 'duration_image' AND mt.media_id = di.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      JOIN durations d ON d.id = di.duration_id
      JOIN recordings r ON r.id = d.recording_id
      JOIN topics t ON t.id = r.topic_id
      ORDER BY t.name, r.name, di.sort_order
    `).all(tagName) as { id: number; file_path: string; thumbnail_path: string | null; caption: string | null; duration_id: number; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];

    const audios = db.prepare(`
      SELECT a.id, a.file_path, a.caption, a.duration, a.recording_id,
             r.name as recording_name, r.topic_id,
             t.name as topic_name
      FROM audios a
      JOIN media_tags mt ON mt.media_type = 'audio' AND mt.media_id = a.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      JOIN recordings r ON r.id = a.recording_id
      JOIN topics t ON t.id = r.topic_id
      ORDER BY t.name, r.name, a.sort_order
    `).all(tagName) as { id: number; file_path: string; caption: string | null; duration: number | null; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];

    const duration_audios = db.prepare(`
      SELECT da.id, da.file_path, da.caption, da.duration, da.duration_id,
             d.recording_id,
             r.name as recording_name, r.topic_id,
             t.name as topic_name
      FROM duration_audios da
      JOIN media_tags mt ON mt.media_type = 'duration_audio' AND mt.media_id = da.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      JOIN durations d ON d.id = da.duration_id
      JOIN recordings r ON r.id = d.recording_id
      JOIN topics t ON t.id = r.topic_id
      ORDER BY t.name, r.name, da.sort_order
    `).all(tagName) as { id: number; file_path: string; caption: string | null; duration: number | null; duration_id: number; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];

    const capture_images = db.prepare(`
      SELECT qci.id, qci.capture_id, qci.file_path, qci.thumbnail_path, qci.caption
      FROM quick_capture_images qci
      JOIN media_tags mt ON mt.media_type = 'quick_capture_image' AND mt.media_id = qci.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      ORDER BY qci.sort_order
    `).all(tagName) as { id: number; capture_id: number; file_path: string; thumbnail_path: string | null; caption: string | null }[];

    const image_children = db.prepare(`
      SELECT ic.id, ic.file_path, ic.thumbnail_path, ic.caption,
             ic.parent_type, ic.parent_id,
             COALESCE(r1.id, r2.id) as recording_id,
             COALESCE(r1.name, r2.name) as recording_name,
             COALESCE(t1.name, t2.name) as topic_name
      FROM image_children ic
      JOIN media_tags mt ON mt.media_type = 'image_child' AND mt.media_id = ic.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      LEFT JOIN images img ON ic.parent_type = 'image' AND img.id = ic.parent_id
      LEFT JOIN recordings r1 ON r1.id = img.recording_id
      LEFT JOIN topics t1 ON t1.id = r1.topic_id
      LEFT JOIN duration_images di ON ic.parent_type = 'duration_image' AND di.id = ic.parent_id
      LEFT JOIN durations dur ON dur.id = di.duration_id
      LEFT JOIN recordings r2 ON r2.id = dur.recording_id
      LEFT JOIN topics t2 ON t2.id = r2.topic_id
      ORDER BY ic.sort_order, ic.created_at
    `).all(tagName) as { id: number; file_path: string; thumbnail_path: string | null; caption: string | null; parent_type: string; parent_id: number; recording_id: number | null; recording_name: string | null; topic_name: string | null }[];

    return { images, duration_images, audios, duration_audios, capture_images, image_children };
  },
};

// Quick Capture Operations
export const QuickCaptureOperations = {
  create(note: string, tags: string[]): { id: number } {
    const db = getDatabase();
    const result = db.prepare(
      `INSERT INTO quick_captures (note, tags) VALUES (?, ?)`
    ).run(note || null, JSON.stringify(tags));
    return { id: result.lastInsertRowid as number };
  },

  /** Reuse the most recent capture (within 7 days) so all saves land in one package. */
  getOrCreate(note: string, tags: string[]): { id: number } {
    const db = getDatabase();
    const existing = db.prepare(
      `SELECT id, note, tags FROM quick_captures WHERE created_at >= datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 1`
    ).get() as { id: number; note: string | null; tags: string } | undefined;

    if (existing) {
      // Append note (newline-separated) if provided
      if (note) {
        const newNote = existing.note ? `${existing.note}\n${note}` : note;
        db.prepare('UPDATE quick_captures SET note = ? WHERE id = ?').run(newNote, existing.id);
      }
      // Merge tags (deduplicated)
      if (tags.length > 0) {
        const existingTags = (() => { try { return JSON.parse(existing.tags) as string[]; } catch { return []; } })();
        const merged = [...new Set([...existingTags, ...tags])];
        db.prepare('UPDATE quick_captures SET tags = ? WHERE id = ?').run(JSON.stringify(merged), existing.id);
      }
      return { id: existing.id };
    }

    const result = db.prepare('INSERT INTO quick_captures (note, tags) VALUES (?, ?)').run(note || null, JSON.stringify(tags));
    return { id: result.lastInsertRowid as number };
  },

  getRecent(): import('../../src/types').QuickCapture[] {
    const db = getDatabase();
    const rows = db.prepare(
      `SELECT * FROM quick_captures WHERE created_at >= datetime('now', '-7 days') ORDER BY created_at DESC`
    ).all() as { id: number; note: string | null; tags: string; created_at: string }[];

    return rows.map(row => {
      const images = db.prepare(
        `SELECT * FROM quick_capture_images WHERE capture_id = ? ORDER BY sort_order ASC`
      ).all(row.id) as import('../../src/types').QuickCaptureImage[];

      const audios = db.prepare(
        `SELECT * FROM quick_capture_audios WHERE capture_id = ? ORDER BY sort_order ASC`
      ).all(row.id) as import('../../src/types').QuickCaptureAudio[];

      return {
        id: row.id,
        note: row.note,
        tags: (() => { try { return JSON.parse(row.tags); } catch { return []; } })(),
        created_at: row.created_at,
        images,
        audios,
      };
    });
  },

  addImage(captureId: number, filePath: string, thumbnailPath: string | null): import('../../src/types').QuickCaptureImage {
    const db = getDatabase();
    const sortOrder = (db.prepare(
      `SELECT COUNT(*) as cnt FROM quick_capture_images WHERE capture_id = ?`
    ).get(captureId) as { cnt: number }).cnt;

    const result = db.prepare(
      `INSERT INTO quick_capture_images (capture_id, file_path, thumbnail_path, sort_order) VALUES (?, ?, ?, ?)`
    ).run(captureId, filePath, thumbnailPath, sortOrder);

    return db.prepare(`SELECT * FROM quick_capture_images WHERE id = ?`).get(result.lastInsertRowid) as import('../../src/types').QuickCaptureImage;
  },

  addAudio(captureId: number, filePath: string): import('../../src/types').QuickCaptureAudio {
    const db = getDatabase();
    const sortOrder = (db.prepare(
      `SELECT COUNT(*) as cnt FROM quick_capture_audios WHERE capture_id = ?`
    ).get(captureId) as { cnt: number }).cnt;

    const result = db.prepare(
      `INSERT INTO quick_capture_audios (capture_id, file_path, sort_order) VALUES (?, ?, ?)`
    ).run(captureId, filePath, sortOrder);

    return db.prepare(`SELECT * FROM quick_capture_audios WHERE id = ?`).get(result.lastInsertRowid) as import('../../src/types').QuickCaptureAudio;
  },

  delete(id: number): { imagePaths: string[]; audioPaths: string[] } {
    const db = getDatabase();
    const images = db.prepare(`SELECT file_path FROM quick_capture_images WHERE capture_id = ?`).all(id) as { file_path: string }[];
    const audios = db.prepare(`SELECT file_path FROM quick_capture_audios WHERE capture_id = ?`).all(id) as { file_path: string }[];
    db.prepare(`DELETE FROM quick_captures WHERE id = ?`).run(id);
    return {
      imagePaths: images.map(r => r.file_path),
      audioPaths: audios.map(r => r.file_path),
    };
  },

  updateTags(id: number, tags: string[]): void {
    const db = getDatabase();
    db.prepare(`UPDATE quick_captures SET tags = ? WHERE id = ?`).run(JSON.stringify(tags), id);
  },

  reorderImages(captureId: number, imageIds: number[]): void {
    const db = getDatabase();
    const update = db.prepare('UPDATE quick_capture_images SET sort_order = ? WHERE id = ? AND capture_id = ?');
    const tx = db.transaction(() => {
      imageIds.forEach((id, idx) => update.run(idx, id, captureId));
    });
    tx();
  },

  deleteImage(imageId: number): { filePath: string; thumbnailPath: string | null } {
    const db = getDatabase();
    const row = db.prepare('SELECT file_path, thumbnail_path FROM quick_capture_images WHERE id = ?').get(imageId) as
      { file_path: string; thumbnail_path: string | null } | undefined;
    if (!row) return { filePath: '', thumbnailPath: null };
    db.prepare('DELETE FROM quick_capture_images WHERE id = ?').run(imageId);
    return { filePath: row.file_path, thumbnailPath: row.thumbnail_path };
  },

  getImageById(imageId: number): import('../../src/types').QuickCaptureImage | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM quick_capture_images WHERE id = ?').get(imageId) as import('../../src/types').QuickCaptureImage ?? null;
  },

  updateImageCaption(imageId: number, caption: string | null): import('../../src/types').QuickCaptureImage {
    const db = getDatabase();
    db.prepare('UPDATE quick_capture_images SET caption = ? WHERE id = ?').run(caption, imageId);
    return db.prepare('SELECT * FROM quick_capture_images WHERE id = ?').get(imageId) as import('../../src/types').QuickCaptureImage;
  },

  updateImageCaption2(imageId: number, caption2: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE quick_capture_images SET caption2 = ? WHERE id = ?').run(caption2, imageId);
  },

  updateImageFilePaths(imageId: number, filePath: string, thumbnailPath: string | null): import('../../src/types').QuickCaptureImage {
    const db = getDatabase();
    db.prepare('UPDATE quick_capture_images SET file_path = ?, thumbnail_path = ? WHERE id = ?').run(filePath, thumbnailPath, imageId);
    return db.prepare('SELECT * FROM quick_capture_images WHERE id = ?').get(imageId) as import('../../src/types').QuickCaptureImage;
  },

  deleteAudio(audioId: number): { filePath: string } {
    const db = getDatabase();
    const row = db.prepare('SELECT file_path FROM quick_capture_audios WHERE id = ?').get(audioId) as
      { file_path: string } | undefined;
    if (!row) return { filePath: '' };
    db.prepare('DELETE FROM quick_capture_audios WHERE id = ?').run(audioId);
    return { filePath: row.file_path };
  },

  updateAudioCaption(audioId: number, caption: string | null): import('../../src/types').QuickCaptureAudio {
    const db = getDatabase();
    db.prepare('UPDATE quick_capture_audios SET caption = ? WHERE id = ?').run(caption, audioId);
    return db.prepare('SELECT * FROM quick_capture_audios WHERE id = ?').get(audioId) as import('../../src/types').QuickCaptureAudio;
  },

  getExpired(): { id: number; imagePaths: string[]; audioPaths: string[] }[] {
    const db = getDatabase();
    const rows = db.prepare(`SELECT id FROM quick_captures WHERE created_at < datetime('now', '-7 days')`).all() as { id: number }[];
    return rows.map(row => {
      const images = db.prepare(`SELECT file_path FROM quick_capture_images WHERE capture_id = ?`).all(row.id) as { file_path: string }[];
      const audios = db.prepare(`SELECT file_path FROM quick_capture_audios WHERE capture_id = ?`).all(row.id) as { file_path: string }[];
      db.prepare(`DELETE FROM quick_captures WHERE id = ?`).run(row.id);
      return {
        id: row.id,
        imagePaths: images.map(r => r.file_path),
        audioPaths: audios.map(r => r.file_path),
      };
    });
  },
};

// Image Children Operations (images nested inside parent images)
export const ImageChildrenOperations = {
  getByParent(parentType: string, parentId: number) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM image_children
      WHERE parent_type = ? AND parent_id = ?
      ORDER BY sort_order, created_at
    `).all(parentType, parentId);
  },

  getById(id: number) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM image_children WHERE id = ?').get(id) ?? null;
  },

  create(data: { parent_type: string; parent_id: number; file_path: string; thumbnail_path?: string | null; caption?: string | null; sort_order?: number }) {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO image_children (parent_type, parent_id, file_path, thumbnail_path, caption, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.parent_type,
      data.parent_id,
      data.file_path,
      data.thumbnail_path ?? null,
      data.caption ?? null,
      data.sort_order ?? 0
    );
    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM image_children WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null) {
    const db = getDatabase();
    db.prepare('UPDATE image_children SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateCaption2(id: number, caption2: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE image_children SET caption2 = ? WHERE id = ?').run(caption2, id);
  },

  updateFilePaths(id: number, filePath: string, thumbnailPath: string | null) {
    const db = getDatabase();
    db.prepare('UPDATE image_children SET file_path = ?, thumbnail_path = ? WHERE id = ?').run(filePath, thumbnailPath, id);
    return this.getById(id)!;
  },

  reorder(parentType: string, parentId: number, orderedIds: number[]): void {
    const db = getDatabase();
    const update = db.prepare('UPDATE image_children SET sort_order = ? WHERE id = ?');
    const tx = db.transaction(() => {
      orderedIds.forEach((id, index) => update.run(index, id));
    });
    tx();
  },

  getMaxSortOrder(parentType: string, parentId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM image_children WHERE parent_type = ? AND parent_id = ?
    `).get(parentType, parentId) as { max_order: number };
    return result.max_order;
  },
};

// Image Child Audio Operations (audios attached to child images)
export const ImageChildAudiosOperations = {
  getByChild(imageChildId: number) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM image_child_audios
      WHERE image_child_id = ?
      ORDER BY sort_order, created_at
    `).all(imageChildId);
  },

  getById(id: number) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM image_child_audios WHERE id = ?').get(id) ?? null;
  },

  create(data: { image_child_id: number; file_path: string; caption?: string | null; duration?: number | null; sort_order?: number }) {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO image_child_audios (image_child_id, file_path, caption, duration, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.image_child_id,
      data.file_path,
      data.caption ?? null,
      data.duration ?? null,
      data.sort_order ?? 0
    );
    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM image_child_audios WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null) {
    const db = getDatabase();
    db.prepare('UPDATE image_child_audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  getMaxSortOrder(imageChildId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM image_child_audios WHERE image_child_id = ?
    `).get(imageChildId) as { max_order: number };
    return result.max_order;
  },
};

export const ImageAnnotationsOperations = {
  getByImage(imageType: string, imageId: number) {
    const db = getDatabase();
    return db.prepare(
      'SELECT * FROM image_annotations WHERE image_type = ? AND image_id = ? ORDER BY created_at ASC'
    ).all(imageType, imageId) as ImageAnnotation[];
  },

  getById(id: number) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM image_annotations WHERE id = ?').get(id) as ImageAnnotation | null;
  },

  create(data: {
    image_type: string;
    image_id: number;
    ann_type: 'rect' | 'line';
    x1: number; y1: number; x2: number; y2: number;
    color: string;
    stroke_width: number;
  }) {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO image_annotations (image_type, image_id, ann_type, x1, y1, x2, y2, color, stroke_width)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.image_type, data.image_id, data.ann_type,
      data.x1, data.y1, data.x2, data.y2,
      data.color, data.stroke_width
    );
    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, partial: { x1?: number; y1?: number; x2?: number; y2?: number; color?: string; stroke_width?: number }) {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (partial.x1 !== undefined) { fields.push('x1 = ?'); values.push(partial.x1); }
    if (partial.y1 !== undefined) { fields.push('y1 = ?'); values.push(partial.y1); }
    if (partial.x2 !== undefined) { fields.push('x2 = ?'); values.push(partial.x2); }
    if (partial.y2 !== undefined) { fields.push('y2 = ?'); values.push(partial.y2); }
    if (partial.color !== undefined) { fields.push('color = ?'); values.push(partial.color); }
    if (partial.stroke_width !== undefined) { fields.push('stroke_width = ?'); values.push(partial.stroke_width); }
    if (fields.length === 0) return this.getById(id)!;
    values.push(id);
    db.prepare(`UPDATE image_annotations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM image_annotations WHERE id = ?').run(id);
  },

  deleteByImage(imageType: string, imageId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM image_annotations WHERE image_type = ? AND image_id = ?').run(imageType, imageId);
  },
};

export const MediaColorOperations = {
  /** Toggle a color on any media item. Returns the updated color list. */
  toggle(mediaType: string, mediaId: number, colorKey: string): string[] {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT OR IGNORE INTO media_color_assignments (media_type, media_id, color_key) VALUES (?, ?, ?)'
    ).run(mediaType, mediaId, colorKey);
    if (result.changes === 0) {
      // Already existed — remove it (toggle off)
      db.prepare(
        'DELETE FROM media_color_assignments WHERE media_type = ? AND media_id = ? AND color_key = ?'
      ).run(mediaType, mediaId, colorKey);
    }
    return this.getByMedia(mediaType, mediaId);
  },

  /** Get all color keys assigned to a media item. */
  getByMedia(mediaType: string, mediaId: number): string[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT color_key FROM media_color_assignments WHERE media_type = ? AND media_id = ? ORDER BY created_at ASC'
    ).all(mediaType, mediaId) as { color_key: string }[];
    return rows.map(r => r.color_key);
  },

  /** Batch-fetch colors for multiple media items of the same type. Returns a map of mediaId → colorKeys[]. */
  getBatch(mediaType: string, mediaIds: number[]): Record<number, string[]> {
    if (mediaIds.length === 0) return {};
    const db = getDatabase();
    const placeholders = mediaIds.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT media_id, color_key FROM media_color_assignments WHERE media_type = ? AND media_id IN (${placeholders}) ORDER BY created_at ASC`
    ).all(mediaType, ...mediaIds) as { media_id: number; color_key: string }[];
    const result: Record<number, string[]> = {};
    for (const id of mediaIds) result[id] = [];
    for (const row of rows) {
      result[row.media_id].push(row.color_key);
    }
    return result;
  },
};

// ─── Recording Plans ──────────────────────────────────────────────────────────

export const RecordingPlansOperations = {
  getByRecording(recordingId: number) {
    const db = getDatabase();
    return db.prepare(
      'SELECT * FROM recording_plans WHERE recording_id = ? ORDER BY plan_date, sort_order, created_at'
    ).all(recordingId);
  },

  getAll() {
    const db = getDatabase();
    return db.prepare(`
      SELECT rp.*, r.name AS recording_name, r.topic_id, t.name AS topic_name
      FROM recording_plans rp
      JOIN recordings r ON r.id = rp.recording_id
      JOIN topics t ON t.id = r.topic_id
      ORDER BY rp.plan_date, rp.sort_order
    `).all();
  },

  getById(id: number) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM recording_plans WHERE id = ?').get(id);
  },

  create(plan: { recording_id: number; plan_date: string; text: string; completed?: number; sort_order?: number }) {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO recording_plans (recording_id, plan_date, text, completed, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(plan.recording_id, plan.plan_date, plan.text, plan.completed ?? 0, plan.sort_order ?? 0);
    return this.getById(result.lastInsertRowid as number);
  },

  update(id: number, updates: { text?: string; completed?: number; sort_order?: number }) {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text); }
    if (updates.completed !== undefined) { fields.push('completed = ?'); values.push(updates.completed); }
    if (updates.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(updates.sort_order); }
    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE recording_plans SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.getById(id);
  },

  delete(id: number) {
    const db = getDatabase();
    db.prepare('DELETE FROM recording_plans WHERE id = ?').run(id);
  },
};

// ─── Duration Plans ───────────────────────────────────────────────────────────

export const DurationPlansOperations = {
  getByDuration(durationId: number) {
    const db = getDatabase();
    return db.prepare(
      'SELECT * FROM duration_plans WHERE duration_id = ? ORDER BY plan_date, sort_order, created_at'
    ).all(durationId);
  },

  getAll() {
    const db = getDatabase();
    return db.prepare(`
      SELECT dp.*, d.recording_id, r.name AS recording_name, r.topic_id, t.name AS topic_name,
             NULL AS duration_caption
      FROM duration_plans dp
      JOIN durations d ON d.id = dp.duration_id
      JOIN recordings r ON r.id = d.recording_id
      JOIN topics t ON t.id = r.topic_id
      ORDER BY dp.plan_date, dp.sort_order
    `).all();
  },

  getById(id: number) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_plans WHERE id = ?').get(id);
  },

  create(plan: { duration_id: number; plan_date: string; text: string; completed?: number; sort_order?: number }) {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO duration_plans (duration_id, plan_date, text, completed, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(plan.duration_id, plan.plan_date, plan.text, plan.completed ?? 0, plan.sort_order ?? 0);
    return this.getById(result.lastInsertRowid as number);
  },

  update(id: number, updates: { text?: string; completed?: number; sort_order?: number }) {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text); }
    if (updates.completed !== undefined) { fields.push('completed = ?'); values.push(updates.completed); }
    if (updates.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(updates.sort_order); }
    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE duration_plans SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.getById(id);
  },

  delete(id: number) {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_plans WHERE id = ?').run(id);
  },
};

// ─── Calendar Todos ───────────────────────────────────────────────────────────

export const CalendarTodosOperations = {
  getAll() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM calendar_todos ORDER BY plan_date, sort_order, created_at').all();
  },

  getById(id: number) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM calendar_todos WHERE id = ?').get(id);
  },

  create(todo: { plan_date: string; text: string }) {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO calendar_todos (plan_date, text, completed, sort_order) VALUES (?, ?, 0, 0)'
    ).run(todo.plan_date, todo.text);
    return this.getById(result.lastInsertRowid as number);
  },

  update(id: number, updates: { text?: string; completed?: number }) {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text); }
    if (updates.completed !== undefined) { fields.push('completed = ?'); values.push(updates.completed); }
    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE calendar_todos SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.getById(id);
  },

  delete(id: number) {
    const db = getDatabase();
    db.prepare('DELETE FROM calendar_todos WHERE id = ?').run(id);
  },
};

// ─── Study Tracking ──────────────────────────────────────────────────────────

export const StudyTrackingOperations = {
  createSession(startedAt: string): { id: number; started_at: string } {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO study_sessions (started_at, total_seconds) VALUES (?, 0)'
    ).run(startedAt);
    return { id: result.lastInsertRowid as number, started_at: startedAt };
  },

  endSession(id: number, endedAt: string, totalSeconds: number): void {
    const db = getDatabase();
    db.prepare(
      'UPDATE study_sessions SET ended_at = ?, total_seconds = ? WHERE id = ?'
    ).run(endedAt, totalSeconds, id);
  },

  createEvent(event: {
    session_id: number;
    event_type: string;
    topic_id?: number | null;
    topic_name?: string | null;
    recording_id?: number | null;
    recording_name?: string | null;
    duration_id?: number | null;
    duration_caption?: string | null;
    resource_id?: number | null;
    resource_type?: string | null;
    started_at: string;
    source?: string;
  }): number {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO study_events (
        session_id, event_type, topic_id, topic_name, recording_id, recording_name,
        duration_id, duration_caption, resource_id, resource_type, started_at, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.session_id,
      event.event_type,
      event.topic_id ?? null,
      event.topic_name ?? null,
      event.recording_id ?? null,
      event.recording_name ?? null,
      event.duration_id ?? null,
      event.duration_caption ?? null,
      event.resource_id ?? null,
      event.resource_type ?? null,
      event.started_at,
      event.source ?? 'direct',
    );
    return result.lastInsertRowid as number;
  },

  updateEvent(id: number, endedAt: string, seconds: number): void {
    const db = getDatabase();
    db.prepare(
      'UPDATE study_events SET ended_at = ?, seconds = ? WHERE id = ?'
    ).run(endedAt, seconds, id);
  },

  logIdle(log: {
    session_id: number;
    detected_at: string;
    idle_seconds: number;
    credited_seconds: number;
  }): void {
    const db = getDatabase();
    db.prepare(
      'INSERT INTO study_idle_logs (session_id, detected_at, idle_seconds, credited_seconds) VALUES (?, ?, ?, ?)'
    ).run(log.session_id, log.detected_at, log.idle_seconds, log.credited_seconds);
    // Adjust session total_seconds by credited - idle (add back credited portion)
    // The session ticker handles total_seconds, but we store idle logs for audit
  },

  getHeatmap(fromDate: string, toDate: string): { date: string; total_seconds: number }[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT
        substr(se.started_at, 1, 10) as date,
        SUM(se.seconds) as total_seconds
      FROM study_events se
      JOIN study_sessions ss ON ss.id = se.session_id
      WHERE substr(se.started_at, 1, 10) BETWEEN ? AND ?
        AND se.seconds > 0
        AND se.event_type IN ('view_mark', 'view_recording')
      GROUP BY substr(se.started_at, 1, 10)
      ORDER BY date
    `).all(fromDate, toDate) as { date: string; total_seconds: number }[];
  },

  getSessionsForDay(date: string): {
    id: number;
    started_at: string;
    ended_at: string | null;
    total_seconds: number;
    events: unknown[];
  }[] {
    const db = getDatabase();
    const sessions = db.prepare(`
      SELECT * FROM study_sessions
      WHERE substr(started_at, 1, 10) = ?
      ORDER BY started_at
    `).all(date) as { id: number; started_at: string; ended_at: string | null; total_seconds: number }[];

    return sessions.map(s => {
      const events = db.prepare(`
        SELECT * FROM study_events WHERE session_id = ? ORDER BY started_at
      `).all(s.id);
      return { ...s, events };
    });
  },

  getStats(fromDate: string, toDate: string): {
    byTopic: { topic_id: number; topic_name: string; total_seconds: number; session_count: number }[];
    byRecording: { recording_id: number; recording_name: string; topic_name: string; total_seconds: number; session_count: number; open_count: number }[];
    byMark: { duration_id: number; duration_caption: string; recording_name: string; topic_name: string; total_seconds: number; image_opens: number }[];
  } {
    const db = getDatabase();

    const byTopic = db.prepare(`
      SELECT
        topic_id,
        topic_name,
        SUM(seconds) as total_seconds,
        COUNT(DISTINCT session_id) as session_count
      FROM study_events
      WHERE substr(started_at, 1, 10) BETWEEN ? AND ?
        AND topic_id IS NOT NULL AND seconds > 0
        AND event_type IN ('view_mark', 'view_recording')
      GROUP BY topic_id
      ORDER BY total_seconds DESC
    `).all(fromDate, toDate) as { topic_id: number; topic_name: string; total_seconds: number; session_count: number }[];

    const byRecording = db.prepare(`
      SELECT
        recording_id,
        recording_name,
        topic_name,
        SUM(CASE WHEN event_type IN ('view_mark', 'view_recording') THEN seconds ELSE 0 END) as total_seconds,
        COUNT(DISTINCT session_id) as session_count,
        COUNT(CASE WHEN event_type = 'view_recording' THEN 1 END) as open_count
      FROM study_events
      WHERE substr(started_at, 1, 10) BETWEEN ? AND ?
        AND recording_id IS NOT NULL AND seconds > 0
      GROUP BY recording_id
      ORDER BY total_seconds DESC
    `).all(fromDate, toDate) as { recording_id: number; recording_name: string; topic_name: string; total_seconds: number; session_count: number; open_count: number }[];

    const byMark = db.prepare(`
      SELECT
        duration_id,
        MAX(duration_caption) as duration_caption,
        MAX(recording_name) as recording_name,
        MAX(topic_name) as topic_name,
        SUM(CASE WHEN event_type IN ('view_mark') THEN seconds ELSE 0 END) as total_seconds,
        COUNT(CASE WHEN event_type = 'view_image' THEN 1 END) as image_opens
      FROM study_events
      WHERE substr(started_at, 1, 10) BETWEEN ? AND ?
        AND duration_id IS NOT NULL
      GROUP BY duration_id
      ORDER BY total_seconds DESC
    `).all(fromDate, toDate) as { duration_id: number; duration_caption: string; recording_name: string; topic_name: string; total_seconds: number; image_opens: number }[];

    return { byTopic, byRecording, byMark };
  },
};

export const ObsStagedMarksOperations = {
  create(mark: { session_id: string; start_time: number; end_time: number; caption: string | null; sort_order: number }): { id: number; session_id: string; start_time: number; end_time: number; caption: string | null; sort_order: number; created_at: string } {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO obs_staged_marks (session_id, start_time, end_time, caption, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(mark.session_id, mark.start_time, mark.end_time, mark.caption, mark.sort_order);
    return db.prepare('SELECT * FROM obs_staged_marks WHERE id = ?').get(result.lastInsertRowid) as any;
  },

  getAll(): any[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM obs_staged_marks ORDER BY sort_order, start_time').all();
  },

  getBySession(sessionId: string): any[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM obs_staged_marks WHERE session_id = ? ORDER BY sort_order, start_time').all(sessionId);
  },

  count(): number {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as count FROM obs_staged_marks').get() as { count: number };
    return result.count;
  },

  deleteAll(): void {
    const db = getDatabase();
    db.prepare('DELETE FROM obs_staged_marks').run();
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM obs_staged_marks WHERE id = ?').run(id);
  },

  updateEndTime(id: number, endTime: number): void {
    const db = getDatabase();
    db.prepare('UPDATE obs_staged_marks SET end_time = ? WHERE id = ?').run(endTime, id);
  },

  updateCaption(id: number, caption: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE obs_staged_marks SET caption = ? WHERE id = ?').run(caption || null, id);
  },

  merge(keepId: number, deleteId: number, mergedCaption: string | null): void {
    const db = getDatabase();
    const keep = db.prepare('SELECT * FROM obs_staged_marks WHERE id = ?').get(keepId) as any;
    const del  = db.prepare('SELECT * FROM obs_staged_marks WHERE id = ?').get(deleteId) as any;
    if (!keep || !del) return;
    db.prepare(
      'UPDATE obs_staged_marks SET start_time = ?, end_time = ?, caption = ? WHERE id = ?'
    ).run(Math.min(keep.start_time, del.start_time), Math.max(keep.end_time, del.end_time), mergedCaption, keepId);
    db.prepare('DELETE FROM obs_staged_marks WHERE id = ?').run(deleteId);
  },
};

export const ObsGhostMarksOperations = {
  create(sessionId: string, startTime: number): any {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO obs_ghost_marks (session_id, start_time) VALUES (?, ?)'
    ).run(sessionId, startTime);
    return db.prepare('SELECT * FROM obs_ghost_marks WHERE id = ?').get(result.lastInsertRowid);
  },

  // Close the most recent open ghost mark for a session (end_time IS NULL).
  closeActive(sessionId: string, endTime: number): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE obs_ghost_marks SET end_time = ?
      WHERE id = (
        SELECT id FROM obs_ghost_marks
        WHERE session_id = ? AND end_time IS NULL
        ORDER BY id DESC LIMIT 1
      )
    `).run(endTime, sessionId);
  },

  getAll(): any[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM obs_ghost_marks ORDER BY start_time').all();
  },

  getBySession(sessionId: string): any[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM obs_ghost_marks WHERE session_id = ? ORDER BY start_time').all(sessionId);
  },

  count(): number {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as count FROM obs_ghost_marks').get() as { count: number };
    return result.count;
  },

  deleteAll(): void {
    const db = getDatabase();
    db.prepare('DELETE FROM obs_ghost_marks').run();
  },
};

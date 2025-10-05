import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import initSqlJs from 'sql.js';

export interface Book {
  id: string;
  title: string;
  chapter_order: string; // JSON array of chapter IDs
  created_at: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  part_id?: string | null;
  title?: string;
  text: string;
  word_count: number;
  created_at: string;
}

export interface BookPart {
  id: string;
  book_id: string;
  name: string;
  chapter_order: string; // JSON array of chapter IDs
  created_at: string;
  updated_at: string;
}

export interface ChapterSummary {
  id: string;
  chapter_id: string;
  summary: string | null;
  pov: string | null;
  characters: string | null; // JSON array as string
  beats: string | null; // JSON array as string
  spoilers_ok: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterReview {
  id: string;
  chapter_id: string;
  review_text: string;
  prompt_used: string | null;
  profile_id: number | null;
  profile_name: string | null;
  tone_key: string | null;
  created_at: string;
  updated_at: string;
}

export class AppDatabase {
  private db: any;
  private sqlite: SQLiteConnection | null = null;
  private isNative = Capacitor.isNativePlatform();

  async init() {
    if (this.isNative) {
      // Mobile: Use native SQLite
      this.sqlite = new SQLiteConnection(CapacitorSQLite);
      this.db = await this.sqlite.createConnection(
        'ai-beta-reader',
        false,
        'no-encryption',
        1,
        false
      );
      await this.db.open();
    } else {
      // Desktop/Web: Use sql.js (SQLite compiled to WebAssembly)
      const SQL = await initSqlJs({
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`
      });

      // Try to load existing database from localStorage
      const savedDb = localStorage.getItem('sqliteDb');
      if (savedDb) {
        const arr = new Uint8Array(JSON.parse(savedDb));
        this.db = new SQL.Database(arr);
      } else {
        this.db = new SQL.Database();
      }
    }

    await this.createTables();
    await this.runMigrations();
  }

  private async createTables() {
    const schema = `
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        chapter_order TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        part_id TEXT,
        title TEXT,
        text TEXT NOT NULL,
        word_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id),
        FOREIGN KEY (part_id) REFERENCES book_parts(id)
      );

      CREATE TABLE IF NOT EXISTS book_parts (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        name TEXT NOT NULL,
        chapter_order TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id)
      );

      CREATE TABLE IF NOT EXISTS chapter_summaries (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        summary TEXT,
        pov TEXT,
        characters TEXT,
        beats TEXT,
        spoilers_ok BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id)
      );

      CREATE TABLE IF NOT EXISTS wiki_pages (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        page_name TEXT NOT NULL,
        page_type TEXT,
        content TEXT,
        summary TEXT,
        aliases TEXT,
        tags TEXT,
        is_major BOOLEAN,
        created_by_ai BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id)
      );

      CREATE TABLE IF NOT EXISTS book_characters (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        wiki_page_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id),
        FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id)
      );

      CREATE TABLE IF NOT EXISTS chapter_reviews (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        review_text TEXT NOT NULL,
        prompt_used TEXT,
        profile_id INTEGER,
        profile_name TEXT,
        tone_key TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id)
      );

      CREATE TABLE IF NOT EXISTS custom_reviewer_profiles (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ai_profiles (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        tone_key TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        is_system BOOLEAN,
        is_default BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wiki_updates (
        id TEXT PRIMARY KEY,
        wiki_page_id TEXT NOT NULL,
        chapter_id TEXT,
        update_type TEXT,
        change_summary TEXT,
        contradiction_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id),
        FOREIGN KEY (chapter_id) REFERENCES chapters(id)
      );

      CREATE TABLE IF NOT EXISTS chapter_wiki_mentions (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        wiki_page_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id),
        FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id)
      );
    `;

    if (this.isNative) {
      await this.db.execute(schema);
    } else {
      this.db.run(schema);
      this.saveToLocalStorage();
    }
  }

  private async runMigrations() {
    // Add missing columns to existing tables
    const migrations = [
      // Add chapter_order to books if not exists
      `ALTER TABLE books ADD COLUMN chapter_order TEXT DEFAULT '[]'`,
      // Add part_id to chapters if not exists
      `ALTER TABLE chapters ADD COLUMN part_id TEXT`,
      // Add chapter_order to book_parts if not exists
      `ALTER TABLE book_parts ADD COLUMN chapter_order TEXT DEFAULT '[]'`
    ];

    for (const migration of migrations) {
      try {
        if (this.isNative) {
          await this.db.execute(migration);
        } else {
          this.db.run(migration);
        }
      } catch (e) {
        // Column already exists, ignore error
        // SQLite throws error if column exists, which is expected
      }
    }

    if (!this.isNative) {
      this.saveToLocalStorage();
    }
  }

  async saveBook(book: Book) {
    const query = `INSERT OR REPLACE INTO books (id, title, chapter_order, created_at) VALUES (?, ?, ?, ?)`;
    const chapterOrder = book.chapter_order || '[]';

    if (this.isNative) {
      await this.db.run(query, [book.id, book.title, chapterOrder, book.created_at]);
    } else {
      this.db.run(query, [book.id, book.title, chapterOrder, book.created_at]);
      this.saveToLocalStorage();
    }
  }

  async getBooks(): Promise<Book[]> {
    const query = `SELECT id, title, chapter_order, created_at FROM books ORDER BY created_at DESC`;

    if (this.isNative) {
      const result = await this.db.query(query);
      return result.values || [];
    } else {
      const result = this.db.exec(query);
      if (result.length === 0) return [];

      return result[0].values.map((row: any[]) => ({
        id: row[0],
        title: row[1],
        chapter_order: row[2],
        created_at: row[3]
      }));
    }
  }

  async saveChapter(chapter: Chapter) {
    const query = `INSERT OR REPLACE INTO chapters (id, book_id, part_id, title, text, word_count, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;

    if (this.isNative) {
      await this.db.run(query, [
        chapter.id,
        chapter.book_id,
        chapter.part_id || null,
        chapter.title,
        chapter.text,
        chapter.word_count,
        chapter.created_at
      ]);
    } else {
      this.db.run(query, [
        chapter.id,
        chapter.book_id,
        chapter.part_id || null,
        chapter.title,
        chapter.text,
        chapter.word_count,
        chapter.created_at
      ]);
      this.saveToLocalStorage();
    }

    // Add chapter to book's chapter_order if not already present
    await this.addChapterToBookOrder(chapter.book_id, chapter.id);
  }

  async getChapters(bookId: string): Promise<Chapter[]> {
    const query = `SELECT id, book_id, part_id, title, text, word_count, created_at
                   FROM chapters WHERE book_id = ? ORDER BY created_at`;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      return result.values || [];
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: any[]) => ({
        id: row[0],
        book_id: row[1],
        part_id: row[2],
        title: row[3],
        text: row[4],
        word_count: row[5],
        created_at: row[6]
      }));
    }
  }

  // Helper method to add chapter to book's chapter_order
  private async addChapterToBookOrder(bookId: string, chapterId: string) {
    // Get current chapter order
    const query = `SELECT chapter_order FROM books WHERE id = ?`;
    let currentOrder: string[] = [];

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      if (result.values && result.values[0]) {
        const orderStr = result.values[0].chapter_order || '[]';
        currentOrder = JSON.parse(orderStr);
      }
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length > 0 && result[0].values[0]) {
        const orderStr = result[0].values[0][0] || '[]';
        currentOrder = JSON.parse(orderStr as string);
      }
    }

    // Only add if not already present
    if (!currentOrder.includes(chapterId)) {
      currentOrder.push(chapterId);
      const updateQuery = `UPDATE books SET chapter_order = ? WHERE id = ?`;

      if (this.isNative) {
        await this.db.run(updateQuery, [JSON.stringify(currentOrder), bookId]);
      } else {
        this.db.run(updateQuery, [JSON.stringify(currentOrder), bookId]);
        this.saveToLocalStorage();
      }
    }
  }

  // Book Parts methods
  async createPart(part: { book_id: string; name: string }): Promise<BookPart> {
    const id = `part-${part.book_id}-${Date.now()}`;
    const now = new Date().toISOString();
    const query = `INSERT INTO book_parts (id, book_id, name, chapter_order, created_at, updated_at)
                   VALUES (?, ?, ?, '[]', ?, ?)`;

    if (this.isNative) {
      await this.db.run(query, [id, part.book_id, part.name, now, now]);
    } else {
      this.db.run(query, [id, part.book_id, part.name, now, now]);
      this.saveToLocalStorage();
    }

    return {
      id,
      book_id: part.book_id,
      name: part.name,
      chapter_order: '[]',
      created_at: now,
      updated_at: now
    };
  }

  async getParts(bookId: string): Promise<BookPart[]> {
    const query = `SELECT * FROM book_parts WHERE book_id = ? ORDER BY created_at`;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      return result.values || [];
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: any[]) => ({
        id: row[0],
        book_id: row[1],
        name: row[2],
        chapter_order: row[3],
        created_at: row[4],
        updated_at: row[5]
      }));
    }
  }

  async updatePart(partId: string, name: string) {
    const now = new Date().toISOString();
    const query = `UPDATE book_parts SET name = ?, updated_at = ? WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, [name, now, partId]);
    } else {
      this.db.run(query, [name, now, partId]);
      this.saveToLocalStorage();
    }
  }

  async deletePart(partId: string) {
    // Remove part reference from chapters
    const updateChaptersQuery = `UPDATE chapters SET part_id = NULL WHERE part_id = ?`;
    const deleteQuery = `DELETE FROM book_parts WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(updateChaptersQuery, [partId]);
      await this.db.run(deleteQuery, [partId]);
    } else {
      this.db.run(updateChaptersQuery, [partId]);
      this.db.run(deleteQuery, [partId]);
      this.saveToLocalStorage();
    }
  }

  async updateChapterOrders(bookId: string, chapterOrder: string[], partUpdates: Record<string, string[]>) {
    // Update book's chapter_order
    const updateBookQuery = `UPDATE books SET chapter_order = ? WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(updateBookQuery, [JSON.stringify(chapterOrder), bookId]);

      // Update each part's chapter_order and chapter part_id assignments
      for (const [partId, chapterIds] of Object.entries(partUpdates)) {
        if (partId === 'null') {
          // Remove part_id from these chapters
          for (const chapterId of chapterIds) {
            await this.db.run('UPDATE chapters SET part_id = NULL WHERE id = ?', [chapterId]);
          }
        } else {
          // Update part's chapter_order
          await this.db.run('UPDATE book_parts SET chapter_order = ? WHERE id = ?', [
            JSON.stringify(chapterIds),
            partId
          ]);
          // Assign chapters to this part
          for (const chapterId of chapterIds) {
            await this.db.run('UPDATE chapters SET part_id = ? WHERE id = ?', [partId, chapterId]);
          }
        }
      }
    } else {
      this.db.run(updateBookQuery, [JSON.stringify(chapterOrder), bookId]);

      // Update each part's chapter_order and chapter part_id assignments
      for (const [partId, chapterIds] of Object.entries(partUpdates)) {
        if (partId === 'null') {
          // Remove part_id from these chapters
          for (const chapterId of chapterIds) {
            this.db.run('UPDATE chapters SET part_id = NULL WHERE id = ?', [chapterId]);
          }
        } else {
          // Update part's chapter_order
          this.db.run('UPDATE book_parts SET chapter_order = ? WHERE id = ?', [
            JSON.stringify(chapterIds),
            partId
          ]);
          // Assign chapters to this part
          for (const chapterId of chapterIds) {
            this.db.run('UPDATE chapters SET part_id = ? WHERE id = ?', [partId, chapterId]);
          }
        }
      }

      this.saveToLocalStorage();
    }
  }

  async exportDatabase(): Promise<Uint8Array> {
    if (this.isNative) {
      const jsonExport = await this.db.exportToJson('ai-beta-reader');
      return new TextEncoder().encode(JSON.stringify(jsonExport));
    } else {
      // Export all tables as JSON
      const books = await this.getBooks();
      const allChapters: Chapter[] = [];

      for (const book of books) {
        const chapters = await this.getChapters(book.id);
        allChapters.push(...chapters);
      }

      // Get all data from other tables
      const getAllFromTable = (tableName: string) => {
        const result = this.db.exec(`SELECT * FROM ${tableName}`);
        return result.length > 0 ? result[0].values : [];
      };

      const exportData = {
        version: 2,
        books,
        chapters: allChapters,
        book_parts: getAllFromTable('book_parts'),
        chapter_summaries: getAllFromTable('chapter_summaries'),
        wiki_pages: getAllFromTable('wiki_pages'),
        book_characters: getAllFromTable('book_characters'),
        chapter_reviews: getAllFromTable('chapter_reviews'),
        custom_reviewer_profiles: getAllFromTable('custom_reviewer_profiles'),
        ai_profiles: getAllFromTable('ai_profiles'),
        wiki_updates: getAllFromTable('wiki_updates'),
        chapter_wiki_mentions: getAllFromTable('chapter_wiki_mentions')
      };

      return new TextEncoder().encode(JSON.stringify(exportData));
    }
  }

  async importDatabase(data: Uint8Array): Promise<void> {
    const jsonString = new TextDecoder().decode(data);
    const importData = JSON.parse(jsonString);

    if (this.isNative) {
      await this.db.importFromJson(importData);
    } else {
      // Clear existing database in reverse order of dependencies
      this.db.run('DELETE FROM chapter_wiki_mentions');
      this.db.run('DELETE FROM wiki_updates');
      this.db.run('DELETE FROM chapter_reviews');
      this.db.run('DELETE FROM book_characters');
      this.db.run('DELETE FROM chapter_summaries');
      this.db.run('DELETE FROM wiki_pages');
      this.db.run('DELETE FROM chapters');
      this.db.run('DELETE FROM book_parts');
      this.db.run('DELETE FROM books');
      this.db.run('DELETE FROM custom_reviewer_profiles');
      this.db.run('DELETE FROM ai_profiles');

      // Import books
      if (importData.books) {
        for (const book of importData.books) {
          await this.saveBook(book);
        }
      }

      // Import chapters
      if (importData.chapters) {
        for (const chapter of importData.chapters) {
          await this.saveChapter(chapter);
        }
      }

      // Import other tables
      const importTable = (tableName: string, rows: any[]) => {
        if (!rows || rows.length === 0) return;

        for (const row of rows) {
          const columns = Array.isArray(row) ? row : Object.values(row);
          const placeholders = columns.map(() => '?').join(', ');
          this.db.run(`INSERT OR REPLACE INTO ${tableName} VALUES (${placeholders})`, columns);
        }
      };

      importTable('book_parts', importData.book_parts);
      importTable('chapter_summaries', importData.chapter_summaries);
      importTable('wiki_pages', importData.wiki_pages);
      importTable('book_characters', importData.book_characters);
      importTable('chapter_reviews', importData.chapter_reviews);
      importTable('custom_reviewer_profiles', importData.custom_reviewer_profiles);
      importTable('ai_profiles', importData.ai_profiles);
      importTable('wiki_updates', importData.wiki_updates);
      importTable('chapter_wiki_mentions', importData.chapter_wiki_mentions);

      this.saveToLocalStorage();
    }
  }

  async importFromNeonExport(jsonData: any): Promise<void> {
    // Transform Neon PostgreSQL export to match our schema
    // Neon exports tables as arrays of objects with column names
    const transformedData: any = {
      version: 2,
      books: [],
      chapters: [],
      book_parts: [],
      chapter_summaries: [],
      wiki_pages: [],
      book_characters: [],
      chapter_reviews: [],
      custom_reviewer_profiles: [],
      ai_profiles: [],
      wiki_updates: [],
      chapter_wiki_mentions: []
    };

    // Map Neon table exports to our format
    if (jsonData.books) {
      transformedData.books = jsonData.books.map((b: any) => ({
        id: b.id,
        title: b.title,
        created_at: b.created_at
      }));
    }

    if (jsonData.chapters) {
      transformedData.chapters = jsonData.chapters.map((c: any) => ({
        id: c.id,
        book_id: c.book_id,
        title: c.title,
        text: c.text,
        word_count: c.word_count,
        created_at: c.created_at
      }));
    }

    // Just pass through other tables as-is
    transformedData.book_parts = jsonData.book_parts || [];
    transformedData.chapter_summaries = jsonData.chapter_summaries || [];
    transformedData.wiki_pages = jsonData.wiki_pages || [];
    transformedData.book_characters = jsonData.book_characters || [];
    transformedData.chapter_reviews = jsonData.chapter_reviews || [];
    transformedData.custom_reviewer_profiles = jsonData.custom_reviewer_profiles || [];
    transformedData.ai_profiles = jsonData.ai_profiles || [];
    transformedData.wiki_updates = jsonData.wiki_updates || [];
    transformedData.chapter_wiki_mentions = jsonData.chapter_wiki_mentions || [];

    // Use the standard import function
    const jsonString = JSON.stringify(transformedData);
    await this.importDatabase(new TextEncoder().encode(jsonString));
  }

  // Chapter Summary methods
  async saveSummary(summary: {
    chapter_id: string;
    summary: string;
    pov: string | null;
    characters: string[];
    beats: string[];
    spoilers_ok: boolean;
  }) {
    const id = `summary-${summary.chapter_id}-${Date.now()}`;
    const now = new Date().toISOString();
    const query = `INSERT OR REPLACE INTO chapter_summaries (id, chapter_id, summary, pov, characters, beats, spoilers_ok, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      id,
      summary.chapter_id,
      summary.summary,
      summary.pov,
      JSON.stringify(summary.characters),
      JSON.stringify(summary.beats),
      summary.spoilers_ok ? 1 : 0,
      now,
      now
    ];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.saveToLocalStorage();
    }
  }

  async getSummary(chapterId: string): Promise<ChapterSummary | null> {
    const query = `SELECT * FROM chapter_summaries WHERE chapter_id = ? LIMIT 1`;

    if (this.isNative) {
      const result = await this.db.query(query, [chapterId]);
      return result.values?.[0] || null;
    } else {
      const result = this.db.exec(query, [chapterId]);
      if (result.length === 0 || result[0].values.length === 0) return null;

      const row = result[0].values[0];
      return {
        id: row[0],
        chapter_id: row[1],
        summary: row[2],
        pov: row[3],
        characters: row[4],
        beats: row[5],
        spoilers_ok: row[6],
        created_at: row[7],
        updated_at: row[8]
      };
    }
  }

  // Chapter Review methods
  async saveReview(review: {
    chapter_id: string;
    review_text: string;
    prompt_used: string | null;
    profile_id: number | null;
    profile_name: string | null;
    tone_key: string | null;
  }) {
    const id = `review-${review.chapter_id}-${Date.now()}`;
    const now = new Date().toISOString();
    const query = `INSERT INTO chapter_reviews (id, chapter_id, review_text, prompt_used, profile_id, profile_name, tone_key, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      id,
      review.chapter_id,
      review.review_text,
      review.prompt_used,
      review.profile_id,
      review.profile_name,
      review.tone_key,
      now,
      now
    ];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.saveToLocalStorage();
    }
  }

  async getReviews(chapterId: string): Promise<ChapterReview[]> {
    const query = `SELECT * FROM chapter_reviews WHERE chapter_id = ? ORDER BY created_at DESC`;

    if (this.isNative) {
      const result = await this.db.query(query, [chapterId]);
      return result.values || [];
    } else {
      const result = this.db.exec(query, [chapterId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: any[]) => ({
        id: row[0],
        chapter_id: row[1],
        review_text: row[2],
        prompt_used: row[3],
        profile_id: row[4],
        profile_name: row[5],
        tone_key: row[6],
        created_at: row[7],
        updated_at: row[8]
      }));
    }
  }

  async deleteReview(reviewId: string) {
    const query = `DELETE FROM chapter_reviews WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, [reviewId]);
    } else {
      this.db.run(query, [reviewId]);
      this.saveToLocalStorage();
    }
  }

  // Custom Reviewer Profile methods
  async getCustomProfiles(): Promise<any[]> {
    const query = `SELECT * FROM custom_reviewer_profiles ORDER BY created_at DESC`;

    if (this.isNative) {
      const result = await this.db.query(query);
      return result.values || [];
    } else {
      const result = this.db.exec(query);
      if (result.length === 0) return [];

      return result[0].values.map((row: any[]) => ({
        id: row[0],
        name: row[1],
        description: row[2],
        created_at: row[3],
        updated_at: row[4]
      }));
    }
  }

  async createCustomProfile(profile: {
    name: string;
    description: string;
  }) {
    const id = Date.now();
    const now = new Date().toISOString();
    const query = `INSERT INTO custom_reviewer_profiles (id, name, description, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?)`;

    const params = [id, profile.name, profile.description, now, now];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.saveToLocalStorage();
    }

    return id;
  }

  async updateCustomProfile(profileId: number, updates: {
    name?: string;
    description?: string;
  }) {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      sets.push('description = ?');
      params.push(updates.description);
    }

    sets.push('updated_at = ?');
    params.push(now);
    params.push(profileId);

    const query = `UPDATE custom_reviewer_profiles SET ${sets.join(', ')} WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.saveToLocalStorage();
    }
  }

  async deleteCustomProfile(profileId: number) {
    // First delete any reviews using this profile
    const deleteReviewsQuery = `DELETE FROM chapter_reviews WHERE profile_id = ?`;
    const deleteProfileQuery = `DELETE FROM custom_reviewer_profiles WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(deleteReviewsQuery, [profileId]);
      await this.db.run(deleteProfileQuery, [profileId]);
    } else {
      this.db.run(deleteReviewsQuery, [profileId]);
      this.db.run(deleteProfileQuery, [profileId]);
      this.saveToLocalStorage();
    }
  }

  // Wiki Page methods
  async createWikiPage(page: {
    book_id: string;
    page_name: string;
    content: string;
    summary: string;
    page_type?: string;
    created_by_ai?: boolean;
  }) {
    const id = `wiki-${page.book_id}-${Date.now()}`;
    const now = new Date().toISOString();
    const query = `INSERT INTO wiki_pages (id, book_id, page_name, page_type, content, summary, created_by_ai, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      id,
      page.book_id,
      page.page_name,
      page.page_type || 'character',
      page.content,
      page.summary,
      page.created_by_ai ? 1 : 0,
      now,
      now
    ];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.saveToLocalStorage();
    }

    return id;
  }

  async updateWikiPage(pageId: string, updates: {
    content?: string;
    summary?: string;
    page_name?: string;
  }) {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: any[] = [];

    if (updates.content !== undefined) {
      sets.push('content = ?');
      params.push(updates.content);
    }
    if (updates.summary !== undefined) {
      sets.push('summary = ?');
      params.push(updates.summary);
    }
    if (updates.page_name !== undefined) {
      sets.push('page_name = ?');
      params.push(updates.page_name);
    }

    sets.push('updated_at = ?');
    params.push(now);
    params.push(pageId);

    const query = `UPDATE wiki_pages SET ${sets.join(', ')} WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.saveToLocalStorage();
    }
  }

  async getWikiPageById(id: string): Promise<any | null> {
    const query = `SELECT * FROM wiki_pages WHERE id = ? LIMIT 1`;

    if (this.isNative) {
      const result = await this.db.query(query, [id]);
      return result.values?.[0] || null;
    } else {
      const result = this.db.exec(query, [id]);
      if (result.length === 0 || result[0].values.length === 0) return null;

      const row = result[0].values[0];
      return {
        id: row[0],
        book_id: row[1],
        page_name: row[2],
        page_type: row[3],
        content: row[4],
        summary: row[5],
        aliases: row[6],
        tags: row[7],
        is_major: row[8],
        created_by_ai: row[9],
        created_at: row[10],
        updated_at: row[11]
      };
    }
  }

  async getWikiPage(bookId: string, pageName: string): Promise<any | null> {
    const query = `SELECT * FROM wiki_pages WHERE book_id = ? AND page_name = ? LIMIT 1`;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId, pageName]);
      return result.values?.[0] || null;
    } else {
      const result = this.db.exec(query, [bookId, pageName]);
      if (result.length === 0 || result[0].values.length === 0) return null;

      const row = result[0].values[0];
      return {
        id: row[0],
        book_id: row[1],
        page_name: row[2],
        page_type: row[3],
        content: row[4],
        summary: row[5],
        aliases: row[6],
        tags: row[7],
        is_major: row[8],
        created_by_ai: row[9],
        created_at: row[10],
        updated_at: row[11]
      };
    }
  }

  async getWikiPages(bookId: string): Promise<any[]> {
    const query = `SELECT * FROM wiki_pages WHERE book_id = ? ORDER BY page_name`;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      return result.values || [];
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: any[]) => ({
        id: row[0],
        book_id: row[1],
        page_name: row[2],
        page_type: row[3],
        content: row[4],
        summary: row[5],
        aliases: row[6],
        tags: row[7],
        is_major: row[8],
        created_by_ai: row[9],
        created_at: row[10],
        updated_at: row[11]
      }));
    }
  }

  async trackWikiUpdate(update: {
    wiki_page_id: string;
    chapter_id: string;
    update_type: string;
    change_summary?: string;
    contradiction_notes?: string;
  }) {
    const id = `update-${update.wiki_page_id}-${Date.now()}`;
    const now = new Date().toISOString();
    const query = `INSERT INTO wiki_updates (id, wiki_page_id, chapter_id, update_type, change_summary, contradiction_notes, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      id,
      update.wiki_page_id,
      update.chapter_id,
      update.update_type,
      update.change_summary || null,
      update.contradiction_notes || null,
      now
    ];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.saveToLocalStorage();
    }
  }

  async addChapterWikiMention(chapterId: string, wikiPageId: string) {
    const id = `mention-${chapterId}-${wikiPageId}`;
    const now = new Date().toISOString();
    const query = `INSERT OR IGNORE INTO chapter_wiki_mentions (id, chapter_id, wiki_page_id, created_at)
                   VALUES (?, ?, ?, ?)`;

    const params = [id, chapterId, wikiPageId, now];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.saveToLocalStorage();
    }
  }

  private saveToLocalStorage() {
    if (!this.isNative) {
      const data = this.db.export();
      const arr = Array.from(data);
      localStorage.setItem('sqliteDb', JSON.stringify(arr));
    }
  }

  async close() {
    if (this.isNative && this.db) {
      await this.db.close();
    }
  }
}

export const db = new AppDatabase();

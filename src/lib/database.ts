import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import initSqlJs from 'sql.js';

export interface Book {
  id: string;
  title: string;
  created_at: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  title?: string;
  text: string;
  word_count: number;
  created_at: string;
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
  }

  private async createTables() {
    const schema = `
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        title TEXT,
        text TEXT NOT NULL,
        word_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id)
      );

      CREATE TABLE IF NOT EXISTS book_parts (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        name TEXT NOT NULL,
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

  async saveBook(book: Book) {
    const query = `INSERT OR REPLACE INTO books (id, title, created_at) VALUES (?, ?, ?)`;

    if (this.isNative) {
      await this.db.run(query, [book.id, book.title, book.created_at]);
    } else {
      this.db.run(query, [book.id, book.title, book.created_at]);
      this.saveToLocalStorage();
    }
  }

  async getBooks(): Promise<Book[]> {
    const query = `SELECT * FROM books ORDER BY created_at DESC`;

    if (this.isNative) {
      const result = await this.db.query(query);
      return result.values || [];
    } else {
      const result = this.db.exec(query);
      if (result.length === 0) return [];

      return result[0].values.map((row: any[]) => ({
        id: row[0],
        title: row[1],
        created_at: row[2]
      }));
    }
  }

  async saveChapter(chapter: Chapter) {
    const query = `INSERT OR REPLACE INTO chapters (id, book_id, title, text, word_count, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)`;

    if (this.isNative) {
      await this.db.run(query, [
        chapter.id,
        chapter.book_id,
        chapter.title,
        chapter.text,
        chapter.word_count,
        chapter.created_at
      ]);
    } else {
      this.db.run(query, [
        chapter.id,
        chapter.book_id,
        chapter.title,
        chapter.text,
        chapter.word_count,
        chapter.created_at
      ]);
      this.saveToLocalStorage();
    }
  }

  async getChapters(bookId: string): Promise<Chapter[]> {
    const query = `SELECT * FROM chapters WHERE book_id = ? ORDER BY created_at`;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      return result.values || [];
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: any[]) => ({
        id: row[0],
        book_id: row[1],
        title: row[2],
        text: row[3],
        word_count: row[4],
        created_at: row[5]
      }));
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

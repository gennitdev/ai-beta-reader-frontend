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
      // Export as JSON for web too (more reliable than binary)
      const books = await this.getBooks();
      const allChapters: Chapter[] = [];

      for (const book of books) {
        const chapters = await this.getChapters(book.id);
        allChapters.push(...chapters);
      }

      const exportData = {
        version: 1,
        books,
        chapters: allChapters
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
      // Clear existing database
      this.db.run('DELETE FROM chapters');
      this.db.run('DELETE FROM books');

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

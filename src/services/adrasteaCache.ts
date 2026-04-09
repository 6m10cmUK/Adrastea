import { openDB, type IDBPDatabase } from 'idb';
import type { ChatMessage } from '../types/adrastea.types';

const DB_NAME = 'adrastea';
const DB_VERSION = 1;
const STORE_MESSAGES = 'messages';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
          store.createIndex('by_room', 'room_id');
          store.createIndex('by_room_time', ['room_id', 'created_at']);
        }
      },
    });
  }
  return dbPromise;
}

/** ルームのキャッシュ済みメッセージを新しい順で取得 */
export async function getCachedMessages(roomId: string, limit: number): Promise<ChatMessage[]> {
  const db = await getDB();
  const tx = db.transaction(STORE_MESSAGES, 'readonly');
  const index = tx.store.index('by_room_time');

  const range = IDBKeyRange.bound([roomId, 0], [roomId, Infinity]);
  const all: ChatMessage[] = [];
  let cursor = await index.openCursor(range, 'prev');

  while (cursor && all.length < limit) {
    all.push(cursor.value as ChatMessage);
    cursor = await cursor.continue();
  }

  return all.reverse();
}

/** ルームの最新キャッシュタイムスタンプを取得 */
export async function getLatestCachedTimestamp(roomId: string): Promise<number> {
  const db = await getDB();
  const tx = db.transaction(STORE_MESSAGES, 'readonly');
  const index = tx.store.index('by_room_time');

  const range = IDBKeyRange.bound([roomId, 0], [roomId, Infinity]);
  const cursor = await index.openCursor(range, 'prev');

  if (cursor) {
    return (cursor.value as ChatMessage).created_at;
  }
  return 0;
}

/** ルームのキャッシュ済みメッセージを全削除 */
export async function clearCachedMessages(roomId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_MESSAGES, 'readwrite');
  const index = tx.store.index('by_room');
  let cursor = await index.openCursor(IDBKeyRange.only(roomId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** メッセージをキャッシュに保存（重複は上書き） */
export async function cacheMessages(messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const db = await getDB();
  const tx = db.transaction(STORE_MESSAGES, 'readwrite');
  for (const msg of messages) {
    await tx.store.put(msg);
  }
  await tx.done;
}

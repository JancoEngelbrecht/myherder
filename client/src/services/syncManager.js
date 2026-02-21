import db from '../db/indexedDB.js'
import api from './api.js'

/**
 * Sync manager — handles pulling data from the server to IndexedDB
 * and reading from IndexedDB when offline.
 */

export async function pullCows() {
  const { data: cows } = await api.get('/cows')
  await db.cows.bulkPut(cows)
  return cows
}

export async function pullOneCow(id) {
  const { data: cow } = await api.get(`/cows/${id}`)
  await db.cows.put(cow)
  return cow
}

export async function getLocalCows() {
  return db.cows.toArray()
}

export async function getLocalCow(id) {
  return db.cows.get(id)
}

export async function saveCowLocally(cow) {
  await db.cows.put(cow)
}

export async function removeCowLocally(id) {
  await db.cows.delete(id)
}

export function isOfflineError(err) {
  return !navigator.onLine || err.code === 'ECONNABORTED' || !err.response
}

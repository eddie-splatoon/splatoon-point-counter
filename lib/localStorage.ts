// lib/localStorage.ts

/**
 * Retrieves an item from localStorage and parses it as JSON.
 * @param key The key of the item to retrieve.
 * @returns The parsed data, or null if the item doesn't exist or there's a parsing error.
 */
export function getItem<T>(key: string): T | null {
    if (typeof window === 'undefined') {
        return null;
    }
    const item = window.localStorage.getItem(key);
    if (item === null) {
        return null;
    }
    try {
        return JSON.parse(item) as T;
    } catch (error) {
        console.error(`Error parsing localStorage item for key "${key}":`, error);
        throw error; // Re-throw the error to be caught by the caller
    }
}

/**
 * Saves an item to localStorage after stringifying it.
 * @param key The key under which to save the data.
 * @param value The data to save.
 */
export function setItem<T>(key: string, value: T): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        const item = JSON.stringify(value);
        window.localStorage.setItem(key, item);
    } catch (error) {
        console.error(`Error writing to localStorage for key "${key}":`, error);
    }
}

/**
 * Removes an item from localStorage.
 * @param key The key of the item to remove.
 */
export function removeItem(key: string): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem(key);
}

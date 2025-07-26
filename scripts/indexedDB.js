let db;
const dbName = 'doorChitraVaniDB';
const storeName = 'doorChitraVaniStore';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(dbName, 1);
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            db.createObjectStore(storeName, { keyPath: 'name' });
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// Store item in IndexedDB
function storeItem(item, data) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject('DB not initialized');
            return;
        }
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put({ name: item.name, url: item.url, data: data });
        request.onsuccess = () => {
            resolve();
        };
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// Get item from IndexedDB
function getItem(name) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject('DB not initialized');
            return;
        }
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(name);
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// Initialize IndexedDB
initDB().then(() => {
    console.log('IndexedDB initialized');
}).catch((error) => {
    console.error('Error initializing IndexedDB:', error);
});
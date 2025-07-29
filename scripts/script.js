let currentPlayer = null;
let hls = null;
let currentItem = null;
let currentIndex = 0;
let channels = {};
let currentChannelName = '';
let staticChannelSuffix = ' ▪️';
let touchStartX = 0;
let db;
const dbName = 'doorChitraVaniDB';
const storeName = 'doorChitraVaniStore';
const searchInput = document.getElementById('search-input');
const quickSearchButtons = document.querySelectorAll('.quick-search-button');
const hamburgerMenu = document.getElementById('hamburger-menu');
const navDrawer = document.getElementById('nav-drawer');
const statusBar = document.getElementById("status-bar");
const aboutDialog = document.getElementById('about-dialog');
const closeDialogBtn = document.getElementById('close-dialog-btn');

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

function deleteThirdPartyIndexedDBOnLoad() {
    indexedDB.databases().then((databases) => {
        databases.forEach((database) => {
            if (database.name.toLowerCase().includes('doorchitravani') || database.name.toLowerCase().includes('notesdb')) {
                //do nothing
            } else {
                deleteIndexedDB(database.name);
            }

        });
    });
    updateStatusBar('Offline Storage deleted.');
}

function deleteIndexedDB(dbname) {
    const request = indexedDB.deleteDatabase(dbname);
    request.onsuccess = function () {
        console.log(`Database ${dbname} deleted successfully`);
    };

    request.onerror = function () {
        console.log(`Error deleting database ${dbname}`);
    };

    request.onblocked = function () {
        console.log(`Database ${dbname} deletion blocked`);
    };
}

function updateStatusBar(msg) {
    statusBar.innerText = msg;
    statusBar.focus();
    statusBar.blur();
}

function loadChannels() {
    let jsonUrl = localStorage.getItem('jsonUrl');
    if (jsonUrl) {
        fetch(jsonUrl)
            .then(response => response.json())
            .then(data => {
                data.forEach(channel => {
                    let url = '';
                    let name = '';
                    if (channel.iptv_urls && channel.iptv_urls.length > 0) {
                        url = channel.iptv_urls[0];
                    } else if (channel.youtube_urls && channel.youtube_urls.length > 0) {
                        url = channel.youtube_urls[0];
                    }
                    name = formatChannelName(channel.name, url);
                    if (url) {
                        //name = channel.name;
                        if (channel.language) {
                            name += ` (${channel.language})`;
                        } else if (channel.country) {
                            name += ` (${channel.country})`;
                        }

                        if (url.includes("youtube-nocookie")) {
                            url = url.replace("-nocookie", "");
                        }
                        channels[name] = url;
                        localStorage.setItem(name, url);
                    }
                });
            })
            .catch(error => console.error('Error:', error));
            updateStatusBar('New items loaded, refresh or restart app.');
    }
}

function getYoutubeEmbedUrl(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    const videoId = (match && match[7].length == 11) ? match[7] : false;
    return `https://www.youtube.com/embed/${videoId}`;
}

function loadSingleURL() {
    let url = prompt("Enter Single Video / Audio / Youtube URL:");
    let name = prompt("Enter name:");
    localStorage.setItem(name, url);
}

function DailyMediaSourceRefresh() {
    const today = new Date().toISOString().split('T')[0];
    const lastRunDate = localStorage.getItem('lastMediaUpdateOn');
    if (!lastRunDate || lastRunDate !== today) {
        //Update media sources if loaded via JSON URL
        loadChannels();
        localStorage.setItem('lastMediaUpdateOn', today);
    }
}

function weeklyAppUpdate() {
    const lastAppUpdateOn = localStorage.getItem("lastAppUpdateOn");
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (!lastAppUpdateOn || new Date(lastAppUpdateOn) <= oneWeekAgo) {
        updateApp();
    }
}

function deleteAllCookies() {
    document.cookie.split(";").forEach(function (cookie) {
        var eqPos = cookie.indexOf("=");
        var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    });
}

async function deleteCache() {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
        await caches.delete(name);
    }
}

// Function to update cache
function updateCache() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration && registration.active) {
            registration.active.postMessage('update-cache');
        }
        });
    }
}

function updateApp() {
    if (!confirm("Are you connected to Internet? Do you want to check for update to this application?")) {
        return;
    }
    deleteCache();
    updateCache();
    localStorage.setItem("lastAppUpdateOn", new Date().toISOString());
    updateStatusBar('Update requested, refresh or restart the app.');

}

function clearStorage() {
    //Local Storage and offline storage in Indexed DB specific to 'DoorChitraVani'
    deleteCache();
    deleteIndexedDB('doorchitravani-cache');
    localStorage.clear();
    deleteAllCookies();
    updateCache();
}

function getPlaylistItems() {
    const playlistElement = document.getElementById('playlist');
    const playlistItemElements = playlistElement.children;
    const playlistItems = [];
    for (let i = 0; i < playlistItemElements.length; i++) {
        const itemElement = playlistItemElements[i];
        playlistItems.push({
            name: itemElement.textContent,
            element: itemElement,
        });
    }
    return playlistItems;
}

function getCurrentIndex() {
    if (!currentChannelName) return 0;
    const playlistItems = getPlaylistItems();
    const currentItem = playlistItems.find((item) => item.name === currentChannelName);
    return currentItem ? playlistItems.indexOf(currentItem) : 0;
}

function playPreviousItem() {
    const currentIndex = getCurrentIndex();
    const playlistItems = getPlaylistItems();
    stopPlayback();
    if (currentIndex > 0) {
        const previousItem = playlistItems[currentIndex - 1];
        previousItem.element.click();
    } else {
        playlistItems[0].element.click();
    }
}

function playNextItem() {
    const currentIndex = getCurrentIndex();
    const playlistItems = getPlaylistItems();

    stopPlayback();
    if (currentIndex < playlistItems.length - 1) {
        const nextItem = playlistItems[currentIndex + 1];
        nextItem.element.click();
    } else {
        playlistItems[0].element.click();
    }
}



function initializePlaylist() {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== 'jsonUrl' && key !== '0_currentDate') {
            channels[key] = localStorage.getItem(key);
        }
    }
}

function formatChannelName(name, url) {
    let lName = name.toLowerCase();
    if (url.includes('m3u8')) {
        if (lName.includes('movi') || lName.includes('film') || lName.includes('trail')) {
            return '🎬 ' + name;
        } else if (lName.includes('wild') || lName.includes('nature') || lName.includes('earth') || lName.includes('geog')) {
            return '🐅 ' + name;
        } else {
            return name;
        }
    } else if (url.includes('youtube')) {
        return '▶️ ' + name;
    } else {
        return name;
    }
}

function playItem(item, element, index) {
    stopPlayback();
    if (currentItem) {
        currentItem.classList.remove('selected');
    }
    element.classList.add('selected');
    currentItem = element;
    currentIndex = index;
    currentChannelName = item.name;

    //remove icon suffix from name
    splitChlName = item.name.split(';')[1] || item.name;

    if (item.name.includes('💾')) {
        // Check if item is cached in IndexedDB
        getItem(item.name).then((cachedItem) => {
            if (cachedItem && cachedItem.data) {
                updateStatusBar(`offline`);
                loadItem(item, cachedItem.data);
            } else {
                updateStatusBar(`online`);
                // Cache item asynchronously
                //Delayed caching to allow immediate playback on first use.
                setTimeout(() => {
                    cacheItem(item);
                }, 5000);
                loadItem(item);
            }
        }).catch((error) => {
            console.error('Error getting cached item:', error);
            loadItem(item);
        });
    } else {
        loadItem(item);
    }

    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: splitChlName
        });
    }
    document.getElementById('current-media').textContent = splitChlName;
}

function encodeUrl(url) {
  return encodeURIComponent(url).replace(/%3A/g, ':').replace(/%2F/g, '/');
}

function loadItem(item, data) {
    if (item.url.endsWith('.json')) {
        localStorage.setItem('jsonUrl', item.url);
        loadChannels();
    } else if (item.url.endsWith('.m3u8')) {
        const video = document.createElement('video');
        video.controls = true;
        document.getElementById('player-container').appendChild(video);
        currentPlayer = video;

        if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(item.url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_LOADED, function () {
                video.play();
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = item.url;
            video.addEventListener('loadedmetadata', function () {
                video.play();
            });
        }

        //Auto play next when current one is ended.
        video.addEventListener('ended', () => {
            // Video has ended
            playNextItem();
        });
    } else if (item.url.endsWith('.mp4')) {
        const video = document.createElement('video');
        if (data) {
            video.src = URL.createObjectURL(data);
        } else {
            video.src = item.url;
        }
        video.controls = true;
        document.getElementById('player-container').appendChild(video);
        currentPlayer = video;
        video.play();

        //Auto play next when current one is ended.
        video.addEventListener('ended', () => {
            // Video has ended
            playNextItem();
        });
    } else if (item.url.includes('youtube')) {
        const youtubeUrl = item.url.includes('embed') ? item.url : getYoutubeEmbedUrl(item.url);
        const iframe = document.createElement('iframe');
        iframe.src = youtubeUrl + '?autoplay=1&fs=0';
        iframe.frameBorder = 0;
        iframe.allowFullScreen = true;
        iframe.allow = 'autoplay';
        document.getElementById('player-container').appendChild(iframe);
        currentPlayer = iframe;
    } else if (item.url.endsWith('.jpg') || item.url.endsWith('.png') || item.url.endsWith('.jpeg') || item.name.toLowerCase().includes("jpg")) {
        const img = document.createElement('img');
        img.style.touchAction = 'manipulation';

        if (data) {
            img.src = URL.createObjectURL(data);
        } else {
            img.src = item.url;
        }

        imgDialog(img);
        //document.getElementById('player-container').appendChild(img);
        //currentPlayer = img;
    } else if (item.url.endsWith('.pdf') || item.name.toLowerCase().includes('pdf')) {
        const iframe = document.createElement('iframe');
        iframe.src = item.url;
        iframe.frameBorder = 0;
        iframe.width = '100%';
        iframe.height = '100%';
        document.getElementById('player-container').appendChild(iframe);
        currentPlayer = iframe;
    } else if (item.url.startsWith('file://')) {
        const intentUrl = `intent://${item.url.substring(7)}#Intent;action=android.intent.action.VIEW;type=audio/mpeg;end`;
        window.location.href = intentUrl;
    } else {
        const audio = document.createElement('audio');
        audio.controls = true;
        if (data) {
            audio.src = URL.createObjectURL(data);
        } else {
            audio.src = item.url;
        }
        document.getElementById('player-container').appendChild(audio);
        currentPlayer = audio;
        audio.play();

        //Auto play next when current one is ended.
        audio.addEventListener('ended', () => {
            // Video has ended
            playNextItem();
        });
    }
}

function imgDialog(img) {
    // Create a modal dialog box
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0, 0, 0, 0.8)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';

    // Add the image to the modal dialog box
    modal.appendChild(img);
    img.style.width = '100vw';
    img.style.height = '100vh';
    img.style.objectFit = 'contain';

    // Add a close button to the modal dialog box
    const closeButton = document.createElement('button');
    closeButton.textContent = ' X ';
    closeButton.style.position = 'absolute';
    closeButton.style.fontSize = '24px'; // Increase font size
    closeButton.style.bottom = '10px';
    closeButton.style.left = '10px';
    closeButton.style.zIndex = '1';
    closeButton.style.pointerEvents = 'auto';
    closeButton.onclick = () => {
        modal.parentNode.removeChild(modal);
    };
    modal.appendChild(closeButton);

    document.body.appendChild(modal);
}

function stopPlayback() {
    if (currentPlayer) {
        if (currentPlayer.pause) {
            currentPlayer.pause();
        }
        document.getElementById('player-container').innerHTML = '';

        if (hls) {
            hls.destroy();
            hls.detachMedia();
            hls = null;
        }
        document.getElementById('current-media').textContent = '';
        currentPlayer = null;
    }
}

function renderPlaylist(playlistToRender) {
    // Create a new map to store items with number suffix as key
    const orderedPlaylist = new Map();
    const otherItems = [];
    const playlistElement = document.getElementById('playlist');
    playlistElement.innerHTML = '';

    // Populate the new map and otherItems array
    playlistToRender.forEach((item) => {
        const match = item.name.match(/\d+$/);
        if (match) {
            const key = parseInt(match[0]);
            orderedPlaylist.set(key, item);
        } else {
            otherItems.push(item);
        }
    });

    // Render the playlist using the new map with keys in order
    const sortedKeys = Array.from(orderedPlaylist.keys()).sort((a, b) => a - b);
    let index = 0;
    sortedKeys.forEach((key) => {
        const item = orderedPlaylist.get(key);
        const element = document.createElement('div');
        element.className = 'playlist-item';
        element.innerHTML = item.name;
        element.onclick = () => playItem(item, element, index);
        playlistElement.appendChild(element);
        index++;
    });

    otherItems.forEach((item) => {
        const element = document.createElement('div');
        element.className = 'playlist-item';
        element.innerHTML = item.name;
        element.onclick = () => playItem(item, element, index);
        playlistElement.appendChild(element);
        index++;
    });
}

function loadPlaylist() {
    document.getElementById('current-media').textContent = '';
    const searchTerms = [staticChannelSuffix];
    const channelsToLoad = [];
    searchTerms.forEach(term => {
        Object.keys(channels).forEach(channel => {
            if (!channel.includes('🎶') && channel.toLowerCase().includes(term.toLowerCase()) && !channelsToLoad.find(c => c.name === channel)) {
                channelsToLoad.push({ name: channel, url: channels[channel] });
            }
        });
    });
    renderPlaylist(channelsToLoad);
}

// Cache item asynchronously if item.name contains '💾'
function cacheItem(item) {
    if (item.name.includes('💾') && !item.url.includes('youtube') && !item.url.includes('file://') && !item.url.includes('m3u8')) {
        fetch(item.url)
            .then(response => response.blob())
            .then(data => {
                storeItem(item, data).then(() => {
                }).catch((error) => {
                    console.error('Error caching item:', error);
                });
            })
            .catch((error) => {
                console.error('Error fetching item:', error);
            });
    }
}

// Function to get words from local storage keys
function getWordsFromLocalStorage() {
    const words = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const wordArray = key.split(/[\s_]+/); // Split key into words
        words.push(...wordArray.filter(word => word.length >= 7)); // Filter words with length >= 4
    }
    return words;
}

// Function to count occurrences of each word
function countWordOccurrences(words) {
    const wordCount = {};
    words.forEach(word => {
        const lowerCaseWord = word.toLowerCase(); // Convert to lowercase for case-insensitive comparison
        if (lowerCaseWord == "channel" || lowerCaseWord == "network" || lowerCaseWord == "television"
            || lowerCaseWord == "community" || lowerCaseWord.includes("nation") || lowerCaseWord == "blessing"
            || lowerCaseWord == "telemundo" || lowerCaseWord.includes("america") || lowerCaseWord == "univers"
            || lowerCaseWord == "country" || lowerCaseWord == "committee" || lowerCaseWord.includes("educat") || lowerCaseWord.includes("english")
            || lowerCaseWord.includes("news") || lowerCaseWord.includes("shopping") || lowerCaseWord.includes("business") || lowerCaseWord.includes("govern")
            || lowerCaseWord == "intern" || lowerCaseWord == "legisla" || lowerCaseWord == "assemb")
            return;
        wordCount[lowerCaseWord] = (wordCount[lowerCaseWord] || 0) + 1;
    });
    return wordCount;
}

// Function to get repeating words
function getRepeatingWords(wordCount) {
    const repeatingWords = Object.keys(wordCount).filter(word => wordCount[word] >= 5);
    return repeatingWords.sort((a, b) => wordCount[b] - wordCount[a]); // Sort in descending order of occurrences
}

// Function to add datalist to search input
function addDatalist(repeatingWords) {
    const datalist = document.createElement('datalist');
    datalist.id = 'search-options';
    repeatingWords.forEach(word => {
        const option = document.createElement('option');
        option.value = word;
        datalist.appendChild(option);
    });
    document.body.appendChild(datalist);
    const searchInput = document.getElementById('search-input');
    searchInput.setAttribute('list', 'search-options');
}

function populateDataListForSearchInput() {
    const words = getWordsFromLocalStorage();
    const wordCount = countWordOccurrences(words);
    const repeatingWords = getRepeatingWords(wordCount);
    addDatalist(repeatingWords);
}

closeDialogBtn.addEventListener('click', () => {
    aboutDialog.close();
});

document.getElementById('force-update-btn').addEventListener('click', function () {
    updateApp();
    window.location.reload(true);
});

document.getElementById('playlist').addEventListener('touchstart', function (event) {
    touchStartX = event.touches[0].clientX;
}, { passive: true });

document.getElementById('playlist').addEventListener('touchend', function (event) {
    const touchEndX = event.changedTouches[0].clientX;
    const swipeDistance = touchStartX - touchEndX;

    if (Math.abs(swipeDistance) > 50) { // Adjust the swipe distance threshold
        if (swipeDistance > 0) {
            playPreviousItem();
        } else {
            playNextItem();
        }
    }
});

document.addEventListener('click', (e) => {
    if (!navDrawer.contains(e.target) && !hamburgerMenu.contains(e.target)) {
        navDrawer.classList.remove('show');
    }
});

document.getElementById('player-container').addEventListener('click', () => {
    if (currentPlayer) {
        if (currentPlayer.paused) {
            currentPlayer.play();
        } else {
            currentPlayer.pause();
        }
    }
});

navDrawer.addEventListener('click', (e) => {
    e.stopPropagation();
});

document.getElementById('search-input').addEventListener('input', () => {
    const searchQuery = document.getElementById('search-input').value.trim().toLowerCase();
    if (searchQuery.length >= 2) {
        const searchWords = searchQuery.split(' ').filter(word => word.length > 1);
        const filteredPlaylist = Object.keys(channels).filter(name => {
            const nameLower = name.toLowerCase();
            return searchWords.every(word => nameLower.includes(word));
        }).map((name, index) => ({ name, url: channels[name], index }));
        renderPlaylist(filteredPlaylist);
    } else {
        document.getElementById('playlist').innerHTML = '';
        loadPlaylist();
    }
});

document.getElementById('load-static-button').addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.m3u, .txt';

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();

        reader.onload = (event) => {

            const fileContents = event.target.result;
            const lines = fileContents.split('\n');
            let channelName = null;
            let i = 0;
            lines.forEach(line => {
                if (line.startsWith('#EXTINF:')) {
                    channelName = line.split(',')[1].trim();
                } else if (line.startsWith('http') || line.startsWith('file')) {
                    if (channelName) {
                        if(line.toLowerCase().includes('youtube')){
                            localStorage.setItem(channelName + staticChannelSuffix + ' ' + (++i), line.trim());
                        }else{
                            localStorage.setItem(channelName + staticChannelSuffix + ' ' + (++i), encodeUrl(line.trim()));
                        }
                                             
                        channelName = null;
                    }
                }
            });
            updateStatusBar('New items loaded, refresh or restart app.');
        };
        reader.readAsText(file);
    });
    fileInput.click();
});

document.addEventListener('keydown', (e) => {
    if (currentItem && currentPlayer) {
        const playlistElement = document.getElementById('playlist');
        const playlistItems = playlistElement.children;
        switch (e.key) {
            case 'MediaTrackPrevious':
                playPreviousItem();
                break;
            case 'MediaTrackNext':
                playNextItem();
                break;
            case 'MediaPlayPause':
                if (currentPlayer) {
                    if (currentPlayer.paused) {
                        currentPlayer.play();
                    } else {
                        currentPlayer.pause();
                    }
                }
                break;
            case 'Escape':
                stopPlayback();
                break;
        }
    }
});

screen.orientation.addEventListener('change', function () {
    if (currentPlayer && (currentPlayer.tagName === 'VIDEO'
        || currentPlayer.tagName === 'IFRAME'
    )) {
        if (screen.orientation.type.startsWith('landscape')) {
            // Landscape mode
            if (currentPlayer.requestFullscreen) {
                currentPlayer.requestFullscreen();
            } else if (currentPlayer.webkitRequestFullscreen) {
                currentPlayer.webkitRequestFullscreen();
            } else if (currentPlayer.msRequestFullscreen) {
                currentPlayer.msRequestFullscreen();
            }
        } else {
            // Portrait mode
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
        }
    }
});

quickSearchButtons.forEach(button => {
    button.addEventListener('click', () => {
        if (searchInput.value.includes(button.textContent)) {
            searchInput.value = '';
        } else {
            searchInput.value = button.textContent + ' ';
        }

        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
});

document.getElementById('clear-search-input').addEventListener('click', () => {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
});

document.getElementById('about-button').addEventListener('click', () => {
    aboutDialog.showModal();
});

document.getElementById('clear-storage-button').addEventListener('click', () => {
    if (!confirm("Are you sure you want to clear media sources and offline storage from this app?")) {
        return;
    }
    clearStorage();
});

document.addEventListener('backbutton', function (event) {
    stopPlayback();
}, false);

document.getElementById('loadSingleURL').addEventListener('click', () => {
    loadSingleURL();
});

document.getElementById('prev-button').addEventListener('click', () => {
    playPreviousItem();
});

document.getElementById('next-button').addEventListener('click', () => {
    playNextItem();
});

hamburgerMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    navDrawer.classList.toggle('show');
});

//On every page load
weeklyAppUpdate();
// Initialize IndexedDB
initDB().then(() => {
    console.log('IndexedDB initialized');
}).catch((error) => {
    console.error('Error initializing IndexedDB:', error);
});

deleteThirdPartyIndexedDBOnLoad();
deleteAllCookies();
DailyMediaSourceRefresh();
initializePlaylist();
loadPlaylist();
populateDataListForSearchInput();
updateStatusBar('Total Playlist Items: ' + localStorage.length);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then((registration) => {
            console.log('Service Worker registered');
        })
        .catch((error) => {
            console.error('Service Worker registration failed:', error);
        });
}
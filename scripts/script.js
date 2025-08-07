let currentPlayer = null;
let hls = null;
let currentItem = null;
let currentIndex = 0;
let channels = {};
let currentChannelName = '';
let currentUrl = '';
let staticChannelSuffix = ' ▪️';
let touchStartX = 0;
let db;
const defaultCategoriesKey='0000_default_categories';
const dbName = 'doorChitraVaniDB';
const storeName = 'doorChitraVaniStore';
const searchInput = document.getElementById('search-input');
const quickSearchButtons = document.querySelectorAll('.quick-search-button');
const hamburgerMenu = document.getElementById('hamburger-menu');
const navDrawer = document.getElementById('nav-drawer');
const statusBar = document.getElementById("status-bar");
const aboutDialog = document.getElementById('about-dialog');
const closeDialogBtn = document.getElementById('close-dialog-btn');
const offlineSupportedExtensions = ['.mp3', '.ogg', '.jpg', '.jpeg', '.png'];
const cacheDelay = 5000; // 5 seconds

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
            updateStatusBar(`<i class="material-icons">offline_pin</i> ${item.name}`);
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

function deleteAllOfflineStoredItems() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = function() {
            console.log('All items deleted successfully');
        };

        request.onerror = function(event) {
            console.log('Error deleting items:', event.target.error);
        };
    });
}

function deleteThirdPartyIndexedDB() {
    indexedDB.databases().then((databases) => {
        databases.forEach((database) => {
            if (database.name.toLowerCase().includes('doorchitravani') || database.name.toLowerCase().includes('notesdb')) {
                //do nothing
            } else {
                deleteIndexedDB(database.name);
            }

        });
    });
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
    localStorage.clear();
    deleteAllCookies();
    deleteCache();
    deleteAllOfflineStoredItems();
    if(db){
        db.close();
    }
    deleteThirdPartyIndexedDB();
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
    updateStatusBar(item.name);
    if (currentItem) {
        currentItem.classList.remove('selected');
    }
    element.classList.add('selected');
    currentItem = element;
    currentIndex = index;
    currentChannelName = item.name;
    currentUrl = item.url;

    //remove icon suffix from name
    splitChlName = item.name.split(';')[1] || item.name;

    if (item.name.includes('💾') || item.url.toLowerCase().endsWith('.mp3') || item.url.toLowerCase().endsWith('.ogg')
    || item.url.toLowerCase().endsWith('.jpg') || item.url.toLowerCase().endsWith('.jpeg') || item.url.toLowerCase().endsWith('.png')
    ) {
        // Check if item is cached in IndexedDB
        getItem(item.name).then((cachedItem) => {
            if (cachedItem && cachedItem.data) {
                loadItem(item, cachedItem.data);
            } else {                
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
            title: splitChlName,
            artist: '',
            album: ''
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
            playPreviousItem();
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
            playNextItem();
        });

         navigator.mediaSession.setActionHandler('stop', () => {
            stopPlayback();
        });
    }
    updateStatusBar(splitChlName);    
}

function encodeUrl(url) {
  return encodeURIComponent(url).replace(/%3A/g, ':').replace(/%2F/g, '/');
}

function loadItem(item, data) {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        document.querySelector('.left-pane').style.height = '65%';
    }
    if (item.url.endsWith('.json')) {
        localStorage.setItem('jsonUrl', item.url);
        loadChannels();
    } else if (item.url.endsWith('.m3u8')) {
        playM3U8(item);
    } else if (item.url.endsWith('.mp4')) {
        playVideo(item);
    } else if (item.url.includes('youtube')) {
        playYoutubeVideo(item);
    } else if (item.url.endsWith('.jpg') || item.url.endsWith('.png') || item.url.endsWith('.jpeg') || item.name.toLowerCase().includes("jpg")) {
        showImage(item,data);        
    } else if (item.url.endsWith('.pdf') || item.name.toLowerCase().includes('pdf')) {
        openPDF(item);        
    } else if (item.url.startsWith('file://')) {
        playLocalFileAsAudio(item);
    } else {
        playAudio(item,data);
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            document.querySelector('.left-pane').style.height = '90%';
        }
    }
}

function openPDF(item){
    window.open(item.url, '_blank');
}

function showImage(item,data){
    const img = document.createElement('img');
    img.style.touchAction = 'manipulation';

    if (data) {
        img.src = URL.createObjectURL(data);
    } else {
        img.src = item.url;
    }

    imgDialog(img);
    
}

function playVideo(item){
    const video = document.createElement('video');    
    video.src = item.url;
    video.controls = true;
    document.getElementById('player-container').appendChild(video);
    currentPlayer = video;
    video.play();

    //Auto play next when current one is ended.
    video.addEventListener('ended', () => {
        // Video has ended
        playNextItem();
    });
}

function playM3U8(item){
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
}

function playYoutubeVideo(item){
    const youtubeUrl = item.url.includes('embed') ? item.url : getYoutubeEmbedUrl(item.url);
    const iframe = document.createElement('iframe');
    iframe.src = youtubeUrl + '?autoplay=1&fs=0';
    iframe.frameBorder = 0;
    iframe.allowFullScreen = true;
    iframe.allow = 'autoplay';
    document.getElementById('player-container').appendChild(iframe);
    currentPlayer = iframe;
}

function playLocalFileAsAudio(item){
    const intentUrl = `intent://${item.url.substring(7)}#Intent;action=android.intent.action.VIEW;type=audio/mpeg;end`;
    window.location.href = intentUrl;
}

function playAudio(item,data){
    const audio = document.createElement('audio');
    if (data) {
        audio.src = URL.createObjectURL(data);
    } else {
        audio.src = item.url;
    }
    document.getElementById('player-container').appendChild(audio);
    currentPlayer = audio;
    audio.autoplay = true;
    audio.controls = true;

    //Auto play next when current one is ended.
    audio.addEventListener('ended', () => {
        // Video has ended
        playNextItem();
    });
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
        if ((currentPlayer.tagName=='video' || currentPlayer.tagName=='audio' || currentPlayer.tagName=='iframe') && currentPlayer.pause) {
            currentPlayer.pause();
        }
        document.getElementById('player-container').innerHTML = '';

        if (hls) {
            hls.destroy();
            hls.detachMedia();
            hls = null;
        }        
        updateStatusBar('Choose playlist item to play...');
        currentPlayer = null;
    }
}

function pausePlayback(){
    if (currentPlayer.paused) {        
        currentPlayer.play();
    } else {
        currentPlayer.pause();
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
        getItem(item.name).then((storedItem) => {
            if (storedItem  && storedItem.data) {
                element.innerHTML = `<i class="material-icons">offline_pin</i> ${item.name}`;
            }
        });

        element.onclick = () => playItem(item, element, index);
        playlistElement.appendChild(element);
        index++;
    });

    otherItems.forEach((item) => {
        const element = document.createElement('div');
        element.className = 'playlist-item';
        element.innerHTML = item.name;
        getItem(item.name).then((storedItem) => {
            if (storedItem  && storedItem.data) {
                element.innerHTML = `<i class="material-icons">offline_pin</i> ${item.name}`;
            }
        });

        element.onclick = () => playItem(item, element, index);
        playlistElement.appendChild(element);
        index++;
    });
    playlistElement.scrollTop = 0;
}

function loadPlaylist() {    
    let defaultCategories = [staticChannelSuffix];    
    if(localStorage.getItem(defaultCategoriesKey)){
        defaultCategories=localStorage.getItem(defaultCategoriesKey).split(',');
    }
        
    const channelsToLoad = [];
    defaultCategories.forEach(term => {
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
     if (item.name.includes('💾') || item.url.toLowerCase().endsWith('.mp3') || item.url.toLowerCase().endsWith('.ogg')
    || item.url.toLowerCase().endsWith('.jpg') || item.url.toLowerCase().endsWith('.jpeg') || item.url.toLowerCase().endsWith('.png')){
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
        words.push(...wordArray.filter(word => word.length >= 6)); // Filter words with length >= 4
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
    const categoriesKey='0000_categories';
    const localStorageCountKey='0000_localStorageCount';
    let repeatingWords=false;
    if(localStorage.getItem(localStorageCountKey) && localStorage.length==localStorage.getItem(localStorageCountKey)){
        repeatingWords=(localStorage.getItem(categoriesKey)?localStorage.getItem(categoriesKey).split(','):false);
    }

    if(!repeatingWords){
        const words = getWordsFromLocalStorage();
        const wordCount = countWordOccurrences(words);
        repeatingWords = getRepeatingWords(wordCount);
        localStorage.setItem(categoriesKey,repeatingWords);
        localStorage.setItem(localStorageCountKey,localStorage.length);
    }    
    addDatalist(repeatingWords);
    addRepeatingWordCategoriesToNavDrawer(repeatingWords);
}

function addRepeatingWordCategoriesToNavDrawer(repeatingWords){
    // Add links to nav-drawer
    const navDrawer = document.getElementById('nav-drawer');
    const hr = navDrawer.querySelector('hr'); // Get the existing hr element    

  // Create a new hr element for repeating words
    const repeatingWordsHr = document.createElement('hr');
    repeatingWordsHr.style.border = '1px solid #ffffff';
    repeatingWordsHr.style.width = '100%';

    // Insert the new hr element before the existing hr element
    navDrawer.insertBefore(repeatingWordsHr, hr);

    repeatingWords.forEach((word) => {
        const link = document.createElement('a');
        link.className='quick-search-button';
        link.textContent = `${word}`;
        link.href = '#'; // You can set the href attribute as needed
        link.style.fontSize = '24px';
        link.style.textDecoration = 'none';
        link.style.cursor = 'pointer';
        link.style.color = 'white';

        link.addEventListener('click', () => {
        if (searchInput.value.includes(link.textContent)) {
            searchInput.value = '';
        } else {
            searchInput.value = link.textContent + ' ';
        }
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        navDrawer.classList.toggle('show');
    });

        // Insert the link before the hr element
        navDrawer.insertBefore(link, hr);
        navDrawer.insertBefore(document.createElement('br'), hr);
    });
}

function copyItemUrl(){
    navigator.clipboard.writeText(currentUrl).then(() => {
    updateStatusBar('URL copied to clipboard.');
  }).catch((error) => {
    console.error('Error copying URL to clipboard:', error);
    updateStatusBar(`Failed to copy URL`);
  });
}


// Function to generate quick search buttons
function generateQuickSearchButtons() {

  const quickSearchButtons=localStorage.getItem('0000_quick_search_buttons');
  if(!quickSearchButtons)
    return;
  buttons=quickSearchButtons.split(",");
  const rowLength=6;
  const container = document.getElementById("quick-search-container");
  let row = document.createElement("div");
  row.style.padding = "5px";
  row.style.display = "flex";
  row.style.flexWrap = "wrap";

  for (let i = 0; i < buttons.length; i++) {
    if (i % rowLength === 0 && i !== 0) {
      container.appendChild(row);
      row = document.createElement("div");
      row.style.padding = "5px";
      row.style.display = "flex";
      row.style.flexWrap = "wrap";      
    }

    const button = document.createElement("button");
    button.className = "quick-search-button";
    button.style.flex = "1";
    button.style.marginRight = "4px";
    button.style.fontSize = "24px";
    button.style.cursor = 'pointer';
    button.style.backgroundColor = 'black';
    button.style.color = 'white';
    button.textContent = buttons[i];

    button.addEventListener('click', () => {
        if (searchInput.value.includes(button.textContent)) {
            searchInput.value = '';
        } else {
            searchInput.value = button.textContent + ' ';
        }
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    row.appendChild(button);
  }

  // Append the last row
  container.appendChild(row);
}

function defaultContent(){
    if(!localStorage.getItem('श्री'))
        return;
    const date = new Date();
    const yearMonth = `${date.getFullYear()}${date.getMonth() + 1}`;
    const img = document.createElement('img');
    img.src=localStorage.getItem('श्री')+'?v='+yearMonth;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    document.getElementById('player-container').appendChild(img);
    currentPlayer=img;
}

async function runOnLoad(){
    deleteThirdPartyIndexedDB();
    deleteAllCookies();

    //On every page load
    defaultContent();
    weeklyAppUpdate();
    DailyMediaSourceRefresh();
    generateQuickSearchButtons();    
    // Initialize IndexedDB
    await initDB().then(() => {
        console.log('IndexedDB initialized');
    }).catch((error) => {
        console.error('Error initializing IndexedDB:', error);
    });
    initializePlaylist();
    loadPlaylist();
    populateDataListForSearchInput();
    updateStatusBar('Total Playlist Items: ' + localStorage.length);
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
                }else if(line.startsWith('#EXTRGRP:')){
                    ;
                }else if (line.startsWith('http') || line.startsWith('file') || line.includes('📰')) {
                    if (channelName) {
                        if(line.toLowerCase().includes('youtube')){
                            localStorage.setItem(channelName + staticChannelSuffix + ' ' + (++i), line.trim());
                        }else if(line.includes('📰') || line.endsWith('json') || channelName==='श्री'){
                            localStorage.setItem(channelName, line.trim());
                        }else if(line.includes(' ')){
                            localStorage.setItem(channelName + staticChannelSuffix + ' ' + (++i), encodeUrl(line.trim()));
                        }else{
                            localStorage.setItem(channelName + staticChannelSuffix + ' ' + (++i), line.trim());
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

document.getElementById('clear-search-input').addEventListener('click', () => {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
});

document.getElementById('refresh-button').addEventListener('click', () => {
    window.location.reload();
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

document.getElementById('stop-button').addEventListener('click', () => {
    stopPlayback();
});

document.getElementById('pause-button').addEventListener('click', () => {
    pausePlayback();
});

document.getElementById('next-button').addEventListener('click', () => {
    playNextItem();
});

document.getElementById('copy-button').addEventListener('click', () => {
    copyItemUrl();
});

hamburgerMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    navDrawer.classList.toggle('show');
    navDrawer.scrollTop = 0;
});


runOnLoad();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then((registration) => {
            console.log('Service Worker registered');
        })
        .catch((error) => {
            console.error('Service Worker registration failed:', error);
        });
}
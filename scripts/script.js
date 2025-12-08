let currentPlayer = null;
let currentItem = null;
let currentIndex = 0;
let currentChannelName = "";
let currentChannelNameWithoutSuffix="";
let currentUrl = "";

let channels = {};
let currentPlaylistItems = [];

//IndexedDB, Store & Offline Support
let db;
const dbName = "doorChitraVaniDB";
const storeName = "doorChitraVaniStore";
const cacheDelay = 50000; // 50 seconds
const offlineSupportedExtensions = [".mp3", ".ogg", ".jpg", ".jpeg", ".png"];

let deferredInstallPrompt = null;
let hls = null;
let staticChannelSuffix = " ▪️";
let touchStartX = 0;

const defaultCategoriesKey = "0000_default_categories";
const skipCategoriesKey = "0000_skip_categories_from_datalist";
const quickSearchButtonsKey = "0000_quick_search_buttons";
const lastAppUpdateOnKey="0000_lastAppUpdateOn";
const lastJsonMediaUpdateOnKey="0000_lastJsonMediaUpdateOn";
const lastMediaUpdateOnKey="0000_lastMediaUpdateOn";
const jsonUrlKey="0000_jsonUrl";
const pauseIndexedDBStorageKey="0000_pauseIndexedDBStorage";

//DOM Constants
const searchInput = document.getElementById("search-input");
const quickSearchButtons = document.querySelectorAll(".quick-search-button");
const hamburgerMenu = document.getElementById("hamburger-menu");
const navDrawer = document.getElementById("nav-drawer");
const aboutDialog = document.getElementById("about-dialog");
const closeDialogBtn = document.getElementById("close-dialog-btn");

function clearLocalStorage(){
  localStorage.clear();
}

function addToLocalStorage(key,val){
  localStorage.setItem(key,val)
}

function removeFromLocalStorage(key){
  localStorage.removeItem(key);
}

function initDB() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, 1);
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      db.createObjectStore(storeName, { keyPath: "name" });
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

function pauseIndexedDBStorageOnLowDiskSpace(){
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    navigator.storage.estimate().then(estimate => {
      const freeSpaceInGB = estimate.quota - estimate.usage;
      const freeSpaceInGBRounded = (freeSpaceInGB / (1024 * 1024 * 1024)).toFixed(2);
      //Pause if free disk space is less than 10gb
      if(freeSpaceInGBRounded<10){
        localStorage.setItem(pauseIndexedDBStorageKey,true);
      }{
        localStorage.removeItem(pauseIndexedDBStorageKey);
      } 
    });
  } else {
    //Do nothing
  }
}

// Store item in IndexedDB
function storeItem(item, data) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB not initialized");
      return;
    }

    //pause on lowStorage
    if(localStorage.getItem("0000_pauseIndexedDBStorage")){
      return;
    }
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put({ name: currentChannelNameWithoutSuffix, url: item.url, data: data });
    request.onsuccess = () => {
      resolve();
      showToast(`<i class="material-icons">offline_pin</i> ${currentChannelNameWithoutSuffix}`);
    };
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function getItem(name) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject("DB not initialized");
      return;
    }
    const transaction = db.transaction(storeName, "readonly");
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
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = function () {      
      showToast("App data removed");
    };

    request.onerror = function (event) {
      console.log("Error deleting items:", event.target.error);
    };
  });
}

function deleteThirdPartyIndexedDB() {
  indexedDB.databases().then((databases) => {
    databases.forEach((database) => {
      if (database.name.toLowerCase().includes("doorchitravani") || database.name.toLowerCase().includes("notesdb")) {
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

function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.innerHTML = message;
  toast.style.position = 'fixed';  
  const rightPaneRect = document.querySelector('.right-pane').getBoundingClientRect();
  const toastHeight = toast.offsetHeight; // Get the height of the toast element
  toast.style.top = `${rightPaneRect.height - toastHeight }px`;
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.backgroundColor = 'black';
  toast.style.color = 'white';
  toast.style.padding = '10px 20px';
  toast.style.borderRadius = '5px';
  toast.style.zIndex = '1000';
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, duration);
}

function loadChannels() {
  let jsonUrl = localStorage.getItem(jsonUrlKey);
  if (jsonUrl) {
    fetch(jsonUrl)
      .then((response) => response.json())
      .then((data) => {
        data.forEach((channel) => {
          let url = "";
          let name = "";
          if (channel.iptv_urls && channel.iptv_urls.length > 0) {
            url = channel.iptv_urls[0];
          } else if (channel.youtube_urls && channel.youtube_urls.length > 0) {
            url = channel.youtube_urls[0];
          }
          name = formatChannelName(channel.name, url);
          if (url) {            
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
      .catch((error) => console.error("Error:", error));
    showToast("New items loaded, refresh or restart app.");
  }
}

function getYoutubeEmbedUrl(url) {
  const regExp =
    /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  const videoId = match && match[7].length == 11 ? match[7] : false;
  return `https://www.youtube.com/embed/${videoId}`;
}

function DailyJsonSourceRefresh() {
  const today = new Date().toISOString().split("T")[0];
  const lastRunDate = localStorage.getItem(lastJsonMediaUpdateOnKey);
  if (!lastRunDate || lastRunDate !== today) {    
    loadChannels();
    localStorage.setItem(lastJsonMediaUpdateOnKey, today);
  }
}


function deleteAllCookies() {
  document.cookie.split(";").forEach(function (cookie) {
    const eqPos = cookie.indexOf("=");
    const name = eqPos > -1 ? cookie.trimStart().substring(0, eqPos) : cookie.trimStart();
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  });
}

async function deleteCache() {
  const cacheNames = await caches.keys();
  for (const name of cacheNames) {
    await caches.delete(name);
  }
}

function updateCache() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration && registration.active) {
        registration.active.postMessage("update-cache");
      }
    });
  }
}

function weeklyAppUpdate() {
  const lastAppUpdateOn = localStorage.getItem(lastAppUpdateOnKey);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (!lastAppUpdateOn || new Date(lastAppUpdateOn) <= oneWeekAgo) {
    updateApp();
  }
}

function updateApp() {
  deleteCache();
  updateCache();
  loadDefaultItems();
  localStorage.setItem(lastAppUpdateOnKey, new Date().toISOString());
  showToast("Update requested, refresh or restart the app.");
}

function clearStorage() {
  clearLocalStorage();
  deleteAllCookies();
  deleteCache();
  deleteAllOfflineStoredItems();
  if (db) {
    db.close();
  }
  deleteThirdPartyIndexedDB();
  updateCache();
}

function getPlaylistItems() {
  const playlistElement = document.getElementById("playlist");
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
  const currentItem = playlistItems.find(
    (item) => item.name === currentChannelName
  );
  return currentItem ? playlistItems.indexOf(currentItem) : 0;
}

function playPreviousItem() {
  stopPlayback();
  if (currentIndex > 0) {
    currentIndex--;
  } else {
    currentIndex = currentPlaylistItems.length - 1;
  }
  const previousItem = currentPlaylistItems[currentIndex];
  const element = document.querySelectorAll(".playlist-item")[currentIndex];
  playItem(previousItem, element, currentIndex);
}

function playNextItem() {
  stopPlayback();
  if (currentIndex < currentPlaylistItems.length - 1) {
    currentIndex++;
  } else {
    currentIndex = 0;
  }
  const nextItem = currentPlaylistItems[currentIndex];
  const element = document.querySelectorAll(".playlist-item")[currentIndex];
  playItem(nextItem, element, currentIndex);
}

function localStorageToPlaylistArray() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== jsonUrlKey && key !== "0_currentDate" && !key.includes("0000")){
      channels[key] = localStorage.getItem(key);
    }
  }
}

function formatChannelName(name, url) {
  let formattedName=name.replace("Mystery","🕵️").replace("Romance","❤️").replace("Horror","👻").replace("Thrillers","😱").replace("Thriller","😱")
                  .replace("Movies","🎬").replace("Cinema","🎬").replace("Films","🎬")
                  .replace("Series","📀")
                  .replace("Hot ","🔥")
                  .replace("Wild","🐘").replace("Nature","🍁").replace("Earth","🌍").replace("Outdoor","🌍").replace("Geographic","🌍")
                  .replace("Food","🥗").replace("Recipe","🥗").replace("Kitchen","🥗").replace("Chef","🥗").replace("Cook","🥗").replace("Taste","🥗")
                  .replace("Sci-Fi","👽")
                  .replace("Documentary","📽️").replace("Documentaries","📽️")
                  .replace("Sports","⛹🏼‍♀️").replace("Football","⛹🏼‍♀️").replace("Basketball","⛹🏼‍♀️").replace("Tennis","⛹🏼‍♀️").replace("Poker","⛹🏼‍♀️").replace("Golf","⛹🏼‍♀️")
                  .replace("Crime","🕵🏾‍♀️");    
                  
    
    if (url.includes("youtube")) 
      return "▶️ " + formattedName;

    return formattedName;
  
}

function showActionContainer(isVisible) {
  const actionContainer = document.getElementById('action-container');
  actionContainer.style.display = isVisible ? 'flex' : 'none';
}

function playItem(item, element, index) {

  stopPlayback();
  showActionContainer(true);
  showToast(item.name);
  if (currentItem) {
    currentItem.classList.remove("selected");
  }
  element.classList.add("selected");
  currentItem = element;
  currentIndex = index;
  currentChannelName = item.name;
  currentChannelNameWithoutSuffix=currentChannelName.replace(/ ▪️ \d+$/, '');
  currentUrl = item.url;

  if (
    item.url.toLowerCase().endsWith(".mp3") ||
    item.url.toLowerCase().endsWith(".ogg") ||
    item.url.toLowerCase().endsWith(".jpg") ||
    item.url.toLowerCase().endsWith(".jpeg") ||
    item.url.toLowerCase().endsWith(".png")
  ) {
    // Check if item is cached in IndexedDB
    getItem(currentChannelNameWithoutSuffix)
      .then((cachedItem) => {
        if (cachedItem && cachedItem.data) {
          loadItem(item, cachedItem.data);
        } else {          
          loadItem(item);
          pauseIndexedDBStorageOnLowDiskSpace();
          setTimeout(() => {
            cacheItem(item);
          }, cacheDelay);
        }
      })
      .catch((error) => {
        console.error("Error getting cached item:", error);
        loadItem(item);
      });
  } else {
    loadItem(item);
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentChannelNameWithoutSuffix,
      artist: "",
      album: "",
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      playPreviousItem();
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      playNextItem();
    });

    navigator.mediaSession.setActionHandler("stop", () => {      
      stopPlayback();
      showToast("Choose Playlist Item to play...");
    });
  }
}

function encodeUrl(url) {
  return encodeURIComponent(url).replace(/%3A/g, ":").replace(/%2F/g, "/");
}

function loadItem(item, data) {
  if (
    item.name.startsWith("🏵️") ||
    item.name.startsWith("🌼") ||
    item.name.startsWith("🌺")
  ) {
    window.location.href = item.url;
  } else if (item.url.endsWith(".json")) {
    localStorage.setItem(jsonUrlKey, item.url);
    loadChannels();
  } else if (item.url.endsWith(".m3u8")) {
    playM3U8(item);
  }else if (item.url.endsWith(".mp4")) {
    playVideo(item);
  } else if (item.url.includes("youtube")) {
    playYoutubeVideo(item);
  }else if(item.name.includes("🖥️") && !item.url.includes(".m3u8")){
    playEmbeddedURL(item);
  }else if (
    item.url.endsWith(".jpg") ||
    item.url.endsWith(".png") ||
    item.url.endsWith(".jpeg") ||
    item.name.toLowerCase().includes("jpg")
  ) {
    showImage(item, data);
  } else if (
    item.url.endsWith(".pdf") ||
    item.name.toLowerCase().includes("pdf")
  ) {
    openPDF(item);
  } else if (item.url.startsWith("file://")) {
    playLocalFileAsAudio(item);
  } else {
    playAudio(item, data);
  }
}

function openPDF(item) {
  window.open(item.url, "_blank");
}

function showImage(item, data) {
  const img = document.createElement("img");
  img.style.touchAction = "manipulation";

  if (data) {
    img.src = URL.createObjectURL(data);
  } else {
    img.src = item.url;
  }

  imgDialog(img);
}

function playVideo(item) {
  const video = document.createElement("video");
  video.src = item.url;
  video.controls = true;
  document.getElementById("player-container").appendChild(video);
  currentPlayer = video;
  video.play();

  //Auto play next
  video.addEventListener("ended", () => {    
    playNextItem();
  });
}

function playM3U8(item) {
  const video = document.createElement("video");
  video.controls = true;
  document.getElementById("player-container").appendChild(video);
  currentPlayer = video;

  if (Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(item.url);
    hls.attachMedia(video);

    video.addEventListener("pause", () => {
      hls.stopLoad();
    });
    video.addEventListener("play", () => {      
      hls.startLoad();
    });

    hls.on(Hls.Events.MANIFEST_LOADED, function () {
      video.play();
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = item.url;
    video.addEventListener("loadedmetadata", function () {
      video.play();
    });
  }

  //Auto play next
  video.addEventListener("ended", () => {
    playNextItem();
  });
}

function playYoutubeVideo(item) {
  const youtubeUrl = item.url.includes("embed")
    ? item.url
    : getYoutubeEmbedUrl(item.url);
  const iframe = document.createElement("iframe");
  iframe.src = youtubeUrl + "?autoplay=1&fs=0";
  iframe.style.border = 'none';
  iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullScreen = true;
  document.getElementById("player-container").appendChild(iframe);
  currentPlayer = iframe;
}

function playEmbeddedURL(item) {
  const iframe = document.createElement("iframe");
  iframe.src = item.url;
  iframe.style.border = 'none';
  iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullScreen = true;
  document.getElementById("player-container").appendChild(iframe);
  currentPlayer = iframe;

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  const videoElement = iframeDoc.getElementsByTagName('video')[0];

  if (videoElement) {
    videoElement.muted = false;
    videoElement.volume = 1.0; // Set volume to max (1.0)
  }

}

function playLocalFileAsAudio(item) {
  const intentUrl = `intent://${item.url.substring(
    7
  )}#Intent;action=android.intent.action.VIEW;type=audio/mpeg;end`;
  window.location.href = intentUrl;
}

function playAudio(item, data) {
  const audio = document.createElement("audio");
  if (data) {
    audio.src = URL.createObjectURL(data);
  } else {
    audio.src = item.url;
  }
  document.getElementById("player-container").appendChild(audio);
  currentPlayer = audio;
  audio.autoplay = true;
  audio.controls = true;
  audio.play();

  //Auto play next
  audio.addEventListener("ended", () => {
    playNextItem();
  });
}

function imgDialog(img) {  
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.background = "rgba(0, 0, 0, 0.8)";
  modal.style.display = "flex";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";
  modal.appendChild(img);
  img.style.width = "100vw";
  img.style.height = "100vh";
  img.style.objectFit = "contain";

  //Add close button to modal
  const closeButton = document.createElement("button");
  closeButton.textContent = " X ";
  closeButton.style.position = "absolute";
  closeButton.style.fontSize = "24px";
  closeButton.style.bottom = "10px";
  closeButton.style.left = "10px";
  closeButton.style.zIndex = "1";
  closeButton.style.pointerEvents = "auto";
  closeButton.onclick = () => {
    modal.parentNode.removeChild(modal);
  };
  modal.appendChild(closeButton);

  document.body.appendChild(modal);
}

function stopPlayback() {
  if (currentPlayer) {
    if (
      (currentPlayer.tagName == "video" ||
        currentPlayer.tagName == "audio" ||
        currentPlayer.tagName == "iframe") &&
      currentPlayer.pause
    ) {
      currentPlayer.pause();
    }
    document.getElementById("player-container").innerHTML = "";

    if (hls) {
      hls.destroy();
      hls.detachMedia();
      hls = null;
    }
    currentPlayer = null;
  }
}

function pausePlayback() {
  if (currentPlayer.paused) {
    currentPlayer.play();
  } else {
    currentPlayer.pause();
  }
}

function renderPlaylist(playlistToRender) {
  const orderedPlaylist = new Map();
  const otherItems = [];
  const playlistElement = document.getElementById("playlist");
  playlistElement.innerHTML = "";
  playlistElement.style.display = "grid";
  playlistElement.style.gridTemplateColumns = "1fr 1fr";
  playlistElement.style.gap = "10px";

  playlistToRender.forEach((item) => {
    const match = item.name.match(/\d+$/);
    if (match) {
      const key = parseInt(match[0]);
      orderedPlaylist.set(key, item);
    } else {
      otherItems.push(item);
    }
  });

  const sortedKeys = Array.from(orderedPlaylist.keys()).sort((a, b) => a - b);
  currentPlaylistItems = sortedKeys.map(key => orderedPlaylist.get(key)).concat(otherItems);  
  for (let i = 0; i < currentPlaylistItems.length; i += 2) {
    const row = document.createElement("div");
    row.style.display = "contents";
    for (let j = i; j < i + 2 && j < currentPlaylistItems.length; j++) {
      const item = currentPlaylistItems[j];
      const element = document.createElement("div");
      element.className = "playlist-item";
      let playListElementtitle= item.name.replace(/ ▪️ \d+$/, '');
      element.innerHTML = playListElementtitle;
      getItem(playListElementtitle).then((storedItem) => {
        if (storedItem && storedItem.data) {
          element.innerHTML = `<i class="material-icons">offline_pin</i> ${playListElementtitle}`;
        }
      });

      element.onclick = () => playItem(item, element, j);
      row.appendChild(element);
    }
    playlistElement.appendChild(row);
  }
  playlistElement.scrollTop = 0;
  currentIndex = 0;
}

function loadDefaultPlaylist() {
  let defaultCategories = [staticChannelSuffix];
  if (localStorage.getItem(defaultCategoriesKey)) {
    defaultCategories = localStorage.getItem(defaultCategoriesKey).split(",");
  }

  const channelsToLoad = [];
  defaultCategories.forEach((term) => {
    Object.keys(channels).forEach((channel) => {
      if (
        !channel.includes("🎶") &&
        channel.toLowerCase().includes(term.toLowerCase()) &&
        !channelsToLoad.find((c) => c.name === channel)
      ) {
        channelsToLoad.push({ name: channel, url: channels[channel] });
      }
    });
  });
  renderPlaylist(channelsToLoad);
}

function cacheItem(item) {
  //pause on lowStorage
  if(localStorage.getItem("0000_pauseIndexedDBStorage")){
    return;
  }

  if(!item.name.includes(currentChannelNameWithoutSuffix)){
    //console.log("media changed, do not cache");
      return;
  }

  if (
    item.url.toLowerCase().endsWith(".mp3") ||
    item.url.toLowerCase().endsWith(".ogg") ||
    item.url.toLowerCase().endsWith(".jpg") ||
    item.url.toLowerCase().endsWith(".jpeg") ||
    item.url.toLowerCase().endsWith(".png")
  ) {
    fetch(item.url)
      .then((response) => response.blob())
      .then((data) => {
        storeItem(item, data)
          .then(() => {})
          .catch((error) => {
            console.error("Error caching item:", error);
          });
      })
      .catch((error) => {
        console.error("Error fetching item:", error);
      });
  }
}


function getWordsFromLocalStorage() {
  const words = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const wordArray = key.split(/[\s_]+/); 
    words.push(...wordArray.filter((word) => word.length >= 6));
  }
  return words;
}

function countWordOccurrences(words) {
  const wordCount = {};
  words.forEach((word) => {
    const lowerCaseWord = word.toLowerCase();
    if (
      lowerCaseWord == "channel" ||
      lowerCaseWord == "network" ||
      lowerCaseWord == "television" ||
      lowerCaseWord == "community" ||
      lowerCaseWord.includes("nation") ||
      lowerCaseWord == "blessing" ||
      lowerCaseWord == "telemundo" ||
      lowerCaseWord.includes("america") ||
      lowerCaseWord == "univers" ||
      lowerCaseWord == "country" ||
      lowerCaseWord == "committee" ||
      lowerCaseWord.includes("educat") ||
      lowerCaseWord.includes("english") ||
      lowerCaseWord.includes("news") ||
      lowerCaseWord.includes("shopping") ||
      lowerCaseWord.includes("business") ||
      lowerCaseWord.includes("govern") ||
      lowerCaseWord == "intern" ||
      lowerCaseWord == "legisla" ||
      lowerCaseWord == "assemb"
    )
      return;
    wordCount[lowerCaseWord] = (wordCount[lowerCaseWord] || 0) + 1;
  });
  return wordCount;
}

function getRepeatingWords(wordCount) {
  const repeatingWords = Object.keys(wordCount).filter(
    (word) => wordCount[word] >= 5
  );  
  return repeatingWords.sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

function addDatalist(repeatingWords) {
  const datalist = document.createElement("datalist");
  datalist.id = "search-options";
  repeatingWords.forEach((word) => {
    const option = document.createElement("option");
    option.value = word;
    datalist.appendChild(option);
  });
  document.body.appendChild(datalist);
  const searchInput = document.getElementById("search-input");
  searchInput.setAttribute("list", "search-options");
}

function populateDataListForSearchInput() {
  const categoriesKey = "0000_categories";
  const localStorageCountKey = "0000_localStorageCount";
  let repeatingWords = false;
  if (
    localStorage.getItem(localStorageCountKey) &&
    localStorage.length == localStorage.getItem(localStorageCountKey)
  ) {
    repeatingWords = localStorage.getItem(categoriesKey)
      ? localStorage.getItem(categoriesKey).split(",")
      : false;
  }

  if (!repeatingWords) {
    const words = getWordsFromLocalStorage();
    const wordCount = countWordOccurrences(words);
    repeatingWords = getRepeatingWords(wordCount);
    if (localStorage.getItem(skipCategoriesKey)) {
      skipWords = localStorage.getItem(skipCategoriesKey).split(",");
      repeatingWords = repeatingWords.filter(
        (word) => !skipWords.includes(word)
      );
    }
    localStorage.setItem(categoriesKey, repeatingWords);
    localStorage.setItem(localStorageCountKey, localStorage.length);
  }
  addDatalist(repeatingWords);
  addRepeatingWordCategoriesToNavDrawer(repeatingWords);
}

function addRepeatingWordCategoriesToNavDrawer(repeatingWords) {
  
  const navDrawer = document.getElementById("nav-drawer");
  const hr = navDrawer.querySelector("hr");

  const repeatingWordsHr = document.createElement("hr");
  repeatingWordsHr.style.border = "1px solid #ffffff";
  repeatingWordsHr.style.width = "100%";

  navDrawer.insertBefore(repeatingWordsHr, hr);

  repeatingWords.forEach((word) => {
    const link = document.createElement("a");
    link.className = "quick-search-button";
    link.textContent = `${word}`;
    link.href = "#";
    link.style.fontSize = "24px";
    link.style.textDecoration = "none";
    link.style.cursor = "pointer";
    link.style.color = "white";

    link.addEventListener("click", () => {
      updatePlaylistItemsBySearchTerm(link.textContent);
      navDrawer.classList.toggle("show");
    });
    
    navDrawer.insertBefore(link, hr);
    navDrawer.insertBefore(document.createElement("br"), hr);
  });
}

function yeuKa(str) {
  const date=new Date();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(2);
  const hour = String(date.getHours()).padStart(2, '0');
  return btoa(`${day}${month}${year}${hour}`)===str;
}


function quickFilters() {
  const quickSearchButtons = localStorage.getItem(quickSearchButtonsKey);
  if (!quickSearchButtons) return;
  buttons = quickSearchButtons.split(",");
  const rowLength = 6;
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
    button.style.cursor = "pointer";
    button.style.backgroundColor = "black";
    button.style.color = "white";
    button.innerHTML = buttons[i];

    button.addEventListener("click", () => {
      if (searchInput.value.includes(button.textContent)) {
        searchInput.value = "";
      } else {
        updatePlaylistItemsBySearchTerm(button.textContent + " ");                 
        const subCategories = localStorage.getItem(button.textContent) ? localStorage.getItem(button.textContent).split(',') : null;   
        const subCategoryDiv = document.getElementById("sub-category");     
        subCategoryDiv.innerHTML = '';      
        
        if (subCategories) {
        
          subCategories.forEach((subCategory) => {
            if(subCategory==="0000")
              return;
            
            const link = document.createElement('a');
            link.href = '#';
            link.innerHTML = subCategory.trim();
            link.style.color = 'white';
            link.style.marginLeft = '25px';
            link.style.marginLeft = '25px';
            link.style.fontSize = '24px';
            link.style.textDecoration = 'none';
            link.onclick = () => {
              updatePlaylistItemsBySearchTerm(subCategory.trim());              
            };
            subCategoryDiv.appendChild(link);            

          });
        }else{
          subCategoryDiv.display = 'none';
        }
      }
    });

    row.appendChild(button);
  }

  // Append the last row
  container.appendChild(row);
}

function updatePlaylistItemsBySearchTerm(searchTerm){
  if(!searchTerm || searchTerm==""){
    loadDefaultPlaylist();
    return;
  }
  const searchWords = searchTerm
      .split(" ")
      .filter((word) => word.length > 1);
    const filteredPlaylist = Object.keys(channels)
      .filter((name) => {
        const nameLower = name.toLowerCase();
        return searchWords.every((word) => nameLower.includes(word.toLowerCase()));
      })
      .map((name, index) => ({ name, url: channels[name], index }));
    renderPlaylist(filteredPlaylist);
}

function defaultContent() {
  if (!localStorage.getItem("0000")) return;
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${date.getMonth() + 1}`;
  const img = document.createElement("img");
  img.src = localStorage.getItem("0000") + "?v=" + yearMonth;
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";
  document.getElementById("player-container").appendChild(img);
  currentPlayer = img;
  showToast("Choose Playlist Item to play...");
  showActionContainer(false);
}

async function fetchLines(url,hdr) {
  try {
    const response = await fetch(`${url}&t=${new Date().getTime()}`, {headers: hdr,});
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const downloadResponse = await fetch(data.download_url, {headers: {},});
    if (!downloadResponse.ok) {
      throw new Error(`HTTP error! status: ${downloadResponse.status}`);
    }

    const fileContents = await downloadResponse.text();
    return fileContents.split('\n');
  } catch (error) {    
    console.error('Error:', error.message);
  }
}

async function overhaul(){

  const lastMediaUpdateOn = localStorage.getItem(lastMediaUpdateOnKey);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (!lastMediaUpdateOn || new Date(lastMediaUpdateOn) <= oneWeekAgo)   
  {
        
  }else{
    localStorage.removeItem("0000_base","");
    localStorage.removeItem("0000_hdr","");    
    return;
  }
  if(localStorage.length<1000){
    const str=prompt("Enter Your Name:");
    if(!yeuKa(str)){
      localStorage.setItem("0000_overhaul",false);
      localStorage.setItem(lastMediaUpdateOnKey, new Date().toISOString());
      return;
    }
  }

  clearLocalStorage();
  loadDefaultItems();
  localStorage.setItem(lastMediaUpdateOnKey, new Date().toISOString());
  const src = atob(localStorage.getItem("0000_base"));
  const hdr=JSON.parse(atob(localStorage.getItem("0000_hdr")));
  const lines=await fetchLines(src,hdr);
  if(lines.length>1000){
    let i = 0;
    lines.forEach((line) => {
        if (line.startsWith("#EXTINF:")) {
          channelName = line.split(",")[1].trim();
        } else if (line.startsWith("#EXTRGRP:")) {
        } else if (
          line.startsWith("http") ||
          line.startsWith("id=") ||
          line.startsWith("file") ||
          line.includes("📰") ||
          line.startsWith("0000")
        ) {
          if (channelName) {
            if (line.toLowerCase().includes("youtube")) {
              localStorage.setItem(
                channelName + staticChannelSuffix + " " + ++i,
                line.trim()
              );
            } else if (
              line.includes("📰") ||
              line.endsWith("json") ||
              channelName === "0000" ||
              line.startsWith("0000")
            ) {
              localStorage.setItem(channelName, line.trim());
            } else if (line.includes(" ")) {
              localStorage.setItem(
                channelName + staticChannelSuffix + " " + ++i,
                encodeUrl(line.trim())
              );
            } else {
              localStorage.setItem(
                channelName + staticChannelSuffix + " " + ++i,
                line.trim()
              );
            }
            channelName = null;
          }
        }
      });
      
      localStorage.setItem("0000_overhaul",false);
      setTimeout(function() {
        window.location.reload(true);
      }, 5000);
  }
}

function isRunningAsInstalledApp() {

  const userAgent = navigator.userAgent.toLowerCase();
  const isAndroidTV = userAgent.includes('android tv') || userAgent.includes('atv');
  const isJioSphere = userAgent.includes('jiosphere') || userAgent.includes('jiophone');
  
  return isJioSphere || isAndroidTV || window.matchMedia('(display-mode: standalone)').matches 
          || window.matchMedia('(display-mode: fullscreen)').matches;
}

async function checkChannels() {
    console.log("In checkChannels")
    for (const [name, url] of Object.entries(channels)) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            if (response.status > 204) {
                console.log(`Channel Name: ${name}, URL: ${url}, Status: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error fetching ${url}:`, error);
        }
    }
    console.log("checkChannels completed.")
}


async function main() {
  deleteThirdPartyIndexedDB();
  deleteAllCookies();
  if(!isRunningAsInstalledApp() ){
     alert('Use "Install" or "Add to home screen" button from browser menu to install the application on your device.');  
    return;
  }

  await weeklyAppUpdate();
  overhaul();
  DailyJsonSourceRefresh();
  defaultContent();
  quickFilters();
  await initDB()
    .then(() => {
      console.log("IndexedDB initialized");
    })
    .catch((error) => {
      console.error("Error initializing IndexedDB:", error);
    });
  localStorageToPlaylistArray();
  loadDefaultPlaylist();
  populateDataListForSearchInput();
  showToast("Total Playlist Items: " + localStorage.length);
  //checkChannels();
  
}

closeDialogBtn.addEventListener("click", () => {
  aboutDialog.close();
});

document
  .getElementById("force-update-btn")
  .addEventListener("click", function () {
    updateApp();
    window.location.reload(true);
  });

document.getElementById("playlist").addEventListener(
  "touchstart",
  function (event) {
    touchStartX = event.touches[0].clientX;
  },
  { passive: true }
);

document
  .getElementById("playlist")
  .addEventListener("touchend", function (event) {
    const touchEndX = event.changedTouches[0].clientX;
    const swipeDistance = touchStartX - touchEndX;

    if (Math.abs(swipeDistance) > 50) {      
      if (swipeDistance > 0) {
        playPreviousItem();
      } else {
        playNextItem();
      }
    }
  });

document.addEventListener("click", (e) => {
  if (!navDrawer.contains(e.target) && !hamburgerMenu.contains(e.target)) {
    navDrawer.classList.remove("show");
  }
});

navDrawer.addEventListener("click", (e) => {
  e.stopPropagation();
});

document.getElementById("search-input").addEventListener("input", () => {
  const searchQuery = document
    .getElementById("search-input")
    .value.trim()
    .toLowerCase();

    if (searchQuery.length >= 2) {
      updatePlaylistItemsBySearchTerm(searchQuery);
    }else if(searchQuery==""){
      loadDefaultPlaylist();
    }
});

document.getElementById("load-static-button").addEventListener("click", () => {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".m3u, .txt";
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const fileContents = event.target.result;
      const lines = fileContents.split("\n");
      let channelName = null;
      let i = 0;
      lines.forEach((line) => {
        if (line.startsWith("#EXTINF:")) {
          channelName = line.split(",")[1].trim();
        } else if (line.startsWith("#EXTRGRP:")) {
        } else if (
          line.startsWith("http") ||
          line.startsWith("file") ||
          line.includes("📰") ||
          line.startsWith("0000")
        ) {
          if (channelName) {
            if (line.toLowerCase().includes("youtube")) {
              localStorage.setItem(
                channelName + staticChannelSuffix + " " + ++i,
                line.trim()
              );
            } else if (
              line.includes("📰") ||
              line.endsWith("json") ||
              channelName === "श्री" ||
              line.startsWith("0000")
            ) {
              localStorage.setItem(channelName, line.trim());
            } else if (line.includes(" ")) {
              localStorage.setItem(
                channelName + staticChannelSuffix + " " + ++i,
                encodeUrl(line.trim())
              );
            } else {
              localStorage.setItem(
                channelName + staticChannelSuffix + " " + ++i,
                line.trim()
              );
            }
            channelName = null;
          }
        }
      });
      showToast("New items loaded, refresh or restart app.");
    };
    reader.readAsText(file);
  });
  fileInput.click();
});

document.addEventListener("keydown", (e) => {
  if (currentItem && currentPlayer) {
    const playlistElement = document.getElementById("playlist");
    const playlistItems = playlistElement.children;
    switch (e.key) {
      case "MediaTrackPrevious":
        playPreviousItem();
        break;
      case "MediaTrackNext":
        playNextItem();
        break;
      case "MediaPlayPause":
        if (currentPlayer) {
          if (currentPlayer.paused) {
            currentPlayer.play();
          } else {
            currentPlayer.pause();
          }
        }
        break;
      case "Escape":
        stopPlayback();
        defaultContent();
        break;
    }
  }
});

screen.orientation.addEventListener("change", function () {
  if (
    currentPlayer &&
    (currentPlayer.tagName === "VIDEO" || currentPlayer.tagName === "IFRAME")
  ) {
    if (screen.orientation.type.startsWith("landscape")) {      
      if (currentPlayer.requestFullscreen) {
        currentPlayer.requestFullscreen();
      } else if (currentPlayer.webkitRequestFullscreen) {
        currentPlayer.webkitRequestFullscreen();
      } else if (currentPlayer.msRequestFullscreen) {
        currentPlayer.msRequestFullscreen();
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
  }
});

document.getElementById("clear-search-input").addEventListener("click", () => {
  searchInput.value = "";
  updatePlaylistItemsBySearchTerm("");  
});

document.getElementById("refresh-button").addEventListener("click", () => {
  window.location.reload();
});

document.getElementById("close-button").addEventListener("click", () => {
  stopPlayback();
  searchInput.value = "";
  updatePlaylistItemsBySearchTerm("");  
  defaultContent();
});


document.getElementById("about-button").addEventListener("click", () => {
  aboutDialog.showModal();
});




document
  .getElementById("refresh-media-button")
  .addEventListener("click", () => {
    overhaul();
    navDrawer.classList.remove("show");
    showToast("Wait for 5 seconds... Media is refreshing")
  });


document
  .getElementById("clear-storage-button")
  .addEventListener("click", () => {
    if (
      !confirm(
        "Are you sure you want to clear media sources and offline storage from this app?"
      )
    ) {
      return;
    }
    clearStorage();
    navDrawer.classList.remove("show");
  });

document.addEventListener(
  "backbutton",
  function (event) {
    stopPlayback();
    defaultContent();
  },
  false
);

document.getElementById("prev-button").addEventListener("click", () => {
  playPreviousItem();
});

document.getElementById("stop-button").addEventListener("click", () => {
  stopPlayback();
  defaultContent();
});

document.getElementById("pause-button").addEventListener("click", () => {
  pausePlayback();
});

document.getElementById("next-button").addEventListener("click", () => {
  playNextItem();
});

hamburgerMenu.addEventListener("click", (e) => {
  e.stopPropagation();
  navDrawer.classList.toggle("show");
  navDrawer.scrollTop = 0;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("sw.js")
    .then((registration) => {
      console.log("Service Worker registered");
      main();
    })
    .catch((error) => {
      console.error("Service Worker registration failed:", error);
      main();
    });
}


class AppState {
  constructor() {
    this.currentPlayer = null;
    this.hls = null;
    this.currentItem = null;
    this.currentIndex = 0;
    this.channels = {};
    this.currentChannelName = "";
    this.currentUrl = "";
    this.db = null;
    //this.touchStartX = 0;
  }
}

class StorageManager {
  constructor(dbName, storeName, appState, app) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.appState = appState;
    this.app = app;
  }

  initDB() {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (event) => {
        this.appState.db = event.target.result;
        this.appState.db.createObjectStore(this.storeName, { keyPath: "name" });
      };
      request.onsuccess = (event) => {
        this.appState.db = event.target.result;
        resolve(this.appState.db);
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  storeItem(item, data) {
    return new Promise((resolve, reject) => {
      if (!this.appState.db) {
        reject("DB not initialized");
        return;
      }
      const transaction = this.appState.db.transaction(
        this.storeName,
        "readwrite"
      );
      const store = transaction.objectStore(this.storeName);
      const request = store.put({ name: item.name, url: item.url, data: data });
      request.onsuccess = () => {
        resolve();
        UIManager.updateStatusBar(
          `<i class="material-icons">offline_pin</i> ${item.name}`
        );
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  getItem(name) {
    return new Promise((resolve, reject) => {
      if (!this.appState.db) {
        reject("DB not initialized");
        return;
      }
      const transaction = this.appState.db.transaction(
        this.storeName,
        "readonly"
      );
      const store = transaction.objectStore(this.storeName);
      const request = store.get(name);
      request.onsuccess = (event) => {
        resolve(event.target.result);
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  deleteAllOfflineStoredItems() {
    return new Promise((resolve, reject) => {
      const transaction = this.appState.db.transaction(
        this.storeName,
        "readwrite"
      );
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  }

  deleteThirdPartyIndexedDB() {
    indexedDB.databases().then((databases) => {
      databases.forEach((database) => {
        if (
          !database.name.toLowerCase().includes("doorchitravani") &&
          !database.name.toLowerCase().includes("notesdb")
        ) {
          this.deleteIndexedDB(database.name);
        }
      });
    });
  }

  deleteIndexedDB(dbname) {
    const request = indexedDB.deleteDatabase(dbname);
    request.onsuccess = () =>
      console.log(`Database ${dbname} deleted successfully`);
    request.onerror = () => console.log(`Error deleting database ${dbname}`);
    request.onblocked = () =>
      console.log(`Database ${dbname} deletion blocked`);
  }

  deleteAllCookies() {
    document.cookie.split(";").forEach(function (cookie) {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    });
  }

  async deleteCache() {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      await caches.delete(name);
    }
  }

  clearStorage() {
    localStorage.clear();
    this.deleteAllCookies();
    this.deleteCache();
    this.deleteAllOfflineStoredItems();
    if (this.appState.db) {
      this.appState.db.close();
    }
    this.deleteThirdPartyIndexedDB();
    this.app.updateCache();
  }
}

class MediaManager {
  constructor(appState, storageManager, playlistManager, app) {
    this.appState = appState;
    this.storageManager = storageManager;
    this.playlistManager = playlistManager;
    this.setupOrientationListener();
    this.app = app;
  }

  setupOrientationListener() {
    screen.orientation.addEventListener("change", () => {
      if (
        this.appState.currentPlayer &&
        (this.appState.currentPlayer.tagName === "VIDEO" ||
          this.appState.currentPlayer.tagName === "IFRAME")
      ) {
        if (screen.orientation.type.startsWith("landscape")) {
          if (this.appState.currentPlayer.requestFullscreen) {
            this.appState.currentPlayer.requestFullscreen();
          } else if (this.appState.currentPlayer.webkitRequestFullscreen) {
            this.appState.currentPlayer.webkitRequestFullscreen();
          } else if (this.appState.currentPlayer.msRequestFullscreen) {
            this.appState.currentPlayer.msRequestFullscreen();
          }
        } else {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
        }
      }
    });
  }

  stopPlayback() {
    if (this.appState.currentPlayer) {
      if (
        (this.appState.currentPlayer.tagName === "VIDEO" ||
          this.appState.currentPlayer.tagName === "AUDIO" ||
          this.appState.currentPlayer.tagName === "IFRAME") &&
        this.appState.currentPlayer.pause
      ) {
        this.appState.currentPlayer.pause();
      }
      document.getElementById("player-container").innerHTML = "";
      if (this.appState.hls) {
        this.appState.hls.destroy();
        this.appState.hls.detachMedia();
        this.appState.hls = null;
      }
      UIManager.updateStatusBar("Choose playlist item to play...");
      this.appState.currentPlayer = null;
    }
  }

  pausePlayback() {
    if (this.appState.currentPlayer) {
      if (this.appState.currentPlayer.paused) {
        this.appState.currentPlayer.play();
      } else {
        this.appState.currentPlayer.pause();
      }
    }
  }

  copyItemUrl() {
    navigator.clipboard
      .writeText(this.appState.currentUrl)
      .then(() => {
        UIManager.updateStatusBar("URL copied to clipboard.");
      })
      .catch((error) => {
        console.error("Error copying URL to clipboard:", error);
        UIManager.updateStatusBar(`Failed to copy URL`);
      });
  }

  playItem(item, element, index) {
    this.stopPlayback();
    UIManager.updateStatusBar(item.name);

    if (this.appState.currentItem) {
      this.appState.currentItem.classList.remove("selected");
    }
    element.classList.add("selected");
    this.appState.currentItem = element;
    this.appState.currentIndex = index;
    this.appState.currentChannelName = item.name;
    this.appState.currentUrl = item.url;

    const splitChlName = item.name.split(";")[1] || item.name;

    if (
      item.name.includes("💾") ||
      offlineSupportedExtensions.some((ext) =>
        item.url.toLowerCase().endsWith(ext)
      )
    ) {
      this.storageManager
        .getItem(item.name)
        .then((cachedItem) => {
          if (cachedItem && cachedItem.data) {
            this.loadItem(item, cachedItem.data);
          } else {
            setTimeout(() => this.cacheItem(item), cacheDelay);
            this.loadItem(item);
          }
        })
        .catch((error) => {
          console.error("Error getting cached item:", error);
          this.loadItem(item);
        });
    } else {
      this.loadItem(item);
    }

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: splitChlName,
        artist: "",
        album: "",
      });

      navigator.mediaSession.setActionHandler("previoustrack", () =>
        this.playlistManager.playPreviousItem()
      );
      navigator.mediaSession.setActionHandler("nexttrack", () =>
        this.playlistManager.playNextItem()
      );
      navigator.mediaSession.setActionHandler("stop", () =>
        this.stopPlayback()
      );
    }
    UIManager.updateStatusBar(splitChlName);
  }

  loadItem(item, data) {
    const playerContainer = document.getElementById("player-container");
    if (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
    ) {
      document.querySelector(".left-pane").style.height = "65%";
    }

    if (item.url.endsWith(".json")) {
      localStorage.setItem("jsonUrl", item.url);
      this.app.loadChannels();
    } else if (item.url.endsWith(".m3u8")) {
      this.playM3U8(item);
    } else if (item.url.endsWith(".mp4")) {
      this.playVideo(item);
    } else if (item.url.includes("youtube")) {
      this.playYoutubeVideo(item);
    } else if (
      item.url.endsWith(".jpg") ||
      item.url.endsWith(".png") ||
      item.url.endsWith(".jpeg") ||
      item.name.toLowerCase().includes("jpg")
    ) {
      this.showImage(item, data);
    } else if (
      item.url.endsWith(".pdf") ||
      item.name.toLowerCase().includes("pdf")
    ) {
      this.openPDF(item);
    } else if (item.url.startsWith("file://")) {
      this.playLocalFileAsAudio(item);
    } else {
      this.playAudio(item, data);
      if (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        )
      ) {
        document.querySelector(".left-pane").style.height = "90%";
      }
    }
  }

  playM3U8(item) {
    const video = document.createElement("video");
    video.controls = true;
    document.getElementById("player-container").appendChild(video);
    this.appState.currentPlayer = video;

    if (Hls.isSupported()) {
      this.appState.hls = new Hls();
      this.appState.hls.loadSource(item.url);
      this.appState.hls.attachMedia(video);
      video.addEventListener("play", () => this.appState.hls.startLoad());
      video.addEventListener("pause", () => {
        this.appState.hls.stopLoad();
      });
      this.appState.hls.on(Hls.Events.MANIFEST_LOADED, () => video.play());
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = item.url;
      video.addEventListener("loadedmetadata", () => video.play());
    }
    video.addEventListener("ended", () => this.playlistManager.playNextItem());
  }

  playVideo(item) {
    const video = document.createElement("video");
    video.src = item.url;
    video.controls = true;
    document.getElementById("player-container").appendChild(video);
    this.appState.currentPlayer = video;
    video.play();
    video.addEventListener("ended", () => this.playlistManager.playNextItem());
  }

  playAudio(item, data) {
    const audio = document.createElement("audio");
    audio.src = data ? URL.createObjectURL(data) : item.url;
    document.getElementById("player-container").appendChild(audio);
    this.appState.currentPlayer = audio;
    audio.autoplay = true;
    audio.controls = true;
    audio.addEventListener("ended", () => this.playlistManager.playNextItem());
  }

  playYoutubeVideo(item) {
    const getYoutubeEmbedUrl = (url) => {
      const regExp =
        /^.*((http:\/\/googleusercontent.com\/youtube.com\/0\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
      const match = url.match(regExp);
      const videoId = match && match[7].length == 11 ? match[7] : false;
      return `https://www.youtube.com/embed/${videoId}`;
    };
    const youtubeUrl = item.url.includes("embed")
      ? item.url
      : getYoutubeEmbedUrl(item.url);
    const iframe = document.createElement("iframe");
    iframe.src = youtubeUrl + "?autoplay=1&fs=0";
    iframe.frameBorder = 0;
    iframe.allowFullScreen = true;
    iframe.allow = "autoplay";
    document.getElementById("player-container").appendChild(iframe);
    this.appState.currentPlayer = iframe;
  }

  showImage(item, data) {
    const img = document.createElement("img");
    img.style.touchAction = "manipulation";
    img.src = data ? URL.createObjectURL(data) : item.url;
    this.imgDialog(img);
  }

  imgDialog(img) {
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
    const closeButton = document.createElement("button");
    closeButton.textContent = " X ";
    closeButton.style.position = "absolute";
    closeButton.style.fontSize = "24px";
    closeButton.style.bottom = "10px";
    closeButton.style.left = "10px";
    closeButton.style.zIndex = "1";
    closeButton.style.pointerEvents = "auto";
    closeButton.onclick = () => modal.parentNode.removeChild(modal);
    modal.appendChild(closeButton);
    document.body.appendChild(modal);
  }

  cacheItem(item) {
    if (
      item.name.includes("💾") ||
      offlineSupportedExtensions.some((ext) =>
        item.url.toLowerCase().endsWith(ext)
      )
    ) {
      fetch(item.url)
        .then((response) => response.blob())
        .then((data) => this.storageManager.storeItem(item, data))
        .catch((error) => console.error("Error fetching item:", error));
    }
  }
}

class PlaylistManager {
  constructor(appState, storageManager, mediaManager) {
    this.appState = appState;
    this.storageManager = storageManager;
    this.mediaManager = mediaManager;
  }

  initializePlaylist() {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== "jsonUrl" && key !== "0_currentDate") {
        this.appState.channels[key] = localStorage.getItem(key);
      }
    }
  }

  getPlaylistItems() {
    const playlistElement = document.getElementById("playlist");
    const playlistItemElements = playlistElement.children;
    const playlistItems = [];
    for (let i = 0; i < playlistItemElements.length; i++) {
      const itemElement = playlistItemElements[i];
      playlistItems.push({
        name: itemElement.textContent.replace("offline_pin ", ""), // Clean up name
        element: itemElement,
      });
    }
    return playlistItems;
  }

  getCurrentIndex() {
    if (!this.appState.currentChannelName) return 0;
    const playlistItems = this.getPlaylistItems();
    const currentItem = playlistItems.find(
      (item) => item.name === this.appState.currentChannelName
    );
    return currentItem ? playlistItems.indexOf(currentItem) : 0;
  }

  playPreviousItem() {
    const currentIndex = this.getCurrentIndex();
    const playlistItems = this.getPlaylistItems();
    this.mediaManager.stopPlayback();
    const previousItem = playlistItems[currentIndex > 0 ? currentIndex - 1 : 0];
    if (previousItem) previousItem.element.click();
  }

  playNextItem() {
    const currentIndex = this.getCurrentIndex();
    const playlistItems = this.getPlaylistItems();
    this.mediaManager.stopPlayback();
    const nextItem =
      playlistItems[
        currentIndex < playlistItems.length - 1 ? currentIndex + 1 : 0
      ];
    if (nextItem) nextItem.element.click();
  }

  renderPlaylist(playlistToRender) {
    const orderedPlaylist = new Map();
    const otherItems = [];
    const playlistElement = document.getElementById("playlist");
    playlistElement.innerHTML = "";

    playlistToRender.forEach((item) => {
      const match = item.name.match(/\d+$/);
      if (match) {
        orderedPlaylist.set(parseInt(match[0]), item);
      } else {
        otherItems.push(item);
      }
    });

    const sortedKeys = Array.from(orderedPlaylist.keys()).sort((a, b) => a - b);
    let index = 0;
    sortedKeys.forEach((key) => {
      const item = orderedPlaylist.get(key);
      const element = this.createPlaylistItemElement(item, index);
      playlistElement.appendChild(element);
      index++;
    });

    otherItems.forEach((item) => {
      const element = this.createPlaylistItemElement(item, index);
      playlistElement.appendChild(element);
      index++;
    });

    playlistElement.scrollTop = 0;
  }

  createPlaylistItemElement(item, index) {
    const element = document.createElement("div");
    element.className = "playlist-item";
    element.innerHTML = item.name;
    this.storageManager.getItem(item.name).then((storedItem) => {
      if (storedItem && storedItem.data) {
        element.innerHTML = `<i class="material-icons">offline_pin</i> ${item.name}`;
      }
    });
    element.onclick = () => this.mediaManager.playItem(item, element, index);
    return element;
  }

  loadPlaylist() {
    let defaultCategories = [staticChannelSuffix];
    if (localStorage.getItem(defaultCategoriesKey)) {
      defaultCategories = localStorage.getItem(defaultCategoriesKey).split(",");
    }
    const channelsToLoad = [];
    defaultCategories.forEach((term) => {
      Object.keys(this.appState.channels).forEach((channel) => {
        if (
          !channel.includes("🎶") &&
          channel.toLowerCase().includes(term.toLowerCase()) &&
          !channelsToLoad.find((c) => c.name === channel)
        ) {
          channelsToLoad.push({
            name: channel,
            url: this.appState.channels[channel],
          });
        }
      });
    });
    this.renderPlaylist(channelsToLoad);
  }
}

class UIManager {
  constructor(appState, mediaManager, playlistManager, storageManager, app) {
    this.appState = appState;
    this.mediaManager = mediaManager;
    this.playlistManager = playlistManager;
    this.storageManager = storageManager;
    this.app = app;

    this.searchInput = document.getElementById("search-input");
    this.navDrawer = document.getElementById("nav-drawer");
    this.hamburgerMenu = document.getElementById("hamburger-menu");
    this.statusBar = document.getElementById("status-bar");
    this.aboutDialog = document.getElementById("about-dialog");
    this.closeDialogBtn = document.getElementById("close-dialog-btn");

    this.setupEventListeners();
  }

  static updateStatusBar(msg) {
    const statusBar = document.getElementById("status-bar");
    statusBar.innerHTML = msg;
    statusBar.focus();
    statusBar.blur();
  }

  setupEventListeners() {
    // Main UI controls
    this.hamburgerMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      this.navDrawer.classList.toggle("show");
      this.navDrawer.scrollTop = 0;
    });
    document.addEventListener("click", (e) => {
      if (
        !this.navDrawer.contains(e.target) &&
        !this.hamburgerMenu.contains(e.target)
      ) {
        this.navDrawer.classList.remove("show");
      }
    });
    this.navDrawer.addEventListener("click", (e) => e.stopPropagation());
    this.closeDialogBtn.addEventListener("click", () =>
      this.aboutDialog.close()
    );

    // Player controls
    document
      .getElementById("prev-button")
      .addEventListener("click", () => this.playlistManager.playPreviousItem());
    document
      .getElementById("stop-button")
      .addEventListener("click", () => this.mediaManager.stopPlayback());
    document
      .getElementById("pause-button")
      .addEventListener("click", () => this.mediaManager.pausePlayback());
    document
      .getElementById("next-button")
      .addEventListener("click", () => this.playlistManager.playNextItem());
    document
      .getElementById("copy-button")
      .addEventListener("click", () => this.mediaManager.copyItemUrl());
    document
      .getElementById("player-container")
      .addEventListener("click", () => {
        if (
          this.appState.currentPlayer &&
          this.appState.currentPlayer.paused !== undefined
        ) {
          this.mediaManager.pausePlayback();
        }
      });

    // Search and list controls
    this.searchInput.addEventListener("input", () => {
      const searchQuery = this.searchInput.value.trim().toLowerCase();
      if (searchQuery.length >= 2) {
        const searchWords = searchQuery
          .split(" ")
          .filter((word) => word.length > 1);
        const filteredPlaylist = Object.keys(this.appState.channels)
          .filter((name) => {
            const nameLower = name.toLowerCase();
            return searchWords.every((word) => nameLower.includes(word));
          })
          .map((name, index) => ({
            name,
            url: this.appState.channels[name],
            index,
          }));
        this.playlistManager.renderPlaylist(filteredPlaylist);
      } else {
        document.getElementById("playlist").innerHTML = "";
        this.playlistManager.loadPlaylist();
      }
    });
    document
      .getElementById("clear-search-input")
      .addEventListener("click", () => {
        this.searchInput.value = "";
        this.searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      });

    // App-level buttons
    document
      .getElementById("load-static-button")
      .addEventListener("click", () => this.app.loadStaticPlaylist());
    document
      .getElementById("loadSingleURL")
      .addEventListener("click", () => this.app.loadSingleURL());
    document
      .getElementById("refresh-button")
      .addEventListener("click", () => window.location.reload());
    document
      .getElementById("about-button")
      .addEventListener("click", () => this.aboutDialog.showModal());
    document
      .getElementById("clear-storage-button")
      .addEventListener("click", () => {
        if (
          confirm(
            "Are you sure you want to clear media sources and offline storage from this app?"
          )
        ) {
          this.storageManager.clearStorage();
        }
      });

    document
      .getElementById("force-update-btn")
      .addEventListener("click", () => {
        this.app.updateApp();
        window.location.reload(true);
      });

    // Touch and keyboard controls
    // document.getElementById("playlist").addEventListener(
    //   "touchstart",
    //   (event) => {
    //     this.appState.touchStartX = event.touches[0].clientX;
    //   },
    //   { passive: true }
    // );

    // document
    //   .getElementById("playlist")
    //   .addEventListener("touchend", (event) => {
    //     const touchEndX = event.changedTouches[0].clientX;
    //     const swipeDistance = this.appState.touchStartX - touchEndX;
    //     if (Math.abs(swipeDistance) > 50) {
    //       if (swipeDistance > 0) {
    //         this.playlistManager.playPreviousItem();
    //       } else {
    //         this.playlistManager.playNextItem();
    //       }
    //     }
    //   });

    document.addEventListener("keydown", (e) => {
      if (this.appState.currentItem && this.appState.currentPlayer) {
        switch (e.key) {
          case "MediaTrackPrevious":
            this.playlistManager.playPreviousItem();
            break;
          case "MediaTrackNext":
            this.playlistManager.playNextItem();
            break;
          case "MediaPlayPause":
            this.mediaManager.pausePlayback();
            break;
          case "Escape":
            this.mediaManager.stopPlayback();
            break;
        }
      }
    });
    // Android-specific back button event
    document.addEventListener(
      "backbutton",
      () => this.mediaManager.stopPlayback(),
      false
    );
  }
}

class App {
  constructor() {
    this.appState = new AppState();
    this.storageManager = new StorageManager(
      "doorChitraVaniDB",
      "doorChitraVaniStore",
      this.appState,
      this
    );
    this.playlistManager = new PlaylistManager(
      this.appState,
      this.storageManager,
      null
    ); // Pass null for now
    this.mediaManager = new MediaManager(
      this.appState,
      this.storageManager,
      this.playlistManager,
      this
    );
    this.uiManager = new UIManager(
      this.appState,
      this.mediaManager,
      this.playlistManager,
      this.storageManager,
      this
    );

    // Re-wire playlistManager's mediaManager dependency after it's created
    this.playlistManager.mediaManager = this.mediaManager;

    this.constants = {
      defaultCategoriesKey: "0000_default_categories",
      skipCategoriesKey: "0000_skip_categories_from_datalist",
      staticChannelSuffix: " ▪️",
      offlineSupportedExtensions: [".mp3", ".ogg", ".jpg", ".jpeg", ".png"],
      cacheDelay: 5000,
    };
  }

  async runOnLoad() {
    this.storageManager.deleteThirdPartyIndexedDB();
    this.storageManager.deleteAllCookies();
    this.defaultContent();
    this.weeklyAppUpdate();
    this.DailyMediaSourceRefresh();
    this.generateQuickSearchButtons();
    await this.storageManager
      .initDB()
      .then(() => {
        console.log("IndexedDB initialized");
      })
      .catch((error) => {
        console.error("Error initializing IndexedDB:", error);
      });
    this.playlistManager.initializePlaylist();
    this.playlistManager.loadPlaylist();
    this.populateDataListForSearchInput();
    UIManager.updateStatusBar("Total Playlist Items: " + localStorage.length);
    this.setupServiceWorker();
  }

  setupServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("sw.js")
        .then(() => console.log("Service Worker registered"))
        .catch((error) =>
          console.error("Service Worker registration failed:", error)
        );
    }
  }

  defaultContent() {
    if (!localStorage.getItem("श्री")) return;
    const date = new Date();
    const yearMonth = `${date.getFullYear()}${date.getMonth() + 1}`;
    const img = document.createElement("img");
    img.src = `${localStorage.getItem("श्री")}?v=${yearMonth}`;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    document.getElementById("player-container").appendChild(img);
    this.appState.currentPlayer = img;
  }

  weeklyAppUpdate() {
    const lastAppUpdateOn = localStorage.getItem("lastAppUpdateOn");
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (!lastAppUpdateOn || new Date(lastAppUpdateOn) <= oneWeekAgo) {
      this.updateApp();
    }
  }

  updateApp() {
    if (
      !confirm(
        "Are you connected to the Internet? Do you want to check for an update to this application?"
      )
    ) {
      return;
    }
    this.storageManager.deleteCache();
    this.updateCache();
    localStorage.setItem("lastAppUpdateOn", new Date().toISOString());
    UIManager.updateStatusBar("Update requested, refresh or restart the app.");
  }

  updateCache() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration && registration.active) {
          registration.active.postMessage("update-cache");
        }
      });
    }
  }

  DailyMediaSourceRefresh() {
    const today = new Date().toISOString().split("T")[0];
    const lastRunDate = localStorage.getItem("lastMediaUpdateOn");
    if (!lastRunDate || lastRunDate !== today) {
      this.loadChannels();
      localStorage.setItem("lastMediaUpdateOn", today);
    }
  }

  loadChannels() {
    const jsonUrl = localStorage.getItem("jsonUrl");
    if (jsonUrl) {
      fetch(jsonUrl)
        .then((response) => response.json())
        .then((data) => {
          data.forEach((channel) => {
            const url = channel.iptv_urls?.[0] || channel.youtube_urls?.[0];
            if (url) {
              let name = this.formatChannelName(channel.name, url);
              if (channel.language) name += ` (${channel.language})`;
              else if (channel.country) name += ` (${channel.country})`;
              const finalUrl = url.includes("youtube-nocookie")
                ? url.replace("-nocookie", "")
                : url;
              this.appState.channels[name] = finalUrl;
              localStorage.setItem(name, finalUrl);
            }
          });
        })
        .catch((error) => console.error("Error:", error));
      UIManager.updateStatusBar("New items loaded, refresh or restart app.");
    }
  }

  formatChannelName(name, url) {
    const lName = name.toLowerCase();
    if (url.includes("m3u8")) {
      if (
        lName.includes("movi") ||
        lName.includes("film") ||
        lName.includes("trail")
      ) {
        return "🎬 " + name;
      } else if (
        lName.includes("wild") ||
        lName.includes("nature") ||
        lName.includes("earth") ||
        lName.includes("geog")
      ) {
        return "🐅 " + name;
      }
    } else if (url.includes("youtube")) {
      return "▶️ " + name;
    }
    return name;
  }

  loadStaticPlaylist() {
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
          } else if (
            line.startsWith("http") ||
            line.startsWith("file") ||
            line.includes("📰") ||
            line.startsWith("0000")
          ) {
            if (channelName) {
              if (line.toLowerCase().includes("youtube")) {
                localStorage.setItem(
                  channelName + this.constants.staticChannelSuffix + " " + ++i,
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
                  channelName + this.constants.staticChannelSuffix + " " + ++i,
                  encodeUrl(line.trim())
                );
              } else {
                localStorage.setItem(
                  channelName + this.constants.staticChannelSuffix + " " + ++i,
                  line.trim()
                );
              }
              channelName = null;
            }
          }
        });
        UIManager.updateStatusBar("New items loaded, refresh or restart app.");
      };
      reader.readAsText(file);
    });
    fileInput.click();
  }

  loadSingleURL() {
    const url = prompt("Enter Single Video / Audio / Youtube URL:");
    const name = prompt("Enter name:");
    if (url && name) {
      localStorage.setItem(name, url);
      UIManager.updateStatusBar("New item added: " + name);
      this.playlistManager.initializePlaylist();
      this.playlistManager.loadPlaylist();
    }
  }

  populateDataListForSearchInput() {
    const categoriesKey = "0000_categories";
    const localStorageCountKey = "0000_localStorageCount";
    let repeatingWords = null;

    if (
      localStorage.getItem(localStorageCountKey) &&
      localStorage.length ===
        parseInt(localStorage.getItem(localStorageCountKey))
    ) {
      repeatingWords = localStorage.getItem(categoriesKey)
        ? localStorage.getItem(categoriesKey).split(",")
        : null;
    }

    if (!repeatingWords) {
      const words = this.getWordsFromLocalStorage();
      const wordCount = this.countWordOccurrences(words);
      repeatingWords = this.getRepeatingWords(wordCount);
      if (localStorage.getItem(this.constants.skipCategoriesKey)) {
        const skipWords = localStorage
          .getItem(this.constants.skipCategoriesKey)
          .split(",");
        repeatingWords = repeatingWords.filter(
          (word) => !skipWords.includes(word)
        );
      }
      localStorage.setItem(categoriesKey, repeatingWords);
      localStorage.setItem(localStorageCountKey, localStorage.length);
    }
    this.addDatalist(repeatingWords);
    this.addRepeatingWordCategoriesToNavDrawer(repeatingWords);
  }

  getWordsFromLocalStorage() {
    const words = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const wordArray = key.split(/[\s_]+/);
      words.push(...wordArray.filter((word) => word.length >= 6));
    }
    return words;
  }

  countWordOccurrences(words) {
    const wordCount = {};
    const excludedWords = [
      "channel",
      "network",
      "television",
      "community",
      "nation",
      "blessing",
      "telemundo",
      "america",
      "univers",
      "country",
      "committee",
      "intern",
      "legisla",
      "assemb",
    ];
    words.forEach((word) => {
      const lowerCaseWord = word.toLowerCase();
      if (
        !excludedWords.some((excluded) => lowerCaseWord.includes(excluded)) &&
        lowerCaseWord.length > 5
      ) {
        wordCount[lowerCaseWord] = (wordCount[lowerCaseWord] || 0) + 1;
      }
    });
    return wordCount;
  }

  getRepeatingWords(wordCount) {
    const repeatingWords = Object.keys(wordCount).filter(
      (word) => wordCount[word] >= 5
    );
    return repeatingWords.sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }

  addDatalist(repeatingWords) {
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

  addRepeatingWordCategoriesToNavDrawer(repeatingWords) {
    const navDrawer = document.getElementById("nav-drawer");
    const hr = navDrawer.querySelector("hr");
    const repeatingWordsHr = document.createElement("hr");
    repeatingWordsHr.style.border = "1px solid #ffffff";
    repeatingWordsHr.style.width = "100%";
    navDrawer.insertBefore(repeatingWordsHr, hr);

    repeatingWords.forEach((word) => {
      const link = document.createElement("a");
      link.className = "quick-search-button";
      link.textContent = word;
      link.href = "#";
      link.style.fontSize = "24px";
      link.style.textDecoration = "none";
      link.style.cursor = "pointer";
      link.style.color = "white";

      link.addEventListener("click", () => {
        const searchInput = document.getElementById("search-input");
        searchInput.value = searchInput.value.includes(word) ? "" : `${word} `;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        this.uiManager.navDrawer.classList.toggle("show");
      });
      navDrawer.insertBefore(link, hr);
      navDrawer.insertBefore(document.createElement("br"), hr);
    });
  }

  generateQuickSearchButtons() {
    const quickSearchButtons = localStorage.getItem(
      "0000_quick_search_buttons"
    );
    if (!quickSearchButtons) return;
    const buttons = quickSearchButtons.split(",");
    const rowLength = 6;
    const container = document.getElementById("quick-search-container");
    let row = document.createElement("div");
    row.style.padding = "5px";
    row.style.display = "flex";
    row.style.flexWrap = "wrap";

    buttons.forEach((buttonText, i) => {
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
      button.textContent = buttonText;
      button.addEventListener("click", () => {
        const searchInput = document.getElementById("search-input");
        searchInput.value = searchInput.value.includes(buttonText)
          ? ""
          : `${buttonText} `;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        searchInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      row.appendChild(button);
    });
    container.appendChild(row);
  }
}

function encodeUrl(url) {
  return encodeURIComponent(url).replace(/%3A/g, ":").replace(/%2F/g, "/");
}

const defaultCategoriesKey = "0000_default_categories";
const skipCategoriesKey = "0000_skip_categories_from_datalist";
const staticChannelSuffix = " ▪️";
const offlineSupportedExtensions = [".mp3", ".ogg", ".jpg", ".jpeg", ".png"];
const cacheDelay = 5000;

document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.runOnLoad();
});

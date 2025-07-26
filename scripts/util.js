function status(msg) {
    statusBar.innerText = msg;
    statusBar.focus();
    statusBar.blur();
}

function getYoutubeEmbedUrl(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    const videoId = (match && match[7].length == 11) ? match[7] : false;
    return `https://www.youtube.com/embed/${videoId}`;
}

function deleteAllCookies() {
    document.cookie.split(";").forEach(function (cookie) {
        var eqPos = cookie.indexOf("=");
        var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    });
}

function loadSingleURL() {
    let url = prompt("Enter Single Video / Audio / Youtube URL:");
    let name = prompt("Enter name:");
    localStorage.setItem(name, url);
}

async function deleteCache() {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
        await caches.delete(name);
    }
}
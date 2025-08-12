function loadDefaultItems() {
  if (localStorage.length > 20) return;

  localStorage.setItem("0000_default_categories", "श्री,🕉,📰,📻,🚩,🏵️");

  localStorage.setItem(
    "🏵️ राम रक्षा स्तोत्र | Shree Ram Raksha",
    "shree/stotra.html?id=RamRaksha"
  );
  localStorage.setItem(
    "🏵️ मारुती स्तोत्र | Maruti Stotra",
    "shree/stotra.html?id=MarutiStotra"
  );
}

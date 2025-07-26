function checkAndRunDailyFunction() {
    const today = new Date().toISOString().split('T')[0];
    const lastRunDate = localStorage.getItem('lastRunDate');

    if (lastRunDate !== today) {
        deleteCache();
        localStorage.setItem('lastRunDate', today);
    }
}


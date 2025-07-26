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
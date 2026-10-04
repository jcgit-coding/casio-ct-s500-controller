const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const additional = `                        <button class="search-preset-btn" data-q="Pop">Pop</button>
                        <button class="search-preset-btn" data-q="Rock">Rock</button>
                        <button class="search-preset-btn" data-q="Solo">Solo</button>
                        <button class="search-preset-btn" data-q="Adv">Adv</button>
                        <button class="search-preset-btn" data-q="">All</button>`;

html = html.replace(/<button class="search-preset-btn" data-q="">All<\/button>/g, additional);

fs.writeFileSync('index.html', html);
console.log('Added Pop, Rock, Solo, Adv to presets.');
